"""Dataset importer — PRD-021 §3 Sprint 14 (BL-259).

Pulls raw dataset bundles from external sources into
``ai-service/data/raw/<source>_<name>/``. Three sources supported:

  - **roboflow** — Roboflow Universe export (YOLOv8 format). Needs a
    ROBOFLOW_API_KEY env var; uses the `roboflow` Python client.
  - **open_images** — Google Open Images V7 detections. Uses FiftyOne's
    zoo loader so we can filter by class + max_samples without pulling
    the full ~9M image set.
  - **coco** — COCO 2017 subset, same FiftyOne mechanism.

The script does NOT convert to YOLO format (that's BL-260
``convert_dataset.py``) or apply quality filters (BL-261
``validate_dataset.py``). It only handles the network pull and writes
``dataset_meta.json`` next to the downloaded payload for the merge
step (BL-262) to consume.

Usage examples:

    # Roboflow
    python -m scripts.import_dataset \\
        --source roboflow \\
        --workspace WORKSPACE --project PROJECT --version 1 \\
        --output data/raw/roboflow_earbuds_v1

    # Open Images V7 (Mobile phone subset, 2000 images)
    python -m scripts.import_dataset \\
        --source open_images \\
        --classes "Mobile phone" \\
        --max-samples 2000 \\
        --output data/raw/oid_phone

    # COCO subset (phone + book, 1000 images)
    python -m scripts.import_dataset \\
        --source coco \\
        --classes "cell phone,book" \\
        --max-samples 1000 \\
        --output data/raw/coco_phone_book
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# ─────────────────────────── source backends ───────────────────────────

def import_roboflow(
    *,
    workspace: str,
    project: str,
    version: int,
    output: Path,
    api_key: str | None = None,
    fmt: str = "yolov8",
) -> dict[str, Any]:
    """Download a Roboflow Universe dataset export."""
    api_key = api_key or os.getenv("ROBOFLOW_API_KEY")
    if not api_key:
        raise SystemExit(
            "ROBOFLOW_API_KEY env var or --api-key required for Roboflow imports"
        )
    try:
        from roboflow import Roboflow  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit(
            "`pip install roboflow` to import from Roboflow Universe"
        ) from e

    output.mkdir(parents=True, exist_ok=True)
    rf = Roboflow(api_key=api_key)
    proj = rf.workspace(workspace).project(project)
    log.info("downloading Roboflow %s/%s v%d → %s", workspace, project, version, output)
    ds = proj.version(version).download(fmt, location=str(output))
    return {
        "source": "roboflow",
        "workspace": workspace,
        "project": project,
        "version": version,
        "format": fmt,
        "location": getattr(ds, "location", str(output)),
    }


def import_fiftyone_zoo(
    *,
    zoo_dataset: str,
    classes: list[str],
    max_samples: int,
    output: Path,
    split: str = "train",
) -> dict[str, Any]:
    """Download via FiftyOne zoo (handles Open Images V7 + COCO 2017)."""
    try:
        import fiftyone as fo  # type: ignore[import-not-found]
        import fiftyone.zoo as foz  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit(
            "`pip install fiftyone` to import from Open Images / COCO"
        ) from e

    output.mkdir(parents=True, exist_ok=True)
    name = f"{zoo_dataset.replace('-', '_')}_{split}_{int(datetime.now().timestamp())}"
    log.info(
        "loading FiftyOne zoo %s split=%s classes=%s max_samples=%d",
        zoo_dataset, split, classes, max_samples,
    )
    ds = foz.load_zoo_dataset(
        zoo_dataset,
        split=split,
        label_types=["detections"],
        classes=classes,
        max_samples=max_samples,
        dataset_name=name,
    )
    ds.export(
        export_dir=str(output),
        dataset_type=fo.types.YOLOv5Dataset,
    )
    return {
        "source": zoo_dataset,
        "split": split,
        "classes": classes,
        "max_samples": max_samples,
        "samples_exported": len(ds),
    }


# ─────────────────────────── meta + CLI ────────────────────────────────

def write_meta(output: Path, payload: dict[str, Any]) -> None:
    meta = {
        "imported_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    (output / "dataset_meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log.info("wrote dataset_meta.json (%d keys)", len(meta))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import external datasets to data/raw/ (PRD-021 §3 Sprint 14 BL-259)"
    )
    parser.add_argument("--source", required=True,
                        choices=["roboflow", "open_images", "coco"])
    parser.add_argument("--output", required=True, type=Path,
                        help="Output directory (created if missing)")
    parser.add_argument("--classes", default="",
                        help="Comma-separated class names (open_images/coco)")
    parser.add_argument("--max-samples", type=int, default=2000,
                        help="Cap on samples per split (open_images/coco)")
    parser.add_argument("--split", default="train",
                        help="Zoo split for open_images/coco (default: train)")
    # Roboflow-specific
    parser.add_argument("--workspace", help="Roboflow workspace slug")
    parser.add_argument("--project",   help="Roboflow project slug")
    parser.add_argument("--version",   type=int, help="Roboflow dataset version")
    parser.add_argument("--api-key",
                        help="Roboflow API key (or use ROBOFLOW_API_KEY env)")
    parser.add_argument("--format", dest="fmt", default="yolov8",
                        help="Roboflow export format (default: yolov8)")

    args = parser.parse_args(argv)

    if args.source == "roboflow":
        if not (args.workspace and args.project and args.version):
            parser.error("--workspace, --project, --version are required for roboflow")
        result = import_roboflow(
            workspace=args.workspace,
            project=args.project,
            version=args.version,
            output=args.output,
            api_key=args.api_key,
            fmt=args.fmt,
        )
    else:
        if not args.classes:
            parser.error(f"--classes is required for {args.source}")
        classes = [c.strip() for c in args.classes.split(",") if c.strip()]
        zoo_name = "open-images-v7" if args.source == "open_images" else "coco-2017"
        result = import_fiftyone_zoo(
            zoo_dataset=zoo_name,
            classes=classes,
            max_samples=args.max_samples,
            output=args.output,
            split=args.split,
        )

    write_meta(args.output, result)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())

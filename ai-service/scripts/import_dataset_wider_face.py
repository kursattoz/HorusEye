"""WIDER FACE importer — PRD-021 §3 Sprint 18 (BL-320).

WIDER FACE supplies our `face_covering` negative class — clean faces in
varied poses + lightings. We pull via FiftyOne zoo; if the WIDER FACE
plugin isn't installed FiftyOne raises clearly enough that the caller
knows what to install.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)


def fetch_wider_face(*, max_samples: int, output: Path) -> dict[str, object]:
    try:
        import fiftyone as fo  # type: ignore[import-not-found]
        import fiftyone.zoo as foz  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit("`pip install fiftyone` to import WIDER FACE") from e

    output.mkdir(parents=True, exist_ok=True)
    log.info("loading WIDER FACE via FiftyOne (max %d)", max_samples)
    ds = foz.load_zoo_dataset(
        "wider-face",
        split="train",
        max_samples=max_samples,
        dataset_name=f"wider_neg_{int(datetime.now().timestamp())}",
    )
    ds.export(export_dir=str(output), dataset_type=fo.types.YOLOv5Dataset)
    return {
        "source":          "wider-face",
        "max_samples":     max_samples,
        "samples_exported": len(ds),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import WIDER FACE subset (BL-320 face_covering negatives)"
    )
    parser.add_argument("--max-samples", type=int, default=3000)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    result = fetch_wider_face(max_samples=args.max_samples, output=args.output)
    (args.output / "dataset_meta.json").write_text(
        json.dumps(
            {**result, "imported_at": datetime.now(timezone.utc).isoformat()},
            indent=2, ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())

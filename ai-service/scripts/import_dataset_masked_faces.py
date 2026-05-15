"""MaskedFace-Net importer — PRD-021 §3 Sprint 18 (BL-320).

MaskedFace-Net (Cabani et al. 2021) is a synthetic mask-overlay set
built on FFHQ. Two splits: CMFD (correctly worn) + IMFD (incorrectly
worn). For face_covering we only need to know "face is occluded",
both subsets count as positives.

The set is mirrored on HuggingFace Datasets. We pull via HF rather
than the original Google Drive link because Drive's auth flow breaks
on headless CI.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)


def fetch_masked_face_net(*, max_samples: int, output: Path) -> dict[str, object]:
    try:
        from datasets import load_dataset  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit("`pip install datasets` to import from HuggingFace Hub") from e

    output.mkdir(parents=True, exist_ok=True)
    img_dir = output / "images"
    img_dir.mkdir(exist_ok=True)
    log.info("loading cabani/MaskedFace-Net via HF (max %d)", max_samples)

    ds = load_dataset("cabani/MaskedFace-Net", split=f"train[:{max_samples}]")
    count = 0
    for i, row in enumerate(ds):
        img = row.get("image")
        if img is None:
            continue
        path = img_dir / f"masked_{i:06d}.jpg"
        img.save(path, "JPEG", quality=90)
        count += 1

    return {
        "source":          "cabani/MaskedFace-Net",
        "max_samples":     max_samples,
        "samples_exported": count,
        "image_dir":       str(img_dir),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import MaskedFace-Net subset (BL-320 face_covering positives)"
    )
    parser.add_argument("--max-samples", type=int, default=3000)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    result = fetch_masked_face_net(max_samples=args.max_samples, output=args.output)
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

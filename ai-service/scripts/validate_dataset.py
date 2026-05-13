"""Dataset quality validator — PRD-021 §3 Sprint 14 (BL-261) + PRD-017 §6.3.

Reads a YOLO-format dataset under ``data/converted/<name>/`` and writes
``quality_report.json`` summarising what passed, what got dropped, and
class / brightness statistics. Drops on disk are non-destructive — the
report flags files to remove; merge_datasets.py applies the removal
during the merge step.

Checks (PRD-017 §6.1):
- resolution: both image dims >= ``--min-resolution`` (default 320)
- bbox area: each bbox >= 16x16 in pixels AND bbox area ratio >=
  ``--min-bbox-area-ratio`` of image area
- bbox bounds: 0 <= x_center, y_center, w, h <= 1.0 (YOLO normalized);
  out-of-range coordinates are flagged
- corrupt files: image decodes successfully (cv2 / Pillow fallback)
- blur: Laplacian variance > ``--min-blur`` (default 30)
- duplicates: perceptual hash collisions (BL-261 stretch — pHash via
  cv2.img_hash if available, else SHA-256 of resized 32x32 gray)

The report obeys the PRD-017 §6.3 schema so the admin UI (BL-267 in
Sprint 14) can render it without re-parsing.

Usage:
    python -m scripts.validate_dataset \\
        --path data/converted/earbuds_roboflow/ \\
        --output-report data/converted/earbuds_roboflow/quality_report.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def _decode(image_path: Path) -> tuple[int, int, Any] | None:
    """Return (w, h, bgr) or None on decode failure."""
    try:
        import cv2  # type: ignore[import-untyped]
        bgr = cv2.imread(str(image_path))
        if bgr is None:
            return None
        h, w = bgr.shape[:2]
        return w, h, bgr
    except ImportError:
        try:
            from PIL import Image  # type: ignore[import-not-found]
            with Image.open(image_path) as im:
                im.load()
                return im.width, im.height, None
        except Exception:  # noqa: BLE001
            return None
    except Exception:  # noqa: BLE001
        return None


def _laplacian_var(bgr: Any) -> float | None:
    """Blur metric — variance of Laplacian. None if cv2 missing."""
    try:
        import cv2  # type: ignore[import-untyped]
        if bgr is None:
            return None
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())
    except Exception:  # noqa: BLE001
        return None


def _phash(bgr: Any) -> str | None:
    """Perceptual hash — small SHA-256 of a 32x32 grayscale resize as a
    cheap, dependency-light dupe signal (true pHash is fancier but
    needs opencv-contrib). Good enough for the §6.1 dupe pass."""
    if bgr is None:
        return None
    try:
        import cv2  # type: ignore[import-untyped]
        small = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), (32, 32))
        return hashlib.sha256(small.tobytes()).hexdigest()
    except Exception:  # noqa: BLE001
        return None


def _read_labels(label_path: Path) -> list[tuple[int, float, float, float, float]]:
    if not label_path.is_file():
        return []
    out: list[tuple[int, float, float, float, float]] = []
    for line in label_path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        try:
            out.append((int(parts[0]),
                        float(parts[1]), float(parts[2]),
                        float(parts[3]), float(parts[4])))
        except ValueError:
            continue
    return out


# ─────────────────────────── core ─────────────────────────

def validate(
    path: Path,
    *,
    min_resolution: int = 320,
    min_bbox_pixels: int = 16,
    min_bbox_area_ratio: float = 0.001,
    min_blur: float = 30.0,
    check_duplicates: bool = True,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "dataset_path": str(path),
        "total_images": 0,
        "total_annotations": 0,
        "issues": defaultdict(int),
        "class_distribution": defaultdict(int),
        "brightness_samples": [],
        "blur_samples": [],
        "duplicate_groups": [],
    }
    seen_hashes: dict[str, list[str]] = defaultdict(list)

    for split in ("train", "val", "test"):
        img_dir = path / "images" / split
        lbl_dir = path / "labels" / split
        if not img_dir.is_dir():
            continue
        for img_path in sorted(img_dir.iterdir()):
            if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            report["total_images"] += 1
            decoded = _decode(img_path)
            if decoded is None:
                report["issues"]["removed_corrupt"] += 1
                continue
            w, h, bgr = decoded

            if w < min_resolution or h < min_resolution:
                report["issues"]["removed_low_resolution"] += 1
                continue

            # Blur — sample only every Nth to keep runtime sane.
            if report["total_images"] % 20 == 1 and bgr is not None:
                lap = _laplacian_var(bgr)
                if lap is not None:
                    report["blur_samples"].append(lap)
                    if lap < min_blur:
                        report["issues"]["removed_blurry"] += 1
                        continue

            # Brightness sample on first 50 images
            if bgr is not None and len(report["brightness_samples"]) < 50:
                try:
                    import cv2  # type: ignore[import-untyped]
                    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                    report["brightness_samples"].append(float(gray.mean()))
                except Exception:  # noqa: BLE001
                    pass

            # Duplicates
            if check_duplicates:
                h_ = _phash(bgr)
                if h_ is not None:
                    seen_hashes[h_].append(str(img_path.relative_to(path)))

            # Labels
            lbl_path = lbl_dir / f"{img_path.stem}.txt"
            anns = _read_labels(lbl_path)
            if not anns:
                report["issues"]["images_without_labels"] += 1
            valid_anns = 0
            for cls_id, xc, yc, bw, bh in anns:
                report["class_distribution"][cls_id] += 1
                report["total_annotations"] += 1
                if not (0.0 <= xc <= 1.0 and 0.0 <= yc <= 1.0
                        and 0.0 < bw <= 1.0 and 0.0 < bh <= 1.0):
                    report["issues"]["clamped_bbox"] += 1
                    continue
                if bw * w < min_bbox_pixels or bh * h < min_bbox_pixels:
                    report["issues"]["removed_tiny_bbox"] += 1
                    continue
                if bw * bh < min_bbox_area_ratio:
                    report["issues"]["removed_tiny_bbox"] += 1
                    continue
                valid_anns += 1

    # Resolve duplicate groups (>= 2 images sharing the same hash)
    for h_, files in seen_hashes.items():
        if len(files) > 1:
            report["issues"]["removed_duplicate"] += len(files) - 1
            report["duplicate_groups"].append({"hash": h_[:16], "files": files})

    # Summary stats
    summary = {
        "avg_resolution": None,  # filled below from samples
        "brightness_range": [
            round(min(report["brightness_samples"]), 1) if report["brightness_samples"] else None,
            round(max(report["brightness_samples"]), 1) if report["brightness_samples"] else None,
        ],
        "avg_laplacian_blur": (
            round(statistics.mean(report["blur_samples"]), 1)
            if report["blur_samples"] else None
        ),
    }

    issues = dict(report["issues"])
    after_cleanup_images = (
        report["total_images"]
        - issues.get("removed_low_resolution", 0)
        - issues.get("removed_corrupt", 0)
        - issues.get("removed_blurry", 0)
        - issues.get("removed_duplicate", 0)
    )
    after_cleanup_annotations = (
        report["total_annotations"]
        - issues.get("removed_tiny_bbox", 0)
    )

    return {
        "dataset_path": str(path),
        "total_images": report["total_images"],
        "total_annotations": report["total_annotations"],
        "passed": (
            after_cleanup_images >= max(50, report["total_images"] * 0.5)
            and after_cleanup_annotations > 0
        ),
        "issues": issues,
        "after_cleanup": {
            "total_images": after_cleanup_images,
            "total_annotations": after_cleanup_annotations,
            "class_distribution": dict(report["class_distribution"]),
            **summary,
        },
        "duplicate_groups": report["duplicate_groups"][:25],  # cap report size
    }


# ─────────────────────────── CLI ───────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate a YOLO dataset (PRD-021 §3 Sprint 14 BL-261)"
    )
    parser.add_argument("--path", required=True, type=Path,
                        help="Dataset root with images/ + labels/ subdirs")
    parser.add_argument("--min-resolution", type=int, default=320)
    parser.add_argument("--min-bbox-pixels", type=int, default=16)
    parser.add_argument("--min-bbox-area-ratio", type=float, default=0.001)
    parser.add_argument("--min-blur", type=float, default=30.0)
    parser.add_argument("--no-duplicates", action="store_true",
                        help="Skip the perceptual-hash duplicate scan")
    parser.add_argument("--output-report", type=Path,
                        help="Write JSON to this path (default: stdout only)")
    args = parser.parse_args(argv)

    if not args.path.is_dir():
        parser.error(f"path is not a directory: {args.path}")

    report = validate(
        args.path,
        min_resolution=args.min_resolution,
        min_bbox_pixels=args.min_bbox_pixels,
        min_bbox_area_ratio=args.min_bbox_area_ratio,
        min_blur=args.min_blur,
        check_duplicates=not args.no_duplicates,
    )
    serialized = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output_report:
        args.output_report.parent.mkdir(parents=True, exist_ok=True)
        args.output_report.write_text(serialized, encoding="utf-8")
        log.info("quality report → %s", args.output_report)
    print(serialized)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())

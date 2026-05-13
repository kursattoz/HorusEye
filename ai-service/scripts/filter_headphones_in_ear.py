"""Open Images Headphones → in-ear / over-ear splitter — PRD-021 §3 Sprint 15 (BL-277).

OID's "Headphones" class lumps over-ear (Bose / Sony) together with
true-wireless / in-ear (AirPods, Galaxy Buds). For exam proctoring we
only care about in-ear — over-ear is so visible and bulky that humans
are the right detector for it. This script splits the bundle in two so
the merge step only consumes the in-ear half.

Two backends:

1. **clip** (default if `open_clip` is importable) — zero-shot CLIP
   classifier with two prompts, "a photo of in-ear wireless earbuds"
   vs "a photo of over-ear headphones". The bbox crop from the OID
   label is what gets fed to CLIP, not the whole image — so the
   classifier sees the actual headphone region.

2. **bbox_ratio** — heuristic fallback. Computes the bbox area /
   image-area ratio AND the bbox aspect ratio; over-ear headphones
   reliably take up a much larger fraction of the frame (>~3% area,
   wider aspect) than earbuds. Useful when CLIP isn't installed.

The output preserves the YOLO layout — `images/train/*` + `labels/train/*`
both split into ``<output_root>/in_ear/`` and ``<output_root>/over_ear/``.
The label files are copied as-is so the YOLO pipeline downstream sees
the same class id (BL-277 expects `class_mapping.yaml` to map
``Headphones`` → 0 for in-ear; over-ear is just discarded).

Usage:

    python -m scripts.filter_headphones_in_ear \\
        --input  data/raw/oid_headphones \\
        --output data/raw/oid_headphones_split \\
        --backend clip
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# ───────────────────────── label utils ─────────────────────────

def _read_yolo_label(path: Path) -> list[tuple[int, float, float, float, float]]:
    if not path.is_file():
        return []
    out: list[tuple[int, float, float, float, float]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
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


def _bbox_to_pixels(bbox: tuple[int, float, float, float, float],
                   img_w: int, img_h: int) -> tuple[int, int, int, int]:
    """YOLO (xc, yc, w, h) normalized → (xmin, ymin, xmax, ymax) pixels."""
    _, xc, yc, bw, bh = bbox
    x = int((xc - bw / 2.0) * img_w)
    y = int((yc - bh / 2.0) * img_h)
    return (max(x, 0), max(y, 0),
            min(int((xc + bw / 2.0) * img_w), img_w),
            min(int((yc + bh / 2.0) * img_h), img_h))


# ───────────────────────── classifiers ─────────────────────────

class CLIPClassifier:
    """open_clip ViT-B/32 zero-shot. Two prompts → softmax → in_ear bool."""

    PROMPTS = {
        "in_ear":  "a photo of small in-ear wireless earbuds, AirPods or Galaxy Buds",
        "over_ear": "a photo of large over-ear headphones covering the whole ear",
    }

    def __init__(self) -> None:
        import torch  # type: ignore[import-not-found]
        import open_clip  # type: ignore[import-not-found]
        self.torch = torch
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="laion2b_s34b_b79k",
        )
        self.tokenizer = open_clip.get_tokenizer("ViT-B-32")
        self.model.eval()
        with torch.no_grad():
            tokens = self.tokenizer(list(self.PROMPTS.values()))
            self.text_features = self.model.encode_text(tokens)
            self.text_features /= self.text_features.norm(dim=-1, keepdim=True)

    def is_in_ear(self, image_crop: Any) -> tuple[bool, float]:
        """Returns (in_ear, confidence). image_crop is a PIL.Image."""
        with self.torch.no_grad():
            tensor = self.preprocess(image_crop).unsqueeze(0)
            feats = self.model.encode_image(tensor)
            feats /= feats.norm(dim=-1, keepdim=True)
            probs = (feats @ self.text_features.T).softmax(dim=-1)[0].tolist()
        in_ear_p = probs[0]
        return in_ear_p > probs[1], float(in_ear_p)


def heuristic_in_ear(
    bbox: tuple[int, float, float, float, float],
    img_w: int,
    img_h: int,
) -> tuple[bool, float]:
    """Bbox area / aspect heuristic. Earbuds are tiny + roughly square."""
    _, _, _, bw, bh = bbox
    area_ratio = bw * bh
    aspect = bw / bh if bh > 0 else 0
    # Over-ear headphones almost always occupy ≥ 3% of the frame; in-ear
    # earbuds rarely exceed 1.5%. Aspect-wise over-ear cans are slightly
    # wider than tall (1.0-1.4); earbuds are close to 1:1 or taller.
    in_ear = area_ratio < 0.03 and 0.6 <= aspect <= 1.6
    confidence = 1.0 - min(area_ratio / 0.03, 1.0)
    return in_ear, float(confidence)


# ───────────────────────── pipeline ─────────────────────────

def _open_image(path: Path) -> Any:
    from PIL import Image  # type: ignore[import-not-found]
    return Image.open(path).convert("RGB")


def split(
    input_root: Path,
    output_root: Path,
    *,
    backend: str = "clip",
) -> dict[str, Any]:
    """Walk input_root/{images,labels}/train, route every frame into the
    in_ear or over_ear branch under output_root."""
    train_imgs = input_root / "train" / "images"
    train_lbls = input_root / "train" / "labels"
    if not train_imgs.is_dir():
        # Fall back to standard YOLOv8 layout
        train_imgs = input_root / "images" / "train"
        train_lbls = input_root / "labels" / "train"
    if not train_imgs.is_dir():
        raise SystemExit(f"no train images under {input_root}")

    classifier: CLIPClassifier | None = None
    if backend == "clip":
        try:
            classifier = CLIPClassifier()
        except ImportError as e:
            log.warning("CLIP not available (%s) — falling back to bbox heuristic", e)
            classifier = None
            backend = "bbox_ratio"

    stats = {
        "input_root":  str(input_root),
        "output_root": str(output_root),
        "backend":     backend if classifier else "bbox_ratio",
        "total":       0,
        "in_ear":      0,
        "over_ear":    0,
        "no_label":    0,
        "decode_failed": 0,
    }

    for split_name in ("in_ear", "over_ear"):
        (output_root / split_name / "images").mkdir(parents=True, exist_ok=True)
        (output_root / split_name / "labels").mkdir(parents=True, exist_ok=True)

    for img_path in sorted(train_imgs.iterdir()):
        if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        stats["total"] += 1

        lbl_path = train_lbls / f"{img_path.stem}.txt"
        labels = _read_yolo_label(lbl_path)
        if not labels:
            stats["no_label"] += 1
            continue

        try:
            img = _open_image(img_path)
        except Exception:  # noqa: BLE001
            stats["decode_failed"] += 1
            continue
        w, h = img.size

        # Use the largest bbox in the frame as the representative crop.
        primary = max(labels, key=lambda b: b[3] * b[4])

        if classifier is not None:
            x0, y0, x1, y1 = _bbox_to_pixels(primary, w, h)
            if x1 - x0 < 8 or y1 - y0 < 8:
                # Bbox too small for CLIP — fall back to heuristic.
                is_in_ear, _ = heuristic_in_ear(primary, w, h)
            else:
                is_in_ear, _ = classifier.is_in_ear(img.crop((x0, y0, x1, y1)))
        else:
            is_in_ear, _ = heuristic_in_ear(primary, w, h)

        bucket = "in_ear" if is_in_ear else "over_ear"
        stats[bucket] += 1
        shutil.copy2(img_path, output_root / bucket / "images" / img_path.name)
        if lbl_path.is_file():
            shutil.copy2(lbl_path, output_root / bucket / "labels" / lbl_path.name)

    return stats


# ───────────────────────── CLI ─────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Split OID Headphones into in-ear vs over-ear "
                    "(PRD-021 §3 Sprint 15 BL-277)"
    )
    parser.add_argument("--input", required=True, type=Path,
                        help="OID Headphones bundle (YOLO layout)")
    parser.add_argument("--output", required=True, type=Path,
                        help="Split output root (in_ear/ + over_ear/)")
    parser.add_argument("--backend", default="clip",
                        choices=["clip", "bbox_ratio"],
                        help="Classifier backend (default: clip with fallback)")
    parser.add_argument("--report", type=Path,
                        help="Path to write split_report.json")
    args = parser.parse_args(argv)

    if not args.input.is_dir():
        parser.error(f"input is not a directory: {args.input}")
    args.output.mkdir(parents=True, exist_ok=True)

    stats = split(args.input, args.output, backend=args.backend)
    stats["split_at"] = datetime.now(timezone.utc).isoformat()

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(stats, indent=2, ensure_ascii=False),
                               encoding="utf-8")
    print(json.dumps(stats, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())

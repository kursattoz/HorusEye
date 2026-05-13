"""Frame extraction + pre-label — PRD-021 §3 Sprint 16 (BL-288).

Takes a video (mp4/mov/avi) and emits:

1. ``<output>/images/*.jpg`` — frames sampled at ``--fps`` (default 2 fps).
2. ``<output>/labels/*.txt`` — YOLO labels pre-populated by running the
   current production YOLOv8 weights against each frame. The labels are
   imperfect — an annotator in CVAT (BL-279) reviews + fixes before
   merging into the corpus.

Why pre-label instead of starting from blank: cuts annotation time by
2-3× for "I'm 95% confident this is a phone" cases. The annotator's
job becomes editing rather than drawing from scratch.

Usage:

    python -m scripts.extract_and_prelabel \\
        --video    path/to/exam_clip.mp4 \\
        --output   data/raw/sprint16_prelabelled/ \\
        --weights  models/yolov8n-horuseye-v1.0.pt \\
        --fps      2

If --weights is omitted the script writes empty label files so the
annotator labels everything from scratch (still useful — at least the
frame extraction is automated).
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")


# ───────────────────── frame extraction ─────────────────────

def extract_frames(video: Path, out_dir: Path, fps: float) -> list[Path]:
    """Use ffmpeg to dump frames at ``fps`` into out_dir/images/."""
    img_dir = out_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(img_dir / f"{video.stem}_%05d.jpg")
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", str(video),
        "-vf", f"fps={fps}",
        "-q:v", "2",
        pattern,
    ]
    log.info("→ %s", " ".join(cmd))
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise SystemExit(f"ffmpeg failed (exit {proc.returncode})")
    return sorted(img_dir.glob(f"{video.stem}_*.jpg"))


# ───────────────────── pre-label ─────────────────────

def prelabel_with_yolo(
    frames:  list[Path],
    out_dir: Path,
    *,
    weights: Path,
    conf:    float,
) -> dict[str, Any]:
    """Run YOLOv8 inference and emit YOLO-format label files."""
    try:
        from ultralytics import YOLO  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit("`pip install ultralytics` to enable pre-label") from e

    label_dir = out_dir / "labels"
    label_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights))
    total_detections = 0
    per_class: dict[int, int] = {}

    for img_path in frames:
        # YOLOv8 returns a Results list; we use [0] since we pass one image.
        results = model.predict(source=str(img_path), conf=conf, verbose=False)
        result = results[0]
        boxes = result.boxes
        lines: list[str] = []
        for i in range(len(boxes)):
            cls   = int(boxes.cls[i].item())
            xywhn = boxes.xywhn[i].tolist()  # [xc, yc, w, h] normalized
            lines.append(f"{cls} {xywhn[0]:.6f} {xywhn[1]:.6f} {xywhn[2]:.6f} {xywhn[3]:.6f}")
            per_class[cls] = per_class.get(cls, 0) + 1
            total_detections += 1
        (label_dir / f"{img_path.stem}.txt").write_text(
            "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
        )

    return {
        "weights":         str(weights),
        "conf":            conf,
        "total_frames":    len(frames),
        "total_detections": total_detections,
        "per_class_count": per_class,
    }


def write_empty_labels(frames: list[Path], out_dir: Path) -> None:
    """No weights → empty label files so the annotator labels from scratch."""
    label_dir = out_dir / "labels"
    label_dir.mkdir(parents=True, exist_ok=True)
    for img in frames:
        (label_dir / f"{img.stem}.txt").write_text("", encoding="utf-8")


# ───────────────────── CLI ─────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract frames + pre-label (PRD-021 §3 Sprint 16 BL-288)"
    )
    parser.add_argument("--video",   required=True, type=Path)
    parser.add_argument("--output",  required=True, type=Path)
    parser.add_argument("--fps",     type=float, default=2.0,
                        help="Frames per second (default: 2)")
    parser.add_argument("--weights", type=Path,
                        help="YOLO weights for pre-label (omit for blank labels)")
    parser.add_argument("--conf",    type=float, default=0.4,
                        help="Confidence threshold for pre-label (default: 0.4)")
    parser.add_argument("--report",  type=Path,
                        help="Write summary JSON to this path")
    args = parser.parse_args(argv)

    if not args.video.is_file():
        parser.error(f"video not found: {args.video}")
    args.output.mkdir(parents=True, exist_ok=True)

    frames = extract_frames(args.video, args.output, args.fps)
    log.info("extracted %d frames", len(frames))

    summary: dict[str, Any] = {
        "video":         str(args.video),
        "output":        str(args.output),
        "fps":           args.fps,
        "frames":        len(frames),
        "labelled_at":   datetime.now(timezone.utc).isoformat(),
    }

    if args.weights:
        if not args.weights.is_file():
            parser.error(f"weights file not found: {args.weights}")
        prelabel_summary = prelabel_with_yolo(
            frames, args.output, weights=args.weights, conf=args.conf,
        )
        summary["prelabel"] = prelabel_summary
    else:
        write_empty_labels(frames, args.output)
        summary["prelabel"] = "skipped (no --weights)"

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, indent=2, ensure_ascii=False),
                               encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())

"""YOLOv8 fine-tuning script — BL-64 (PRD-013 §4.1, §4.6).

Wraps ultralytics' training loop with the conventions we use across the
project (config-driven, deterministic seed, small enough for a
single-GPU classroom workstation).

Dataset layout (Ultralytics YOLOv8 format):

    datasets/horuseye-proctoring/
      ├── data.yaml          # paths + class names (see template below)
      ├── images/
      │   ├── train/
      │   ├── val/
      │   └── test/
      └── labels/
          ├── train/         # one .txt per image, YOLO format
          ├── val/
          └── test/

Run:

    python -m scripts.finetune_yolo \\
      --data    datasets/horuseye-proctoring/data.yaml \\
      --weights yolov8n.pt \\
      --epochs  50 \\
      --imgsz   640 \\
      --batch   16 \\
      --output  runs/horuseye-001

The Phase A baseline keeps COCO pre-trained weights and skips this step;
fine-tuning only matters if Çağla collects a labelled classroom dataset
(BL-150 data collection pipeline).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Fine-tune YOLOv8 on a custom dataset")
    parser.add_argument("--data",     required=True, help="Path to data.yaml")
    parser.add_argument("--weights",  default="yolov8n.pt", help="Initial weights (pretrained model)")
    parser.add_argument("--epochs",   type=int,   default=50)
    parser.add_argument("--imgsz",    type=int,   default=640)
    parser.add_argument("--batch",    type=int,   default=16)
    parser.add_argument("--device",   default="cpu", help="'cpu', 'cuda:0', or 'mps'")
    parser.add_argument("--output",   default="runs/horuseye-train")
    parser.add_argument("--seed",     type=int, default=42)
    parser.add_argument("--patience", type=int, default=10, help="Early-stop patience in epochs")
    args = parser.parse_args(argv)

    if not Path(args.data).is_file():
        parser.error(f"data file not found: {args.data}")

    try:
        from ultralytics import YOLO
    except ImportError:
        parser.error("ultralytics not installed. Run `pip install ultralytics` first.")

    model = YOLO(args.weights)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=Path(args.output).parent or "runs",
        name=Path(args.output).name,
        seed=args.seed,
        patience=args.patience,
        # Sensible defaults — override via direct ultralytics CLI for exotic runs
        lr0=0.01,
        cos_lr=True,
        label_smoothing=0.05,
        warmup_epochs=3,
        save=True,
        plots=True,
    )

    # Evaluate on the test split
    metrics = model.val(data=args.data, split="test", device=args.device)
    print("\nTest set metrics:")
    print(f"  mAP50:    {metrics.box.map50:.3f}")
    print(f"  mAP50-95: {metrics.box.map:.3f}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


# ─────────────────────────────────────────────────────────────────────
# Reference data.yaml template — copy into the dataset folder and fill
# class names per BL-129 incident_type categories you want to detect:
#
#   path: ./datasets/horuseye-proctoring
#   train: images/train
#   val:   images/val
#   test:  images/test
#   nc: 5
#   names:
#     0: person
#     1: cell_phone
#     2: book
#     3: laptop
#     4: earbuds
# ─────────────────────────────────────────────────────────────────────

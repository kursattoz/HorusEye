"""YOLOv8 fine-tuning script — BL-64 + BL-211 (PRD-013 §4.1, §4.6, PRD-017 §5).

Wraps ultralytics' training loop with the conventions we use across the
project (config-driven, deterministic seed, small enough for a
single-GPU classroom workstation). Sprint 9 (BL-211) extends the script
with optional Supabase Storage upload + ai_models row registration so
a finished training run can be promoted to a deployable model in one
command.

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
      --data        datasets/horuseye-proctoring/data.yaml \\
      --weights     yolov8n.pt \\
      --epochs      50 \\
      --imgsz       640 \\
      --batch       16 \\
      --output      runs/horuseye-001

To upload + register the resulting weights with the ai_models table
add ``--register --model-name yolov8n-horuseye --model-version v0.2.0``.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# ─────────────────────────────── registry helpers ────────────────────────────

def upload_weights(
    local_path: Path,
    bucket: str,
    object_key: str,
) -> str:
    """Upload ``local_path`` to Supabase Storage. Returns the storage path."""
    from src.persistence.supabase_client import get_supabase_admin
    client = get_supabase_admin()
    with local_path.open("rb") as f:
        client.storage.from_(bucket).upload(
            object_key,
            f.read(),
            file_options={"content-type": "application/octet-stream", "upsert": "true"},
        )
    return f"storage://{bucket}/{object_key}"


def register_ai_model(
    *,
    name: str,
    version: str,
    weights_path: str,
    benchmark_results: dict[str, Any] | None,
    activate: bool = False,
) -> dict[str, Any]:
    """Upsert a row into ``public.ai_models``. Returns the resulting row."""
    from src.persistence.supabase_client import get_supabase_admin
    client = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "name":              name,
        "version":           version,
        "weights_path":      weights_path,
        "active":            activate,
        "benchmark_results": benchmark_results,
        "trained_on":        now,
    }
    if activate:
        payload["deployed_at"] = now
    result = (
        client.table("ai_models")
        .upsert(payload, on_conflict="name,version")
        .execute()
    )
    rows = getattr(result, "data", None) or []
    return rows[0] if rows else payload


# ────────────────────────────────── main ─────────────────────────────────────

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Fine-tune YOLOv8 on a custom dataset")
    parser.add_argument("--data",     required=True, help="Path to data.yaml")
    parser.add_argument("--weights",  default="yolov8n.pt", help="Initial weights (pretrained model)")
    parser.add_argument("--epochs",   type=int, default=50)
    parser.add_argument("--imgsz",    type=int, default=640)
    parser.add_argument("--batch",    type=int, default=16)
    parser.add_argument("--device",   default="cpu", help="'cpu', 'cuda:0', or 'mps'")
    parser.add_argument("--output",   default="runs/horuseye-train")
    parser.add_argument("--seed",     type=int, default=42)
    parser.add_argument("--patience", type=int, default=10, help="Early-stop patience in epochs")

    # BL-211 — registry / upload knobs
    parser.add_argument("--register",     action="store_true",
                        help="After training, upload best.pt + INSERT ai_models row.")
    parser.add_argument("--bucket",       default="ai-model-weights",
                        help="Supabase Storage bucket for trained weights.")
    parser.add_argument("--model-name",   help="ai_models.name (required with --register)")
    parser.add_argument("--model-version", help="ai_models.version (required with --register)")
    parser.add_argument("--activate",     action="store_true",
                        help="Mark the new ai_models row active=true (else stays staged).")

    args = parser.parse_args(argv)

    if not Path(args.data).is_file():
        parser.error(f"data file not found: {args.data}")

    if args.register and (not args.model_name or not args.model_version):
        parser.error("--register requires both --model-name and --model-version")

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
    benchmark_results = {
        "mAP50":    float(metrics.box.map50),
        "mAP50-95": float(metrics.box.map),
        "imgsz":    args.imgsz,
        "epochs":   args.epochs,
        "data":     str(args.data),
    }
    print("\nTest set metrics:")
    print(json.dumps(benchmark_results, indent=2))

    if args.register:
        best_pt = Path(args.output) / "weights" / "best.pt"
        if not best_pt.is_file():
            log.error("expected weights at %s — skipping registry upload", best_pt)
            return 1

        object_key = f"{args.model_name}/{args.model_version}/best.pt"
        weights_uri = upload_weights(best_pt, args.bucket, object_key)
        row = register_ai_model(
            name=args.model_name,
            version=args.model_version,
            weights_path=weights_uri,
            benchmark_results=benchmark_results,
            activate=args.activate,
        )
        log.info("ai_models registered: id=%s active=%s", row.get("id"), row.get("active"))

    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
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

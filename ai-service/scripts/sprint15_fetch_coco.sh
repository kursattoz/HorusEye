#!/usr/bin/env bash
# Sprint 15 (BL-274) — COCO 2017 subset fetch.
# PRD-021 §3 Sprint 15: COCO subset gives us cell phone + book + person
# baselines. Uses scripts/import_dataset.py (BL-259) under the hood.
#
# Output: ai-service/data/raw/coco_phone_book/
#
# Cap defaults match PRD-017 §8.2 (max 2000 per class to balance the merge).
# Override via env: COCO_MAX_SAMPLES=1500 ./scripts/sprint15_fetch_coco.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

# PRD-021 §3 Sprint 15: phone + book + person (proxy for full-body context).
# Earbuds is COCO-absent (handled via Open Images Headphones + Roboflow).
COCO_CLASSES="${COCO_CLASSES:-cell phone,book,person}"
COCO_MAX_SAMPLES="${COCO_MAX_SAMPLES:-2000}"
COCO_OUTPUT="${COCO_OUTPUT:-data/raw/coco_phone_book}"

echo "→ COCO 2017 subset:"
echo "  classes:     ${COCO_CLASSES}"
echo "  max_samples: ${COCO_MAX_SAMPLES} per class"
echo "  output:      ${COCO_OUTPUT}"

# train split → bulk of training data
python -m scripts.import_dataset \
  --source       coco \
  --classes      "${COCO_CLASSES}" \
  --max-samples  "${COCO_MAX_SAMPLES}" \
  --split        train \
  --output       "${COCO_OUTPUT}/train"

# val split → goes into the merge step's val pool
python -m scripts.import_dataset \
  --source       coco \
  --classes      "${COCO_CLASSES}" \
  --max-samples  $((COCO_MAX_SAMPLES / 5)) \
  --split        validation \
  --output       "${COCO_OUTPUT}/val"

echo "✓ COCO subset ready: ${COCO_OUTPUT}"
echo "  Next: python -m scripts.convert_dataset --source ${COCO_OUTPUT}/train --target data/converted/coco_phone_book/ --format yolov8 --class-map '{\"cell phone\": 1, \"book\": 2}'"

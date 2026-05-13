#!/usr/bin/env bash
# Sprint 15 (BL-282) — YOLOv8n fine-tune v1.0 wrapper.
# PRD-021 §3 Sprint 15: trains yolov8n-horuseye v1.0 on the merged
# Sprint 15 corpus. Idempotent — re-running overwrites runs/sprint15_v1/.
#
# Prereqs:
#   1. data/merged/sprint15_v1/data.yaml exists (BL-262 merge done).
#   2. GPU OR enough patience for CPU (~12h on M2 Max, 2-3h on T4).
#
# Env overrides:
#   SPRINT15_EPOCHS=80 SPRINT15_BATCH=32 SPRINT15_DEVICE=cuda:0
#   SPRINT15_REGISTER=1                       # upload + register on done
#   SPRINT15_ACTIVATE=1                       # also flip ai_models.active

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

DATA_YAML="${DATA_YAML:-data/merged/sprint15_v1/data.yaml}"
OUTPUT="${OUTPUT:-runs/sprint15_v1}"
WEIGHTS="${WEIGHTS:-models/yolov8n.pt}"

SPRINT15_EPOCHS="${SPRINT15_EPOCHS:-50}"
SPRINT15_IMGSZ="${SPRINT15_IMGSZ:-640}"
SPRINT15_BATCH="${SPRINT15_BATCH:-16}"
SPRINT15_DEVICE="${SPRINT15_DEVICE:-cpu}"
SPRINT15_PATIENCE="${SPRINT15_PATIENCE:-10}"
SPRINT15_SEED="${SPRINT15_SEED:-42}"

MODEL_NAME="${MODEL_NAME:-yolov8n-horuseye}"
MODEL_VERSION="${MODEL_VERSION:-v1.0.0-sprint15}"

if [ ! -f "${DATA_YAML}" ]; then
  echo "ERROR: ${DATA_YAML} not found. Run scripts/merge_datasets.py first." >&2
  exit 2
fi

echo "→ Sprint 15 fine-tune:"
echo "  data:    ${DATA_YAML}"
echo "  weights: ${WEIGHTS}"
echo "  output:  ${OUTPUT}"
echo "  epochs:  ${SPRINT15_EPOCHS}   batch: ${SPRINT15_BATCH}   imgsz: ${SPRINT15_IMGSZ}"
echo "  device:  ${SPRINT15_DEVICE}    patience: ${SPRINT15_PATIENCE}"
echo "  seed:    ${SPRINT15_SEED}"

REGISTER_FLAGS=()
if [ "${SPRINT15_REGISTER:-0}" = "1" ]; then
  REGISTER_FLAGS+=(
    --register
    --model-name    "${MODEL_NAME}"
    --model-version "${MODEL_VERSION}"
  )
  if [ "${SPRINT15_ACTIVATE:-0}" = "1" ]; then
    REGISTER_FLAGS+=(--activate)
  fi
  echo "  REGISTER: yes (${MODEL_NAME} ${MODEL_VERSION}, active=${SPRINT15_ACTIVATE:-0})"
fi

python -m scripts.finetune_yolo \
  --data       "${DATA_YAML}" \
  --weights    "${WEIGHTS}" \
  --epochs     "${SPRINT15_EPOCHS}" \
  --imgsz      "${SPRINT15_IMGSZ}" \
  --batch      "${SPRINT15_BATCH}" \
  --device     "${SPRINT15_DEVICE}" \
  --patience   "${SPRINT15_PATIENCE}" \
  --seed       "${SPRINT15_SEED}" \
  --output     "${OUTPUT}" \
  "${REGISTER_FLAGS[@]}"

echo "✓ Sprint 15 v1.0 fine-tune done."
echo "  weights at: ${OUTPUT}/weights/best.pt"
if [ "${SPRINT15_REGISTER:-0}" = "1" ]; then
  echo "  ai_models row: ${MODEL_NAME} ${MODEL_VERSION}"
fi
echo "  Next: BL-283 benchmark → BL-284 A/B vs stock."

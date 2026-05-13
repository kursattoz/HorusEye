#!/usr/bin/env bash
# Sprint 16 (BL-294) — YOLOv8n fine-tune v2.0 + A/B vs v1.0.
# PRD-021 §3 Sprint 16. Trains on data/merged/sprint16_v2/ starting
# from the v1.0 weights (continual learning — v2.0 inherits v1.0's
# phone/earbuds/smart_watch knowledge).
#
# Env overrides (all optional):
#   SPRINT16_EPOCHS / SPRINT16_BATCH / SPRINT16_DEVICE / SPRINT16_PATIENCE
#   STARTING_WEIGHTS  (default: runs/sprint15_v1/weights/best.pt)
#   SPRINT16_REGISTER=1
#   SPRINT16_ACTIVATE=1   # ONLY after A/B sign-off (BL-284)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

DATA_YAML="${DATA_YAML:-data/merged/sprint16_v2/data.yaml}"
OUTPUT="${OUTPUT:-runs/sprint16_v2}"
STARTING_WEIGHTS="${STARTING_WEIGHTS:-runs/sprint15_v1/weights/best.pt}"

SPRINT16_EPOCHS="${SPRINT16_EPOCHS:-30}"   # fewer than v1.0 — we're fine-tuning, not from-scratch
SPRINT16_IMGSZ="${SPRINT16_IMGSZ:-640}"
SPRINT16_BATCH="${SPRINT16_BATCH:-16}"
SPRINT16_DEVICE="${SPRINT16_DEVICE:-cpu}"
SPRINT16_PATIENCE="${SPRINT16_PATIENCE:-8}"
SPRINT16_SEED="${SPRINT16_SEED:-42}"

MODEL_NAME="${MODEL_NAME:-yolov8n-horuseye}"
MODEL_VERSION="${MODEL_VERSION:-v2.0.0-sprint16}"

if [ ! -f "${DATA_YAML}" ]; then
  echo "ERROR: ${DATA_YAML} not found. Run scripts/sprint16_merge_v2.sh first." >&2
  exit 2
fi
if [ ! -f "${STARTING_WEIGHTS}" ]; then
  echo "ERROR: starting weights not found: ${STARTING_WEIGHTS}" >&2
  echo "  Either run Sprint 15 training first or set STARTING_WEIGHTS=models/yolov8n.pt for from-scratch." >&2
  exit 2
fi

echo "→ Sprint 16 v2.0 fine-tune:"
echo "  starting from: ${STARTING_WEIGHTS}"
echo "  data:          ${DATA_YAML}"
echo "  output:        ${OUTPUT}"
echo "  epochs/patience: ${SPRINT16_EPOCHS}/${SPRINT16_PATIENCE}"
echo "  batch/imgsz:     ${SPRINT16_BATCH}/${SPRINT16_IMGSZ}"
echo "  device:          ${SPRINT16_DEVICE}"

REGISTER_FLAGS=()
if [ "${SPRINT16_REGISTER:-0}" = "1" ]; then
  REGISTER_FLAGS+=(
    --register
    --model-name    "${MODEL_NAME}"
    --model-version "${MODEL_VERSION}"
  )
  if [ "${SPRINT16_ACTIVATE:-0}" = "1" ]; then
    REGISTER_FLAGS+=(--activate)
  fi
fi

python -m scripts.finetune_yolo \
  --data       "${DATA_YAML}" \
  --weights    "${STARTING_WEIGHTS}" \
  --epochs     "${SPRINT16_EPOCHS}" \
  --imgsz      "${SPRINT16_IMGSZ}" \
  --batch      "${SPRINT16_BATCH}" \
  --device     "${SPRINT16_DEVICE}" \
  --patience   "${SPRINT16_PATIENCE}" \
  --seed       "${SPRINT16_SEED}" \
  --output     "${OUTPUT}" \
  "${REGISTER_FLAGS[@]}"

echo ""
echo "→ Running A/B comparator against Sprint 15 v1.0..."
echo "  (Both models benchmarked on Sprint 15 frozen 150-frame set.)"

# Benchmark v1.0 (if not already done)
if [ ! -f "build/benchmark_sprint15_v1.json" ]; then
  python -m scripts.benchmark_phone \
    --data-dir     test-data/phone_benchmark/sprint15_v1 \
    --ground-truth test-data/phone_benchmark/sprint15_v1/ground_truth.json \
    --weights      "${STARTING_WEIGHTS}" \
    --output       build/benchmark_sprint15_v1.json
fi

# Benchmark v2.0
python -m scripts.benchmark_phone \
  --data-dir     test-data/phone_benchmark/sprint15_v1 \
  --ground-truth test-data/phone_benchmark/sprint15_v1/ground_truth.json \
  --weights      "${OUTPUT}/weights/best.pt" \
  --output       build/benchmark_sprint16_v2.json

# A/B compare
python -m scripts.sprint15_ab_test \
  --stock     build/benchmark_sprint15_v1.json \
  --candidate build/benchmark_sprint16_v2.json \
  --markdown  build/ab_v2_vs_v1.md \
  --summary   build/ab_v2_vs_v1.json \
  --regression-tolerance 0.02

echo "✓ Sprint 16 v2.0 train + A/B done."
echo "  weights:    ${OUTPUT}/weights/best.pt"
echo "  A/B report: build/ab_v2_vs_v1.md"
echo "  Next: scripts/sprint16_benchmark_and_register.sh (BL-295) to upload + register"

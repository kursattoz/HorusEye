#!/usr/bin/env bash
# Sprint 15 v1.0 — single-command training orchestrator.
# PRD-021 §3 Sprint 15. Drives every step from raw dataset pull to
# ai_models registration so the project coordinator runs ONE command
# instead of remembering ten.
#
# Sequence:
#   1. Source .env (Roboflow + Supabase secrets)
#   2. Preflight (scripts/preflight_training.py) — fail fast on missing
#      deps / env / disk / GPU
#   3. Fetch (COCO + OID + Roboflow)
#   4. Optional in-ear filter (BL-277)
#   5. Convert each bundle to YOLO format (per-bundle class map)
#   6. Validate (PRD-017 §6.3 quality report)
#   7. Merge into data/merged/sprint15_v1/
#   8. Fine-tune (sprint15_train_v1.sh)
#   9. Benchmark + acceptance gate + register (sprint15_benchmark_and_register.py)
#
# Flags:
#   --dry-run     print the steps, don't execute
#   --skip-fetch  skip steps 3-4 (datasets already on disk)
#   --skip-merge  skip steps 5-7
#   --skip-train  skip step 8 (benchmark+register a pre-trained best.pt)
#   --device cuda:0 | cpu | mps  passed through to all stages

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

# ── arg parse ────────────────────────────────────────────────────────
DRY_RUN=0
SKIP_FETCH=0
SKIP_MERGE=0
SKIP_TRAIN=0
DEVICE="${SPRINT15_DEVICE:-cpu}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-fetch) SKIP_FETCH=1 ;;
    --skip-merge) SKIP_MERGE=1 ;;
    --skip-train) SKIP_TRAIN=1 ;;
    --device)     shift; DEVICE="$1" ;;
    -h|--help)
      cat <<'EOM'
Usage: scripts/train_v1.sh [--dry-run] [--skip-fetch] [--skip-merge]
                            [--skip-train] [--device cuda:0|cpu|mps]
EOM
      exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2 ;;
  esac
  shift
done

# ── env ──────────────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a; source .env; set +a
fi

# ── helpers ──────────────────────────────────────────────────────────
run() {
  echo "→ $*"
  if [ "$DRY_RUN" = "0" ]; then
    "$@"
  fi
}

step() {
  echo
  echo "─── $1 ────────────────────────────────────────────"
}

# ── step 1: preflight ────────────────────────────────────────────────
step "Preflight"
run python -m scripts.preflight_training \
  --device "${DEVICE}" \
  --output runs/sprint15_v1 \
  --min-disk-gb 30 \
  --force

# ── steps 3-4: fetch ─────────────────────────────────────────────────
if [ "$SKIP_FETCH" = "0" ]; then
  step "Fetch — COCO subset"
  run bash scripts/sprint15_fetch_coco.sh

  step "Fetch — Open Images V7"
  run bash scripts/sprint15_fetch_open_images.sh

  step "Fetch — Roboflow Universe"
  if [ -n "${ROBOFLOW_API_KEY:-}" ]; then
    run bash scripts/sprint15_fetch_roboflow.sh
  else
    echo "⚠ ROBOFLOW_API_KEY unset — skipping Roboflow pull."
  fi

  step "Filter — OID Headphones in-ear (BL-277)"
  if [ -d data/raw/oid_headphones ]; then
    run python -m scripts.filter_headphones_in_ear \
      --input  data/raw/oid_headphones \
      --output data/raw/oid_headphones_split \
      --backend clip \
      --report data/raw/oid_headphones_split/split_report.json
    if [ -d data/raw/oid_headphones_split/in_ear ]; then
      run rm -rf data/raw/oid_headphones_in_ear
      run cp -r data/raw/oid_headphones_split/in_ear data/raw/oid_headphones_in_ear
    fi
  else
    echo "⚠ data/raw/oid_headphones missing — skipping in-ear filter."
  fi
fi

# ── steps 5-6: convert + validate ────────────────────────────────────
if [ "$SKIP_MERGE" = "0" ]; then
  step "Convert raw bundles → YOLO"
  for ds in coco_phone_book oid_mobile_phone oid_book oid_headphones_in_ear oid_watch \
            roboflow_phone_on_desk roboflow_earbuds roboflow_smartwatch roboflow_paper_notes; do
    if [ -d "data/raw/${ds}" ]; then
      run python -m scripts.convert_dataset \
        --source "data/raw/${ds}" \
        --target "data/converted/${ds}" \
        --format yolov8 \
        --class-map "$(python -c "import yaml,json; print(json.dumps({k:v for src in yaml.safe_load(open('configs/class_mapping.yaml'))['source_mappings'].values() for k,v in src.items()}))")"
    fi
  done

  step "Validate each converted bundle"
  for ds in data/converted/*/; do
    [ -d "${ds}" ] || continue
    run python -m scripts.validate_dataset \
      --path "${ds}" \
      --output-report "${ds}/quality_report.json" \
      --no-duplicates
  done

  step "Merge → data/merged/sprint15_v1/"
  SOURCES=()
  for ds in data/converted/*/; do
    [ -d "${ds}" ] && SOURCES+=("${ds%/}")
  done
  if [ "${#SOURCES[@]}" -lt 2 ] && [ "$DRY_RUN" = "0" ]; then
    echo "ERROR: at least 2 converted bundles required, got ${#SOURCES[@]}" >&2
    exit 3
  fi
  run python -m scripts.merge_datasets \
    --sources       "${SOURCES[@]:-data/converted/<source>}" \
    --class-map     configs/class_mapping.yaml \
    --output        data/merged/sprint15_v1 \
    --max-per-class 2000 \
    --min-per-class 50 \
    --split-ratio   "0.7:0.2:0.1" \
    --seed          42
fi

# ── step 8: fine-tune ────────────────────────────────────────────────
if [ "$SKIP_TRAIN" = "0" ]; then
  step "Fine-tune YOLOv8n v1.0"
  SPRINT15_DEVICE="${DEVICE}" run bash scripts/sprint15_train_v1.sh
fi

# ── step 9: benchmark + register ─────────────────────────────────────
step "Benchmark + register (BL-283)"
BENCH_DATA="${BENCH_DATA:-test-data/phone_benchmark/sprint15_v1}"
BENCH_GT="${BENCH_GT:-${BENCH_DATA}/ground_truth.json}"

if [ ! -f "${BENCH_GT}" ]; then
  echo "⚠ ${BENCH_GT} missing — skipping benchmark."
  echo "  Set BENCH_DATA / BENCH_GT env or run docs/sprint15-benchmark-runbook.md first."
else
  run python -m scripts.sprint15_benchmark_and_register \
    --weights        runs/sprint15_v1/weights/best.pt \
    --benchmark-data "${BENCH_DATA}" \
    --ground-truth   "${BENCH_GT}" \
    --report-out     build/benchmark_sprint15_v1.json \
    --model-name     "${MODEL_NAME:-yolov8n-horuseye}" \
    --model-version  "${MODEL_VERSION:-v1.0.0-sprint15}"
fi

step "Done"
echo "✓ v1.0 weights: runs/sprint15_v1/weights/best.pt"
echo "  Next: review build/benchmark_sprint15_v1.json; flip"
echo "  SPRINT15_ACTIVATE=1 and rerun the benchmark step to mark active."

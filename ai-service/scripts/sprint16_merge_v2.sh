#!/usr/bin/env bash
# Sprint 16 (BL-293) — Merge datasets v2.0.
# PRD-021 §3 Sprint 16. Adds the Sprint 16 sources (pencil_case,
# calculator, cheat-sheets, hidden-notes) + the negatives bundle to
# the v1.0 set and writes the v2.0 merged corpus.
#
# Prereqs:
#   * scripts/sprint16_fetch_external.sh ran (OID + Roboflow bundles).
#   * scripts/mine_negatives.py ran (negatives bundle exists).
#   * Each raw bundle has been converted (scripts/convert_dataset.py)
#     to data/converted/<name>/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

OUTPUT="${OUTPUT:-data/merged/sprint16_v2}"
MAX_PER_CLASS="${MAX_PER_CLASS:-2000}"
MIN_PER_CLASS="${MIN_PER_CLASS:-50}"
SEED="${SEED:-42}"

# Sources: Sprint 15 v1.0 carry-overs + Sprint 16 additions + negatives.
SOURCES=(
  # Sprint 15 carry-over (phone, earbuds, book, smart_watch)
  data/converted/coco_phone_book
  data/converted/oid_mobile_phone
  data/converted/oid_book
  data/converted/oid_headphones_in_ear
  data/converted/oid_watch
  data/converted/roboflow_phone_on_desk
  data/converted/roboflow_earbuds
  data/converted/roboflow_smartwatch
  data/converted/roboflow_paper_notes
  # Sprint 16 additions
  data/converted/oid_pencil_case
  data/converted/oid_calculator
  data/converted/roboflow_pencil_case
  data/converted/roboflow_calculator
  data/converted/roboflow_cheat_sheets
  data/converted/roboflow_hidden_notes
  # Negatives (BL-291) — manifest-detected, no class mapping needed
  data/raw/negatives_legit_paper
)

# Filter to existing sources so a missing optional bundle doesn't break
# the merge — log what's missing.
ACTUAL_SOURCES=()
MISSING=()
for s in "${SOURCES[@]}"; do
  if [ -d "$s" ]; then
    ACTUAL_SOURCES+=("$s")
  else
    MISSING+=("$s")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "⚠ Skipping missing sources:"
  printf '   %s\n' "${MISSING[@]}"
fi

if [ "${#ACTUAL_SOURCES[@]}" -lt 2 ]; then
  echo "ERROR: at least two source bundles required, got ${#ACTUAL_SOURCES[@]}." >&2
  exit 2
fi

echo "→ Sprint 16 v2.0 merge:"
echo "  sources: ${#ACTUAL_SOURCES[@]} bundles"
echo "  output:  ${OUTPUT}"
echo "  caps:    max=${MAX_PER_CLASS}, min=${MIN_PER_CLASS}, seed=${SEED}"

python -m scripts.merge_datasets \
  --sources       "${ACTUAL_SOURCES[@]}" \
  --class-map     ai-service/configs/class_mapping.yaml \
  --output        "${OUTPUT}" \
  --max-per-class "${MAX_PER_CLASS}" \
  --min-per-class "${MIN_PER_CLASS}" \
  --split-ratio   "0.7:0.2:0.1" \
  --seed          "${SEED}"

python -m scripts.validate_dataset \
  --path          "${OUTPUT}" \
  --output-report "${OUTPUT}/quality_report.json" \
  --no-duplicates

echo "✓ v2.0 corpus ready: ${OUTPUT}"
echo "  Next: scripts/sprint16_train_v2.sh"

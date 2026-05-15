#!/usr/bin/env bash
# Sprint 16 (BL-289 + BL-290 + BL-292) — paper_notes / pencil_case /
# calculator / cheat-sheet fetch.
# PRD-021 §3 Sprint 16. Replaces the internal-controlled capture
# (BL-286/287) with public-set pulls per
# docs/sprint16-external-only-workflow.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

OID_PENCIL_MAX="${OID_PENCIL_MAX:-1500}"
OID_CALC_MAX="${OID_CALC_MAX:-1200}"

# ── 1. OID — Pencil case (Open Images class "Pencil case")
echo "→ OID 'Pencil case' (max ${OID_PENCIL_MAX})"
python -m scripts.import_dataset \
  --source       open_images \
  --classes      "Pencil case" \
  --max-samples  "${OID_PENCIL_MAX}" \
  --split        train \
  --output       data/raw/oid_pencil_case

# ── 2. OID — Calculator (Open Images class "Calculator")
echo "→ OID 'Calculator' (max ${OID_CALC_MAX})"
python -m scripts.import_dataset \
  --source       open_images \
  --classes      "Calculator" \
  --max-samples  "${OID_CALC_MAX}" \
  --split        train \
  --output       data/raw/oid_calculator

# ── 3. Roboflow — pencil_case, calculator, cheat-sheets (BL-292)
# Requires ROBOFLOW_API_KEY. The bundles list below is editable; see
# docs/sprint16-cheat-sheet-scout.md for the acceptance gates.
if [ -n "${ROBOFLOW_API_KEY:-}" ]; then
  WORKSPACE="${ROBOFLOW_WORKSPACE:-horuseye}"
  ROBOFLOW_BUNDLES=(
    "pencil-case-detection 1 roboflow_pencil_case"
    "calculator-detection  1 roboflow_calculator"
    "cheat-sheets          1 roboflow_cheat_sheets"
    "hidden-notes          1 roboflow_hidden_notes"
  )
  for row in "${ROBOFLOW_BUNDLES[@]}"; do
    # shellcheck disable=SC2086
    set -- $row
    project="$1" version="$2" outdir="$3"
    echo "→ Roboflow ${WORKSPACE}/${project} v${version}"
    python -m scripts.import_dataset \
      --source     roboflow \
      --workspace  "${WORKSPACE}" \
      --project    "${project}" \
      --version    "${version}" \
      --format     yolov8 \
      --output     "data/raw/${outdir}"
  done
else
  echo "⚠ ROBOFLOW_API_KEY not set — skipping Roboflow bundles."
  echo "  Set it (1Password: 'Roboflow Universe — HorusEye CI') and re-run to pull cheat-sheet/hidden-notes."
fi

cat <<'EOM'
✓ Sprint 16 external bundles fetched.
  Next:
    1. Convert each bundle to YOLO (scripts/convert_dataset.py)
    2. Validate (scripts/validate_dataset.py)
    3. Merge into v2.0 (scripts/sprint16_merge_v2.sh)
EOM

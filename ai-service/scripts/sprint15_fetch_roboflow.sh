#!/usr/bin/env bash
# Sprint 15 (BL-276) — Roboflow Universe fetch.
# PRD-021 §3 Sprint 15 / see docs/sprint15-roboflow-scout.md for the
# acceptance gates and the rationale behind each pick.
#
# Requires ROBOFLOW_API_KEY in the env (1Password: "Roboflow Universe —
# HorusEye CI").

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

if [ -z "${ROBOFLOW_API_KEY:-}" ]; then
  echo "ERROR: ROBOFLOW_API_KEY not set. See docs/sprint15-roboflow-scout.md" >&2
  exit 1
fi

# Each row: workspace project version → output dir.
# Bump the version field whenever Roboflow publishes a new revision and
# the scout-doc gates pass on the new bundle.
ROBOFLOW_BUNDLES=(
  "proctoring-systems phone-on-desk    3 roboflow_phone_on_desk"
  "wearables-lab      earbuds-detection 2 roboflow_earbuds"
  "wearables-lab      smartwatch-detect 4 roboflow_smartwatch"
  "exam-cv            cheat-paper-notes 1 roboflow_paper_notes"
)

for row in "${ROBOFLOW_BUNDLES[@]}"; do
  # shellcheck disable=SC2086
  set -- $row
  workspace="$1" project="$2" version="$3" outdir="$4"
  echo "→ Roboflow ${workspace}/${project} v${version} → data/raw/${outdir}"
  python -m scripts.import_dataset \
    --source     roboflow \
    --workspace  "${workspace}" \
    --project    "${project}" \
    --version    "${version}" \
    --format     yolov8 \
    --output     "data/raw/${outdir}"
done

cat <<'EOM'
✓ Roboflow bundles pulled.
  Acceptance gates: see docs/sprint15-roboflow-scout.md before merging.
  Next: convert → validate → merge (BL-262).
EOM

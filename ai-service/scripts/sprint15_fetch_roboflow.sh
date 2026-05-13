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

# Workspace defaults to our own HorusEye workspace. Override only when
# importing from someone else's public Universe workspace.
WORKSPACE="${ROBOFLOW_WORKSPACE:-horuseye}"

# Each row: project version → output dir. Workspace is shared (above).
# Bump the version field whenever Roboflow publishes a new revision and
# the scout-doc gates pass on the new bundle. Project slugs MUST match
# the project names you create in the Roboflow workspace.
ROBOFLOW_BUNDLES=(
  "phone-on-desk     1 roboflow_phone_on_desk"
  "earbuds-detection 1 roboflow_earbuds"
  "smartwatch-detect 1 roboflow_smartwatch"
  "cheat-paper-notes 1 roboflow_paper_notes"
)

for row in "${ROBOFLOW_BUNDLES[@]}"; do
  # shellcheck disable=SC2086
  set -- $row
  project="$1" version="$2" outdir="$3"
  echo "→ Roboflow ${WORKSPACE}/${project} v${version} → data/raw/${outdir}"
  python -m scripts.import_dataset \
    --source     roboflow \
    --workspace  "${WORKSPACE}" \
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

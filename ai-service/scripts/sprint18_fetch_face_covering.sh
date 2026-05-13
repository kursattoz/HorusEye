#!/usr/bin/env bash
# Sprint 18 (BL-320) — MaskedFace-Net + WIDER FACE fetch.
# PRD-021 §3 Sprint 18. Pulls public datasets for the face_covering
# rule's positive (masked / scarf / sunglasses) and negative (clean
# face, varied poses) class sets.
#
# Datasets:
#   - MaskedFace-Net (CC-BY 4.0): 137k masked-face simulations. Includes
#     correctly + incorrectly worn mask subsets.
#   - WIDER FACE (CC-BY 4.0): large unrestricted face set; we use it
#     ONLY as the negative class so face_covering doesn't false-positive
#     on hair / hands / shadows.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

MASKED_MAX="${MASKED_MAX:-3000}"
WIDER_MAX="${WIDER_MAX:-3000}"

# MaskedFace-Net is hosted as a single Google Drive zip; we wrap a
# python helper because curl + Drive's confirm-token flow is brittle.
echo "→ MaskedFace-Net (max ${MASKED_MAX})"
python -m scripts.import_dataset_masked_faces \
  --max-samples  "${MASKED_MAX}" \
  --output       data/raw/masked_face_net

# WIDER FACE — fetch via FiftyOne zoo as the "WIDERFACE" plugin doesn't
# ship in the core zoo by default. The wrapper checks for an installed
# plugin and falls back to the direct download if missing.
echo "→ WIDER FACE (max ${WIDER_MAX} negatives)"
python -m scripts.import_dataset_wider_face \
  --max-samples  "${WIDER_MAX}" \
  --output       data/raw/wider_face_negatives

cat <<'EOM'
✓ face_covering datasets ready.
  Next:
    1. Convert + validate each bundle (scripts/convert_dataset.py)
    2. Add to class_mapping.yaml (face_covering = class id 7)
    3. Merge into v3.0 corpus for the next training run.
EOM

#!/usr/bin/env bash
# Sprint 15 (BL-285) — Fallback augmentation: Objects365 + LVIS.
# PRD-021 §3 Sprint 15: if per-class image counts are still under the
# §8.2 target after Roboflow + OID + internal, fall back to Objects365
# (cell phone, book, watch) and LVIS (cellphone, book, earphone) to
# top up.
#
# This script does NOT pull the entire Objects365 / LVIS sets (multi-GB)
# — it filters them down to the few classes we care about so the disk
# bill stays sane. Defaults: 1000 images per source × per class.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

OBJECTS365_MAX="${OBJECTS365_MAX:-1000}"
LVIS_MAX="${LVIS_MAX:-1000}"

# FiftyOne zoo handles both Objects365 and LVIS — the underlying
# scripts.import_dataset shim already wraps FiftyOne for OID + COCO; we
# add the two new zoo names with the same flag surface.

if ! python -c "import fiftyone" 2>/dev/null; then
  echo "ERROR: fiftyone not installed. \`pip install fiftyone\` (heavy install)." >&2
  exit 2
fi

echo "→ Objects365 phone subset (Cell phone, max ${OBJECTS365_MAX})"
python -m scripts.import_dataset_objects365 \
  --classes      "Cell phone,Book,Watch" \
  --max-samples  "${OBJECTS365_MAX}" \
  --output       data/raw/objects365_phone_book_watch

echo "→ LVIS subset (cellphone, book, earphone, max ${LVIS_MAX})"
python -m scripts.import_dataset_lvis \
  --classes      "cellphone,book,earphone" \
  --max-samples  "${LVIS_MAX}" \
  --output       data/raw/lvis_phone_book_earphone

cat <<'EOM'
✓ Fallback augmentation bundles fetched.

NOTE: these are LOW-PRIORITY top-ups. Only merge them if the main merge
(Roboflow + OID + COCO + internal) leaves any class below 500 images.
Re-run scripts.validate_dataset on the merged corpus and check
after_cleanup.class_distribution — if a class is still under 500, add
data/raw/objects365_* or data/raw/lvis_* to the merge --sources list.

The import wrappers `scripts/import_dataset_objects365.py` and
`scripts/import_dataset_lvis.py` are documented in
docs/sprint15-augmentation.md.
EOM

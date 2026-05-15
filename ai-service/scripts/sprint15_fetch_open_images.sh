#!/usr/bin/env bash
# Sprint 15 (BL-275) — Open Images V7 fetch.
# PRD-021 §3 Sprint 15: OID supplies the largest non-COCO phone corpus
# AND the only public earbuds proxy ("Headphones"). The Headphones bundle
# needs BL-277 in-ear post-filter before merging — over-ear is NOT what
# we want for sınav (in-ear / true wireless earbuds).
#
# Output: ai-service/data/raw/oid_{mobile_phone,book,headphones,wrist}/
#
# Override sample caps via env:
#   OID_PHONE_MAX=3000 OID_BOOK_MAX=1500 ./scripts/sprint15_fetch_open_images.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

OID_PHONE_MAX="${OID_PHONE_MAX:-3000}"
OID_BOOK_MAX="${OID_BOOK_MAX:-1500}"
OID_HEADPHONES_MAX="${OID_HEADPHONES_MAX:-2000}"
OID_WRIST_MAX="${OID_WRIST_MAX:-1500}"

echo "→ Open Images V7 phone subset (Mobile phone, max ${OID_PHONE_MAX})"
python -m scripts.import_dataset \
  --source       open_images \
  --classes      "Mobile phone" \
  --max-samples  "${OID_PHONE_MAX}" \
  --split        train \
  --output       data/raw/oid_mobile_phone

echo "→ Open Images V7 book subset (Book, max ${OID_BOOK_MAX})"
python -m scripts.import_dataset \
  --source       open_images \
  --classes      "Book" \
  --max-samples  "${OID_BOOK_MAX}" \
  --split        train \
  --output       data/raw/oid_book

echo "→ Open Images V7 Headphones (max ${OID_HEADPHONES_MAX}) — IN-EAR FILTER REQUIRED (BL-277)"
python -m scripts.import_dataset \
  --source       open_images \
  --classes      "Headphones" \
  --max-samples  "${OID_HEADPHONES_MAX}" \
  --split        train \
  --output       data/raw/oid_headphones

echo "→ Open Images V7 wrist proxy (Watch, max ${OID_WRIST_MAX}) — Sprint 15 smartwatch class"
python -m scripts.import_dataset \
  --source       open_images \
  --classes      "Watch" \
  --max-samples  "${OID_WRIST_MAX}" \
  --split        train \
  --output       data/raw/oid_watch

cat <<EOM
✓ Open Images V7 subsets ready under data/raw/oid_*/

NEXT STEPS:
  1. BL-277 in-ear filter:
       python -m scripts.filter_headphones_in_ear \\
         --input  data/raw/oid_headphones \\
         --output data/raw/oid_headphones_in_ear
  2. Convert each subset:
       for ds in oid_mobile_phone oid_book oid_headphones_in_ear oid_watch; do
         python -m scripts.convert_dataset \\
           --source data/raw/\${ds} \\
           --target data/converted/\${ds} \\
           --format yolov8 \\
           --class-map "\$(cat configs/class_mapping.yaml)"
       done
EOM

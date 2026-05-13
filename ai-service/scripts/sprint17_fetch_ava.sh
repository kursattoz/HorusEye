#!/usr/bin/env bash
# Sprint 17 (BL-303) — AVA Actions subset (OPTIONAL).
# PRD-021 §3 Sprint 17. Pulls a handful of action classes from the AVA
# Atomic Visual Actions dataset for use as priors IF a Sprint 17 rule
# later needs an ML classifier. The default Sprint 17 rules are pure
# geometry over PoseSignal (BL-297..308) and don't need this fetch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

AVA_CLASSES="${AVA_CLASSES:-stand,sit,lean,bend/bow_(at_the_waist),touch_(an_object),pass_(an_object)}"
AVA_MAX_SAMPLES="${AVA_MAX_SAMPLES:-1500}"
AVA_OUTPUT="${AVA_OUTPUT:-data/raw/ava_actions_sprint17}"

if ! python -c "import fiftyone" 2>/dev/null; then
  echo "ERROR: fiftyone not installed. \`pip install fiftyone\` first." >&2
  exit 2
fi

python - <<PY
import fiftyone as fo
import fiftyone.zoo as foz
ds = foz.load_zoo_dataset(
    "ava-2.2",
    split="train",
    classes="${AVA_CLASSES}".split(","),
    max_samples=${AVA_MAX_SAMPLES},
    dataset_name="ava_sprint17",
)
ds.export(
    export_dir="${AVA_OUTPUT}",
    dataset_type=fo.types.FiftyOneVideoLabelsDataset,
)
print(f"✓ exported {len(ds)} clips → ${AVA_OUTPUT}")
PY

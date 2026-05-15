# Roboflow Workspace Setup Runbook

End-to-end recipe for populating the `horuseye` Roboflow workspace
with the datasets our training scripts expect. You only do this
**once per dataset** — after that the `train_v1.sh` orchestrator pulls
them automatically.

## Two paths, pick one per dataset

### Path A — Fork an existing Universe dataset (recommended)
Roboflow Universe is the public marketplace. Most of what we need is
already there; we just need to **fork** a copy into our workspace so
we can pin a version we control.

### Path B — Create our own from internal frames
For paper_notes / cheat-sheet specifically, public sets are noisy. If
none of the Universe options pass the gates below, upload internal
controlled-test frames + annotate in Roboflow's web tool. Same
workspace, just a different origin. Higher quality but ~4h of
annotation work per dataset.

---

## Acceptance gates (per dataset)

Same gates as `sprint15-roboflow-scout.md`:

- [ ] License permits commercial use (CC-BY 4.0 / CC0 / MIT / Apache 2.0). **Reject** CC-BY-NC.
- [ ] ≥ 500 unique images (300 for cheat-sheet which is rarer).
- [ ] Resolution ≥ 320×320.
- [ ] Annotations are bbox YOLO format (NOT polygon / keypoint / classification-only).
- [ ] Spot-check 50 random samples — no watermarks, no obvious mislabels.

---

## Required projects

The scripts pull each project by `(workspace, project_slug, version)`.
After forking, **either match these slugs OR update the script
config** (one-line change in `scripts/sprint15_fetch_roboflow.sh` /
`scripts/sprint16_fetch_external.sh`).

| Script expects slug          | Maps to class    | Universe search keywords                  | Sprint |
|------------------------------|------------------|-------------------------------------------|--------|
| `phone-on-desk`              | phone            | "phone on desk", "cell phone classroom"   | 15     |
| `earbuds-detection`          | earbuds          | "earbuds", "airpods", "tws earbuds"       | 15     |
| `smartwatch-detect`          | smart_watch      | "smartwatch", "apple watch", "wrist watch"| 15     |
| `cheat-paper-notes`          | paper_notes      | "cheat sheet", "exam paper", "notes"      | 15+16  |
| `pencil-case-detection`      | pencil_case      | "pencil case", "stationery"               | 16     |
| `calculator-detection`       | calculator       | "calculator", "scientific calculator"     | 16     |
| `cheat-sheets`               | paper_notes      | "cheat sheet", "hidden notes"             | 16     |
| `hidden-notes`               | paper_notes      | "hidden paper", "concealed notes"         | 16     |

---

## Step-by-step (per dataset)

1. **Search Universe**: open https://universe.roboflow.com and search the keywords from the table.
2. **Filter**: in the left sidebar — License (commercial OK), Annotation type (Bounding Box), ≥ 500 images.
3. **Spot-check 50 random samples** on the dataset's preview page. Reject if you see watermarks, mislabeled classes, or systematic capture artifacts.
4. **Fork to workspace**:
    - On the dataset page click "Fork to your workspace"
    - Pick `horuseye`
    - Name the fork to match the slug column above (e.g. `phone-on-desk`). If the source name is different, rename after forking via Project Settings → Rename.
5. **Generate a v1 version**:
    - Inside your forked project → "Versions" tab → "Generate New Version"
    - Preprocessing: Auto-orient + Resize 640×640 (matches our YOLOv8 input)
    - Augmentations: leave default (we layer our own in `scripts/augment_dataset.py` later)
    - Click "Generate" — takes ~1 min
6. **Verify download works** locally:

    ```bash
    cd ai-service
    source .env
    python -c "
    from roboflow import Roboflow
    import os
    rf = Roboflow(api_key=os.environ['ROBOFLOW_API_KEY'])
    proj = rf.workspace('horuseye').project('phone-on-desk')
    print(proj.versions())
    "
    ```

    Expect to see a version list with `version=1`.

7. **Repeat** for each row in the table. ~10 minutes per dataset.

---

## After all datasets are forked

Run the orchestrator end-to-end:

```bash
cd ai-service
source .env                                  # picks up ROBOFLOW_API_KEY + WORKSPACE from SSM-synced .env

./scripts/train_v1.sh --dry-run --device cuda:0   # sanity check first
./scripts/train_v1.sh --device cuda:0              # ~3-6 h on T4 GPU
```

Expected output structure:
```
data/raw/roboflow_phone_on_desk/
data/raw/roboflow_earbuds/
data/raw/roboflow_smartwatch/
data/raw/roboflow_paper_notes/
...
data/merged/sprint15_v1/data.yaml
runs/sprint15_v1/weights/best.pt
build/benchmark_sprint15_v1.json
```

---

## If a Universe dataset doesn't pass the gates

Switch to **Path B (own project)**:

1. Roboflow workspace → "Create New Project"
2. Name = same slug we expect (e.g. `cheat-sheets`)
3. Project type = "Object Detection", Class = the matching class name (e.g. `cheat_sheet`)
4. Upload internal controlled-test frames (`data/internal/controlled_tests/*.jpg`)
5. Annotate in the web tool. ~80-100 frames is enough to start; scale up if precision is low.
6. Generate v1 version (same preprocessing as above)
7. Re-run `train_v1.sh`

---

## Updating the script config

If you forked with a different slug than the table expects, edit
`scripts/sprint15_fetch_roboflow.sh` (or `sprint16_fetch_external.sh`)
and replace the project field. The arrays look like:

```bash
ROBOFLOW_BUNDLES=(
  "phone-on-desk     1 roboflow_phone_on_desk"
  ^^^^^^^^^^^^^^^
  project slug — change this if your fork has a different name
                  1 = version, then the output dir name
)
```

The `class_mapping.yaml` keys also need to match the class names your
forked dataset uses. Inspect with:

```bash
cat data/raw/roboflow_phone_on_desk/data.yaml | grep -A 20 names:
```

…then append the names → target-class-id mapping to the
`source_mappings.roboflow_phone_on_desk` block in
`ai-service/configs/class_mapping.yaml`.

---

## Common failures

| Symptom | Fix |
|---|---|
| `roboflow.exceptions.UploadFail` / 401 | API key wrong — re-check `echo ${ROBOFLOW_API_KEY:0:4}` |
| `Project 'foo' not found` | Project slug doesn't match. Run `python -c "from roboflow import Roboflow; ..."` to list your workspace's projects |
| `No version 1 found` | Forked the dataset but didn't click "Generate New Version" — go back to step 5 |
| Merge step "no samples survived class mapping" | `class_mapping.yaml` doesn't list the source's class names — `cat data.yaml` and update mappings |
| Roboflow rate-limit (HTTP 429) | Free tier limit — wait 60s, or downgrade `--max-samples` |

---

## Time estimate

- 8 Roboflow projects forked + versions generated: ~80 minutes
- Path B (own project, single annotation pass for cheat-sheet): +4 hours
- Full training run after datasets are in place: ~3-6 hours on T4 GPU

Total: **2 hours forking + 1 evening training**.

# Sprint 15 — İç-Controlled Capture Runbook (BL-278)

**Status:** manual execution, owned by **project_coordinator**.
**Estimated:** ~12 hours over 2 sessions (1 day prep + 1 day shoot).

PRD-021 §3 Sprint 15 + PRD-017 §11.2 controlled-test protocol. We
record 3 staged exam scenarios (S2, S3, S4) with volunteer participants
to seed the internal half of the Sprint 15 dataset. These recordings
join the merged corpus alongside Roboflow / OID / COCO data
(see PRD-017 §9 stratified split).

## Why staged (not real exam) data

PRD-017 §18.4 — anonymized real-exam frames need § extensive consent
flow. Controlled capture skips that: each volunteer signs a single
consent form (PRD-017 §18.4 template). Trade-off is the dataset will
look "lab-y" — fewer angles, fewer faces, controlled lighting. That's
why we mix it with Roboflow/OID instead of using internal-only.

## Scenarios

| Code | Title                                | Goal                                                   | Props                                | Duration |
|------|--------------------------------------|--------------------------------------------------------|--------------------------------------|----------|
| S2   | **Phone in hand / on lap**           | Phone class — varying poses, palm grips, lap angles    | 3× phones (Android+iOS, dark+light) | ~30 min  |
| S3   | **Earbuds + smartwatch combo**       | Earbuds + smart_watch classes — wrist & ear visibility | AirPods, Galaxy Buds, 2× watches    | ~30 min  |
| S4   | **Mixed legitimate + illicit items** | Hard negatives — book/pen/water bottle/eraser visible  | Standard exam props                  | ~30 min  |

## Pre-shoot checklist (1 day prep, ~3 hours)

- [ ] Recruit 4-6 volunteers (mix of clothing colors + sleeve lengths)
- [ ] Print PRD-017 §18.4 consent forms — one per volunteer
- [ ] Reserve a classroom or quiet meeting room
- [ ] Camera kit:
    - [ ] One fixed IP camera at desk-front (matches sınav rig)
    - [ ] One phone-side IP cam (matches PRD-019 mobile cam)
    - [ ] Tripod, extension cord, SD cards / streaming target
- [ ] Lighting: open blinds + overhead — match a typical classroom
- [ ] Props ready (per the scenario table above)
- [ ] Confirm `data/internal/controlled_tests/` is empty before the shoot
- [ ] Set the cameras to **5 fps, 1080p** (matches PRD-013 §12.1
       ingestion target)

## Shoot protocol (~9 hours)

Per volunteer (rotate through; each block ≈ 30 min):

1. Volunteer signs consent form. File photocopy under
   `docs/internal/consents/<YYYY-MM-DD>-<initials>.pdf`.
2. Recorder runs `scripts/sprint15_record_session.sh` (see below) which
   captures both feeds simultaneously to `data/internal/controlled_tests/raw/<volunteer-code>/<scenario>/`.
3. Volunteer performs the scenario script (one shot per scenario, no
   takes). Recorder reads cue prompts ("now hold phone in left hand at
   chest level… now switch to lap… now check time on smart watch").
4. After every shot, dump the raw video into the bundle and tag with a
   metadata file:

   ```bash
   python -m scripts.extract_test_frames \
     --video    data/internal/controlled_tests/raw/<vol>/<scenario>.mp4 \
     --output   data/internal/controlled_tests/frames/<vol>/<scenario>/ \
     --fps      2
   ```

   (Why 2 fps for extraction even though we record at 5 fps? Per-frame
   diversity matters more than continuity for labelling.)

5. Cross out the consent form box "Recording confirmed."

## After the shoot (~2 hours)

1. Aggregate frames:
   ```bash
   python -m scripts.merge_internal_frames \
     --root  data/internal/controlled_tests/frames/ \
     --output data/internal/controlled_tests/all_frames/
   ```
   *(This script doesn't exist yet — Sprint 16 ticket. For Sprint 15
   the project coordinator can just do `mv` manually; we have ≤ 700
   frames total so it's a 5-minute operation.)*

2. Hand the frame set off to **BL-280** (CVAT annotation). The frames
   go straight into CVAT — anonymization happens AFTER labelling (PRD-017
   §18.3 — the labeller needs to see faces to draw bboxes correctly;
   anonymize_frame.py runs on the final export).

3. After CVAT export, run anonymizer on the labelled set:
   ```bash
   python -m scripts.anonymize_frame \
     --input  data/internal/controlled_tests/frames/ \
     --output data/internal/positives/sprint15_controlled/ \
     --backend opencv \
     --report  data/internal/positives/sprint15_controlled/anonymize_report.json
   ```

## Sign-off

The shoot is complete when:

- [ ] 4-6 volunteer consent forms filed.
- [ ] ≥ 600 frames in `data/internal/controlled_tests/frames/`.
- [ ] Coverage matrix verified (every scenario × every volunteer has a clip).
- [ ] Frames are de-duped (`scripts/validate_dataset.py --no-duplicates flag NOT set`).

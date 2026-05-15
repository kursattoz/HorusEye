# Sprint 16 — External-Only Workflow (BL-286 / BL-287 supersession)

**Decision:** Sprint 16 drops the internal-controlled capture for
`paper_notes`, `pencil_case`, and `calculator` classes. The original
plan (PRD-021 §3 Sprint 16 BL-286 + BL-287) required:

- BL-286: scenario spec S1 + S6, 4h project_coordinator
- BL-287: 3 people × 6 scenarios × 3 lightings × 2 cameras shoot, 16h

That's ~20 hours of physical work for ~700 frames. We're getting better
ROI from the public sets:

| Class         | Primary sources                                                                          | Estimated images |
|---------------|------------------------------------------------------------------------------------------|------------------|
| `paper_notes` | Roboflow (cheat-paper-notes v1 from Sprint 15) + Roboflow `cheat-sheets` + LVIS `paper` | ~3500            |
| `pencil_case` | Roboflow `pencil-case-detection` + OID `Pencil case`                                     | ~1500            |
| `calculator`  | Roboflow `calculator-detection` + OID `Calculator`                                       | ~1200            |

This is more than the 700-frame internal target and covers more poses
+ lightings than a 3-person shoot can produce.

## What we lose, what we keep

- **Lose:** real classroom anchoring. Public sets have desk/office
  shots but rarely a full exam-room top-down view.
- **Keep:** any frames the Sprint 15 controlled capture already shot —
  they get pulled into the merge as the `internal/sprint15_*` source
  (BL-280). If a coordinator finds time for an opportunistic re-shoot,
  the same pipeline accepts it (no protocol changes needed).

## Compensating for the "real classroom" gap

1. After v2.0 fine-tune (BL-294), run the A/B comparator (BL-284) on
   the Sprint 15 frozen benchmark. Any class with F1 < 0.70 means the
   public-set distribution misses our classroom domain; flag for a
   targeted top-up.
2. Internal evidence frames (PRD-017 §18.3) collected from real exam
   incidents flow into `internal_training_samples` automatically (BL-270);
   they form the **next** dataset version without an explicit shoot.

## Net effect on Sprint 16 backlog

| BL    | Status                                                                          |
|-------|---------------------------------------------------------------------------------|
| 286   | superseded — this doc                                                           |
| 287   | superseded — this doc                                                           |
| 288   | retained — frame extraction + pre-label runs on whatever frames the coordinator may opportunistically shoot. |
| 289-294 | retained — public-dataset path                                                |
| 295   | retained — deploy gate (relevant regardless of capture source)                  |

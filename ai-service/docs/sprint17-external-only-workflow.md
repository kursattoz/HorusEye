# Sprint 17 — External-Only Workflow (BL-301 / BL-302 supersession)

**Decision:** Sprint 17 drops the internal-controlled S5 capture
(BL-301) and the frame-level action annotation (BL-302). The 8
behavior rules (BL-297..308) are **geometric over PoseSignal**, not
learned classifiers — they don't need labelled training data, they
need threshold tuning against real recordings.

## Threshold tuning instead

Each rule ships with a `<Rule>Config` dataclass that's pure-Python
tunable:

```python
BodyLeanConfig(lean_threshold=0.12, sustained_seconds=2.5, ...)
HandUnderDeskConfig(desk_y_threshold=0.80, sustained_seconds=2.5, ...)
GazeAtLapConfig(nose_below_min_dy=0.20, sustained_seconds=3.0, ...)
...
```

The post-deploy proctor decisions (PRD-013 §7.1) provide ground truth
without any manual capture: every incident produced by these rules
gets a decision (`clean` / `suspicious` / `violation`), and we already
have the `/api/ai-models/metrics` endpoint (BL-208 from Sprint 9) that
computes per-rule precision from those decisions.

## Tuning loop

1. Deploy v3.0 (Sprint 17 rules enabled) to staging with the default
   thresholds in each config.
2. Soak for one full week of real exam sessions.
3. Open `/exams/analytics` (BL-243). For each new rule, check
   precision (true-violation / (true-violation + cleared)).
4. If precision < 0.65 for a rule, raise its `sustained_seconds` or
   tighten the geometric threshold. Re-deploy.
5. Once all rules ≥ 0.65 precision, promote to production
   (deploy_runbook patterns from `sprint16-deploy-runbook.md`).

## Optional AVA Actions priors

BL-303 (AVA Actions subset) remains as an OPTIONAL augmentation —
useful only if a rule turns out to need an ML classifier instead of
geometry. Document `scripts/sprint17_fetch_ava.sh` is provided but
not required for the v3.0 deploy.

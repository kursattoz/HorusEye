# Sprint 11 — Student Profile + Risk Model (BL-224..234)

Closes Sprint 11. All 11 backlog items implemented, in-DB statuses moved to `done`.

## Summary
- **Risk model** (BL-225, BL-233): weighted-severity rolling-90d score per student persisted on `students.risk_*` cache columns; refreshed by trigger on incident insert and by a session-scope RPC. Incident RLS tightened to admin or session proctor.
- **Profile UI** (BL-224, BL-227, BL-231, BL-230): `/students/[id]` profile page with risk card, severity-colored chronological timeline, 90d frequency + by-type charts. Risk badge on StudentsTable + SessionAssignModal student tiles.
- **API** (BL-226): `/api/students/[id]/profile` and `/api/students/[id]/incidents` with pre-aggregated chart payload.
- **AI scoring** (BL-228, BL-232): per-student behavior patterns (`chronic_phone_use`, `sustained_interaction`); per-student calibration override table — admin can shift severity ladder by ±2 or set a min-confidence floor.
- **Notifications** (BL-229): chief proctor gets a pre-session warning the moment a session goes `active` if any enrolled student has `risk_level ≥ high`. Manual trigger endpoint also available.
- **Tests** (BL-234): 18 unit tests (behavior patterns + calibration bump), DB-side integration smoke run.

## Schema changes
- `20260513072115_create_student_risk_model.sql` — `students.risk_*` columns, `calculate_student_risk` / `refresh_student_risk` / `refresh_session_students_risk` RPCs, incident-insert trigger
- `20260513072341_student_profile_rls.sql` — `user_is_admin`, `user_proctors_session`, `user_proctors_student` helpers; tightened `incidents` policies
- `20260513073632_student_calibration_overrides.sql` — `student_calibration` table

## Interface bumps
- `Student @1.1 → @1.2` (PRD-000, PRD-013, PRD-020)

## Test plan
- [ ] Open `/students` — Risk column visible, badge only on medium+
- [ ] Click a student row → profile page loads, three tabs (Timeline / Charts / Sessions)
- [ ] Insert a fake incident via SQL → reload profile → risk cache reflects it
- [ ] PUT `/api/students/[id]/calibration` `{severity_bump: 1}` → fire a fresh incident → confirm severity bumped one rung
- [ ] PUT `/api/exam-sessions/[id]` `{status: 'active'}` with high-risk students enrolled → chief proctor receives notification
- [ ] AI tests: `cd ai-service && .venv/bin/python -m pytest tests/test_behavior_patterns.py tests/test_calibration_bump.py`
- [ ] Manual: scroll `BehaviorPatterns` log entries during a stream session to confirm `chronic_phone_use` fires after 3 within 10 min.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

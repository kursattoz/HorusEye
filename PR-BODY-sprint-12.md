# Sprint 12 — Review Workflow + Reports (BL-235..245)

Closes Sprint 12. 11 backlog items implemented, in-DB statuses moved to `done`.

## Summary
- **Review** (BL-235, BL-236, BL-237, BL-238): `/exams/[id]/review` post-exam decision page with kanban-style queue, severity-aware decision modal (clean / suspicious / violation + escalate), bulk action toolbar, and a ±15s evidence clip strip composed from neighboring incidents.
- **Audit** (BL-241): structured `logIncidentDecision` helper feeds every modal + bulk + API decision into `audit_logs` with a uniform metadata shape. Violations escalate severity to `warn`.
- **Reports** (BL-239, BL-240, BL-242): PDF generation via `@react-pdf/renderer` for per-exam / per-session / per-student scopes. SMTP email distribution with attachment via `lib/mailer`. Legal-hold evidence export bundles every JPEG into a zip with a SHA-256 manifest.
- **Notifications** (BL-244): "Report emailed" admin notification fires from the email distribution endpoint.
- **Analytics** (BL-243): `/exams/analytics` 180-day trends dashboard — per-month stacked decision bars, top-10 incident types, per-exam decision breakdown, avg decision latency.
- **Tests** (BL-245): vitest suites covering PDF generation + audit helper metadata shape.

## New endpoints
- `GET /api/incidents/[id]/context` — ±15s evidence neighbors
- `POST /api/incidents/bulk-decide` — bulk decision with shared `bulk_operation_id`
- `GET /api/exams/[id]/reports/pdf?scope=exam|session|student` — PDF report
- `POST /api/exams/[id]/reports/email` — email PDF
- `GET /api/exams/[id]/evidence-export?session_id=…` — zip + manifest (admin only)
- `GET /api/exams/analytics` — cross-exam aggregations

## New pages
- `/exams/[id]/review` — decision queue with bulk + modal
- `/exams/analytics` — trends dashboard

## Dependencies added
- `@react-pdf/renderer ^4.5.1` — pure-React PDF generation
- `jszip ^3.10.1` — evidence export packing

## Schema changes
None. The existing `incidents.proctor_decision / decision_note / decided_by / decided_at` columns cover the review workflow.

## Test plan
- [ ] Open `/exams/[id]/review` with a session that has incidents → modal opens on row click, decision saves, queue refreshes
- [ ] Select N rows → click "Mark clean" → all flip to `clean`; `audit_logs` query shows N rows sharing the same `bulk_operation_id`
- [ ] Click "Escalate" inside decision modal → `decision_note` prefixed with `[ESCALATED]`
- [ ] Hit `GET /api/exams/[id]/reports/pdf?scope=exam` → browser downloads a valid PDF
- [ ] `POST /api/exams/[id]/reports/email` with `recipients` → SMTP receives attachment + admins get an in-app banner
- [ ] `GET /api/exams/[id]/evidence-export` as admin → zip downloads, `manifest.json` SHA-256 matches the files
- [ ] Visit `/exams/analytics` → 180d aggregates render; numbers match a manual `select count(*)` cross-check
- [ ] Vitest: `cd portal && npx vitest run tests/unit/lib/incident-report-pdf.test.ts tests/unit/lib/incident-decision-audit.test.ts`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

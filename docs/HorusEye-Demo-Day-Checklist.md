# HorusEye — Demo Day Preparation Checklist (BL-167)

**Demo date:** 2026-05-22
**Lead:** Taha Kürşat (product_owner)

---

## T-7 days

- [ ] Confirm jury time slot + room with the supervisor
- [ ] Decide live demo vs pre-recorded — recommend hybrid (recording as
      backup, live during Q&A)
- [ ] Each member confirms they have access to all envs (portal, Supabase,
      AWS, GitHub)
- [ ] Lock the Sprint 4 backlog — anything not P0 stays out
- [ ] Run a full dry run end-to-end (all five members in the call)

## T-3 days

- [ ] Run `npm run build` on a fresh clone — no failures
- [ ] Run `docker compose up` from `ai-service/` — `/health` returns 200
      within 15 s
- [ ] Production deploy SHA matches the latest "merged-to-main" commit
- [ ] CI green on `main` (or only flaky tests remain — document them)
- [ ] Slide deck reviewed and signed off by all members
- [ ] Demo recording uploaded to Drive + Çağla shares link with supervisor
- [ ] Poster (BL-65) printed at A1 if "Genç Beyinler" event applies

## T-1 day

- [ ] Restart the production ECS service so containers are warm
- [ ] Pre-create the demo exam + students in production Supabase
- [ ] Charge laptops, pack adapters, projector cable, USB hub
- [ ] Pin the recording link in the project Telegram for everyone to access
- [ ] Sleep before midnight 🙂

## Demo day (T-0)

- [ ] Arrive 30 min early, test the projector + audio with the recording
- [ ] Open the production portal and the slide deck on separate windows
- [ ] Pre-load `/exam-rooms`, `/students`, `/exams`, `/exams/[id]/live`
- [ ] Have the AI service Docker container ready to start (one terminal)
- [ ] Phone on silent, screen recorders OFF on personal apps
- [ ] If the live demo fails: stay calm, switch to recording, finish
      slides, make a clear "this is what happened" note in Q&A

## After the jury

- [ ] D7 Final Report uploaded to LMS
- [ ] D8 TODO/Backlog v4 uploaded
- [ ] D9 recording uploaded
- [ ] D10 return-of-materials checklist signed
- [ ] Tag the final commit `v1.0.0-final`
- [ ] Project retrospective — 1 hour, recorded, notes added to the repo
- [ ] Disable PR/Issue creation if the repo is going read-only
- [ ] Celebrate 🎉

---

## Rollback plan if production is broken at T-0

1. Identify the failing run on GitHub Actions.
2. If the regression is in the latest commit, revert with `git revert
   <sha>` and push to main — that retriggers Deploy with the previous
   working state (5-10 min downtime).
3. If Supabase is the issue, use the project URL `https://app.supabase.com`
   to roll back the latest migration manually.
4. If ECS is wedged, force a new deployment via:
   `aws ecs update-service --cluster horuseye-production-cluster
   --service horuseye-production-service --force-new-deployment`
5. Document what happened in `docs/incident-log.md` for the supervisor.

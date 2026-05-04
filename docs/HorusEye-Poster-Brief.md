# HorusEye — Poster Brief (BL-65, "Genç Beyinler" event)

**Format:** A1 (594 × 841 mm) portrait, printed
**Deadline:** 2026-05-20 (event date TBD by Çağla)
**Owner:** Çağla Abazaoğlu (designs in Canva or Figma)

---

## Visual layout (top → bottom)

1. **Title block** (full width, 12 cm tall)
   - "HorusEye — AI-Based Exam Proctoring System"
   - TED University · CMPE 492 Senior Project · 2026
   - HorusEye logo (use `docs/cover-icon.png` + wordmark)

2. **Problem & motivation** (left column, 3-4 sentences)
   Modern in-person exams have an attention-bottleneck for proctors.
   We built an AI assistant — not a replacement — that surfaces
   suspicious behaviour as a *score* for human review.

3. **Architecture diagram** (centre, ≈ 25 cm wide)
   Use the same diagram as the slide deck. Three-column layout:
   - Camera → AI service (FastAPI + YOLOv8n)
   - AI service ↔ Portal (WebSocket protocol v1.0)
   - Portal ↔ Supabase (Postgres + Storage)

4. **Key features** (left column, bullets with icons)
   - Real-time exam monitoring (`/exams/[id]/live`)
   - Multi-step exam creation wizard
   - CSV student bulk import
   - Incident review with evidence upload
   - Sprint & backlog management
   - 18 PRDs, 30+ tables, 60+ API routes

5. **Demo screenshots** (right column, 3 stacked)
   - Sprint board (`/sprints`)
   - Live monitor with bbox overlay
   - Exam create wizard

6. **Tech stack** (centre-right strip)
   Next.js · TypeScript · Tailwind · shadcn/ui · Supabase · Postgres ·
   Python 3.12 · FastAPI · YOLOv8n · OpenCV · AWS CDK · ECS Fargate ·
   GitHub Actions

7. **Privacy + ethics callout** (bottom-left, highlighted box)
   "Sistem otomatik karar VERMEZ. Tüm tespitler insan incelemesi içindir."
   Cite KVKK + IEEE ethics framework.

8. **Team strip** (bottom-right)
   Five names + dev_role + small avatar circles. Acknowledge the supervisor.

9. **QR code** (bottom centre, 3 × 3 cm)
   Links to `https://horuseye.app` (or the demo recording).

---

## Colour palette

- Primary: `#1c5cff` (HorusEye blue) — same as portal logo
- Accent: `#ef4444` (incident red) — used sparingly for the ethics callout
- Background: ivory / off-white
- Text: near-black `#0f172a`

## Typography

- Headlines: Inter Bold or DM Sans Bold
- Body: Inter Regular, 16-18 pt minimum so text reads from 1 m away
- Code snippets: JetBrains Mono, used only in captions

## Final check before printing

- [ ] All five members and the supervisor reviewed
- [ ] No personal data on screenshots (use anonymised demo data)
- [ ] QR code resolves in incognito mode
- [ ] Print at the campus copy shop with at least 200 g matte paper

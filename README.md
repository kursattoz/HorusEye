<div align="center">
  <img src="SVG/readme-icon.svg" width="100" height="100" alt="HorusEye Icon" />
  <br/>
  <img src="SVG/readme-wordmark.svg" width="300" height="55" alt="HorusEye" />
  <br/>
  <p><strong>AI-Powered Exam Proctoring & Monitoring System</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" alt="Supabase" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss" alt="Tailwind CSS" />
  </p>
</div>

---

## Overview

HorusEye is an AI-driven exam proctoring platform developed as a Senior Project at **TED University (TEDU)** — Department of Computer Engineering (CENG 491). The system uses real-time camera analysis to detect suspicious behaviors during online exams and provides a comprehensive dashboard for proctors and administrators to review results, manage files, and collect feedback.

---

## Features

### 🔐 Authentication & Access Control
- Email/password login with role-based access (`admin`, `supervisor`, `assistant`)
- **Force password change** on first login — users cannot access any protected page until they set a new password
- Password strength validation with real-time indicators
- Secure logout available even during forced password change flow

### 📊 Dashboard
- Real-time stat cards: Files, Comments, Users, Total Exams
- **Suspicious Activity Over Time** — interactive area chart showing AI-detected anomalies (head turning, gaze deviation, face lost) per 5-minute exam interval
- **Behavior Risk Profile** — radar chart comparing high-risk vs low-risk student cohorts by behavior category

### 📁 File Management
- Upload, manage, and publish project/exam documents (admin only)
- Public document hub accessible from the login page — anyone can browse and preview files
- PDF viewer with page navigation, download, and external link support

### 💬 Feedback System
- **Internal feedback**: Authenticated users can leave comments on specific files
- **Public feedback**: Anyone (e.g. supervisors, instructors) can submit feedback from the login page without an account
  - Name required, 10–1000 character limit
  - HTML/code/SQL injection blocked
  - IP-based rate limiting (5 submissions/hour)
  - Visible only to authenticated users under a separate "Public" tab

### 👥 Team Management
- View, activate/deactivate, and manage user accounts (admin only)
- Role assignment and user profile management

### 🎨 Appearance & Theming
- **Light / Dark / System** theme with smooth View Transition API crossfade
- **Accent color themes**: Red (default), Pink, Orange, Blue — per-user, persisted in database
- Ghost-glide sliding pill toggle animation for theme switching
- HorusEye SVG favicon and logo throughout the UI, theme/dark-mode aware

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database & Auth | [Supabase](https://supabase.com/) (PostgreSQL + RLS) |
| Charts | Recharts via shadcn/ui chart primitives |
| Theme | next-themes + CSS custom properties (OKLCH) |
| Icons | Lucide React |

---

## Project Structure

```
HorusEye/
├── portal/                     # Next.js web application
│   ├── app/
│   │   ├── (auth)/             # Login, change-password pages
│   │   ├── (protected)/        # Authenticated pages
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   ├── feedback/       # File feedback viewer
│   │   │   ├── files/          # File management (admin)
│   │   │   ├── team/           # Team management (admin)
│   │   │   ├── settings/       # User settings & appearance
│   │   │   └── notifications/
│   │   ├── api/                # API routes
│   │   └── actions/            # Server actions (auth, etc.)
│   ├── components/
│   │   ├── layout/             # AppShell, Sidebar, Topbar
│   │   ├── dashboard/          # Charts, feedback, files, team
│   │   ├── auth/               # Login, change-password forms
│   │   └── settings/           # Appearance, profile tabs
│   └── constants/routes.ts     # Centralized route constants
├── ai-service/                 # AI proctoring backend (Python)
├── PRD/                        # Product Requirements Documents
└── SVG/                        # Brand assets
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com/) project

### Installation

```bash
git clone https://github.com/kursatozturk/HorusEye.git
cd HorusEye/portal
npm install
```

### Environment Variables

Create `portal/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Run

```bash
cd portal
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Routes

| Route | Access | Description |
|---|---|---|
| `/` | Public | Home / redirect |
| `/login` | Public | Login page with public document hub |
| `/change-password` | Auth (forced) | First-login password change |
| `/dashboard` | Admin | Stats + analytics charts |
| `/feedback` | All roles | File feedback viewer |
| `/files` | Admin | File management |
| `/team` | Admin | Team management |
| `/settings` | All roles | Profile & appearance settings |

---

## Academic Context

**Course:** CENG 491 — Senior Project I
**Institution:** TED University, Department of Computer Engineering
**Team:** HorusEye Development Team

---

<div align="center">
  <sub>Built with ❤️ at TED University</sub>
</div>

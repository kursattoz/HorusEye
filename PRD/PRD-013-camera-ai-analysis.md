# PRD-013 — Camera Module & AI Analysis Pipeline
**Version:** 0.1 (DRAFT — feature-flagged, not yet in active development)
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-001, PRD-006, PRD-007
**Blocks:** —
**Status:** DRAFT — `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false`

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
LogEvent: @1.0
HealthStatus: @1.0
-->

## ⚠️ LLM INSTRUCTION
This module is **disabled** via feature flag. Do not implement any camera-related code unless `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=true` in the environment.
All UI references to camera module must show "Not yet active" placeholders (PRD-007 monitor card, settings).
When this PRD moves to ACTIVE status, PRD-000 must be updated first with new interface contracts.
Multi-camera data fusion strategy is defined in Section 4 — this is the architectural decision record, not yet implemented.
Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.

---

## 1. Purpose

Define the architecture for connecting physical exam room cameras, ingesting their video feeds, running AI-based behavioral detection, and presenting results on the proctor dashboard. This PRD captures the design intent and serves as the foundation when implementation begins.

---

## 2. Feature Flag

```env
NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false
```

When `false`:
- Camera health card in `/dev/monitor` shows "Not yet active" (PRD-007)
- No camera-related routes are active
- `FileType.video` in PRD-000 is reserved for future camera recording storage

When `true` (future):
- All sections of this PRD become active
- PRD-000 must be updated with new interface contracts (CameraFeed, DetectionEvent, etc.)

---

## 3. Planned System Architecture

### Overview

```
Physical Camera (IP/USB)
    ↓ RTSP / WebRTC stream
Video Ingestion Service (Python)
    ↓ frames @ configured FPS
AI Processing Service (Python)
    ├── YOLOv8 object detection      → phone, paper, earbuds
    ├── MediaPipe / OpenCV gaze      → eye movement tracking
    └── TensorFlow LSTM              → behavioral sequence anomalies
    ↓ detection events
Backend API (Next.js WebSocket)
    ↓ real-time push
Proctor Dashboard (React)
    ├── Live camera grid
    ├── Alert panel (by severity)
    └── Incident timeline per student
    ↓ persist
Supabase PostgreSQL
    ├── incidents table
    ├── alert_queue table
    └── evidence references (video clips in Storage)
```

---

## 4. Multi-Camera Strategy — Different Angles

### 4.1 Camera Placement Roles

Each exam room uses multiple cameras with defined roles:

| Camera Role | Position | Primary Detection Target |
|-------------|----------|-------------------------|
| `FRONT_WIDE` | Front of room, wide angle | Full room overview, seat occupancy |
| `FRONT_CLOSE` | Front, tighter angle | Face/gaze of front rows |
| `REAR_WIDE` | Back of room | Rear rows, exit monitoring |
| `SIDE_LEFT` | Left wall | Left half of room, unauthorized materials |
| `SIDE_RIGHT` | Right wall | Right half of room, device usage |

Minimum viable setup: 1 `FRONT_WIDE` camera.
Full setup: 2-5 cameras per room depending on size.

### 4.2 Multi-View Data Fusion Strategy

When the same student is visible in multiple cameras simultaneously, detections are fused:

**Spatial Correlation:**
```
Student "S1" detected in:
  - FRONT_WIDE at position (x: 0.3, y: 0.5) with confidence 0.82
  - SIDE_LEFT at position (x: 0.7, y: 0.4) with confidence 0.91

→ Fusion: same student, fused confidence = max(0.82, 0.91) = 0.91
→ Single incident created (not two duplicates)
```

**Temporal Correlation (cross-camera event linking):**
```
FRONT_WIDE: gaze diversion detected at 14:03:22
SIDE_RIGHT: head turned left detected at 14:03:23 (1 second later)

→ Fusion: correlated event (same student, same timeframe, consistent)
→ Risk level elevated (confirmed from two angles)
```

**Contradiction Handling:**
```
FRONT_WIDE: student appears present at seat
REAR_WIDE: seat appears empty at same timestamp

→ Alert: camera coverage gap or student transition
→ Incident type: 'position_uncertainty', severity: 'warn'
→ Both frames stored as evidence
```

### 4.3 Fusion Algorithm (planned, not yet implemented)

```python
# ai-service/fusion/multi_view_fusion.py (PLANNED)

class MultiViewFusion:
    """
    Correlates detection events across cameras for the same exam room session.

    Strategy:
    1. Spatial: map each camera's coordinate space to room layout grid
    2. Temporal: events within FUSION_WINDOW_MS (500ms) are candidates for correlation
    3. Student identity: matched by seat assignment + face recognition (if enabled)
    4. Confidence aggregation: weighted average by camera quality score
    """

    FUSION_WINDOW_MS = 500       # Events within 500ms are considered simultaneous
    MIN_CONFIDENCE   = 0.65      # Discard detections below this threshold

    def fuse(self, events: list[DetectionEvent]) -> list[FusedIncident]:
        """
        Input:  list of raw detection events from all cameras (current time window)
        Output: list of fused incidents (deduplicated, confidence-combined)
        """
        ...
```

### 4.4 Camera Quality Scoring

Each camera gets a runtime quality score affecting fusion weights:

| Factor | Weight |
|--------|--------|
| Resolution | 20% |
| FPS stability | 30% |
| Lighting score (brightness/contrast) | 30% |
| Detection confidence avg (last 5 min) | 20% |

Low-quality cameras still contribute to detection but with reduced weight. If quality score drops below 0.4, admin is alerted (PRD-007 monitor card).

---

## 5. Planned Data Models

These tables will be added to Supabase when the module is activated. Not yet created.

```sql
-- exam_sessions (planned)
CREATE TABLE public.exam_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  room_id     UUID REFERENCES public.exam_rooms(id),
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  status      TEXT CHECK (status IN ('scheduled','active','ended')),
  created_by  UUID REFERENCES public.user_profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- cameras (planned)
CREATE TABLE public.cameras (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID REFERENCES public.exam_rooms(id),
  label        TEXT NOT NULL,         -- 'FRONT_WIDE', 'SIDE_LEFT', etc.
  stream_url   TEXT NOT NULL,         -- RTSP URL or camera ID
  position_x   FLOAT,                 -- Normalized room coordinate
  position_y   FLOAT,
  quality_score FLOAT DEFAULT 1.0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- incidents (planned)
CREATE TABLE public.incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES public.exam_sessions(id),
  student_id      TEXT,               -- Seat number or student ID
  incident_type   TEXT NOT NULL,      -- 'phone_detected', 'gaze_diversion', etc.
  severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  confidence      FLOAT NOT NULL,     -- AI confidence score 0.0-1.0
  camera_ids      UUID[],             -- Which cameras contributed (multi-view)
  evidence_paths  TEXT[],             -- Supabase Storage paths to video clips
  is_reviewed     BOOLEAN DEFAULT false,
  reviewed_by     UUID REFERENCES public.user_profiles(id),
  occurred_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. AI Detection Categories

| Detection Type | Technology | Description |
|----------------|-----------|-------------|
| `phone_detected` | YOLOv8 | Mobile phone visible in frame |
| `earbuds_detected` | YOLOv8 | Earbuds/headphones detected |
| `paper_detected` | YOLOv8 | Unauthorized paper/notes visible |
| `gaze_diversion` | MediaPipe Face Mesh | Eyes directed away from exam paper |
| `head_turn` | MediaPipe Pose | Head rotated beyond threshold angle |
| `whispering` | Behavioral LSTM | Lip movement pattern indicating speech |
| `empty_seat` | YOLOv8 | Student not at seat |
| `unauthorized_communication` | Multi-modal | Head turn + lip movement combined |
| `position_uncertainty` | Multi-view fusion | Conflicting position data from cameras |

---

## 7. Severity Levels

| Severity | Examples | Notification |
|----------|---------|-------------|
| `low` | Single brief gaze diversion | Logged, no immediate alert |
| `medium` | Repeated gaze diversion, head turn | Yellow alert on dashboard |
| `high` | Phone detected, unauthorized material | Red alert + sound notification |
| `critical` | Phone + communication combined | Red alert + sound + proctor paged |

Severity escalation: multiple `low` events in 5 minutes → auto-escalated to `medium`.

---

## 8. Dashboard Integration (when active)

When `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=true`:

**New routes:**
- `/dashboard/sessions` → Active and past exam sessions
- `/dashboard/sessions/[id]` → Live monitoring view (camera grid + alert panel)
- `/dashboard/sessions/[id]/incidents` → Incident review
- `/dashboard/sessions/[id]/report` → Post-exam report

**Monitor page (PRD-007) additions:**
- Camera module health card becomes active (shows connected cameras count, FPS, AI engine status)
- New "Active Sessions" stat card

---

## 9. Implementation Phases (planned)

| Phase | Scope | Prerequisite |
|-------|-------|-------------|
| Phase A | Single camera, single room, basic detection (phone, gaze) | PRD-001 through PRD-012 complete |
| Phase B | Multi-camera per room, basic fusion | Phase A working |
| Phase C | Full multi-view fusion, behavioral LSTM, post-exam reports | Phase B + model training complete |
| Phase D | Multi-room parallel monitoring | Phase C + infrastructure scaling |

**This PRD moves to ACTIVE status at Phase A start.**
Set `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=true` only when Phase A backend is deployed.

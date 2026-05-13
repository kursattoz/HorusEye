# Camera Pair Drop — Postmortem & Runbook

**Incident window:** April–May 2026
**Severity:** High (mobile pair sessions unusable in field)
**Status:** Resolved in Sprint 13 (BL-246..253), pending field verification (BL-256)
**Sprint reference:** PRD-021 §3 Sprint 13
**Owner:** AI / Platform

---

## TL;DR

Mobile WebSocket publish streams from `cam-pair` dropped silently with
close code 1006 after ~10 frames (≈2 seconds at 5 FPS). AWS infra was
clean. Root cause was a multi-layer application bug: YOLO lazy-load
blocked the server receive loop on first frame; non-disconnect
exceptions killed the WS without logs; the frontend had no
backpressure, no visibility pause, and no auto-reconnect.

Sprint 13 closed every layer of the bug and added the structured logs
+ metric filters to detect regressions.

---

## Symptom

In production CloudWatch:

```
publish [accepted]   → ... → connection closed
   ↓ (1-3 sn sonra)
detections [accepted] → ... → connection closed
```

Mobile client console (when devtools attached):

```
WebSocket connection closed: code=1006 reason=
```

Field reproduction: pair token redeem → 8–12 JPEG frames sent → silent
drop. Manual Reconnect button restored briefly before another drop.

---

## What we ruled out

| Layer | Signal | Verdict |
|---|---|---|
| ECS task | RUNNING, 7+ days, no restarts | ✅ healthy |
| ALB target | healthy, 0 × 5xx, 0 TargetConnectionError | ✅ clean |
| ALB idle | `idleTimeout: 900s` (15 min) | ✅ generous |
| CPU | 0 datapoints over 50% | ✅ idle |
| Memory | peak 19.27% | ✅ ample |

AWS was not the problem.

---

## Root causes (layered)

### Layer 2 — AI service (`ai-service/src/api/publish_handler.py`)

1. **YOLO lazy-load** (`publish_handler.py:149-176`, pre-Sprint-13).
   `_get_yolo()` ran `ultralytics.YOLO(...).load()` on first call from
   the publish receive loop. First inference took **5–15 seconds**,
   during which the loop didn't read the WS. Mobile send buffer
   overflowed → 1006.
2. **Sync detection in main receive loop** (`publish_handler.py:388-499`).
   `_detect_track_score_sync`, `write_incident`, and
   `broadcaster.broadcast` ran inline. Storage + Postgres latency on
   `write_incident` directly back-pressured the WS.
3. **Silent exception path**. Only `WebSocketDisconnect` was caught;
   anything else propagated and uvicorn closed the WS without a
   stack trace at the default INFO log level.

### Layer 3 — Frontend (`portal/components/exams/CamPairCapture.tsx`)

4. **No `ws.bufferedAmount` check.** `ws.send(buf)` ran every 200ms
   regardless of buffer state. Mobile WS quota (~256KB on iOS Safari /
   Chrome) saturated within 10 × 80KB JPEGs.
5. **No visibility pause.** Screen-off → MediaStream freeze (iOS) /
   setInterval throttle to 1Hz (Chrome). WS stayed alive but
   `frames_received` was 0 → server idle-timeout (15s).
6. **No auto-reconnect.** `ws.onclose` only set state; user had to tap
   Reconnect manually.

---

## Fixes shipped (Sprint 13 BL-246..253)

| BL | Layer | Change |
|---|---|---|
| BL-246 | Server | YOLO eager init on FastAPI `startup` event |
| BL-247 | Server | Per-frame `try/except Exception`; loop survives |
| BL-248 | Server | `write_incident` decoupled to `asyncio.Queue` + worker |
| BL-249 | Server | WS close code/reason structured logging both endpoints |
| BL-250 | Infra | CloudWatch metric filters for all reliability tokens |
| BL-251 | Frontend | `bufferedAmount > 250KB` → skip frame |
| BL-252 | Frontend | Visibility pause + iOS Safari freeze/resume fallback |
| BL-253 | Frontend | Auto-reconnect with 1s/2s/4s exponential backoff |
| BL-254 | Frontend | Dev-only debug overlay (sent / skipped / buf / retry / lastClose) |

Pre-Sprint-13 drop time-to-failure: **~2 seconds (10 frames).**
Target after Sprint 13: **< 0.5 drops / hour sustained.**

---

## Monitoring (post-Sprint-13)

CloudWatch namespace: `HorusEye/AI/<env>`.

| Metric | What it means | Alert threshold (suggested) |
|---|---|---|
| `publish_idle_timeout` | 15s of no frames → server-side disconnect | > 5 per minute |
| `publish_exception` | BL-247 per-frame safety net caught something | > 1 per minute |
| `detections_exception` | `/ws/.../detections` task error | > 1 per minute |
| `incident_queue_drop` | BL-248 queue full → write dropped | > 0 per minute (alarm immediately) |
| `yolo_init_duration_ms` | Cold-start latency | > 5000 (5s) |
| `ws_close_abnormal` | 1006 closes (pre-Sprint-13 signature) | > 10 per minute |

Suggested dashboard panels:

1. **`ws_close_abnormal` per minute** — the primary regression
   indicator. Sprint 13 baseline target: near zero outside genuine
   network blips.
2. **`publish_exception` + `detections_exception` per minute** —
   correlated spikes mean either rule logic or downstream IO is failing
   under load.
3. **`incident_queue_drop` per minute** — non-zero means BL-248 queue
   is saturated; Postgres / Storage is too slow for incident volume.
4. **`yolo_init_duration_ms` (single-value)** — sanity check on
   container startup.

---

## How to investigate a fresh drop (runbook)

1. **Pull recent close events:**

   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/ecs/horuseye-ai-staging \
     --start-time $(date -v -30M +%s)000 \
     --filter-pattern '"ws_close_code"'
   ```

2. **If `ws_close_code=1006` is back** (mobile silent drop):
   - Check `publish_exception` / `detections_exception` filters
     (BL-250). A spike there → application bug regressed.
   - Check `incident_queue_drop` → write_incident pipeline saturated;
     investigate Postgres / Storage latency.
   - Check `yolo_init_duration_ms` for a recent restart. If first
     inference is > 5s again, BL-246 startup hook regressed.

3. **If close code is 1000 (normal)** — the client closed cleanly.
   This is expected on Pause / nav-away.

4. **If close code is 4xxx** — app-level auth failure. Check
   `error_message("auth_failed", ...)` log lines.

5. **Frontend correlation:** ask the device user to open the
   `/cam-pair?token=...` page in a staging build to see the BL-254
   debug overlay (sent / skipped / buf / retry / lastClose). A high
   `buf` value with rising `skipped` means BL-251 backpressure is
   actively saving the connection.

---

## Verification (BL-256, pending human)

The fixes are merged but BL-256 (E2E reliability test) requires real
hardware:

1. Android Chrome + iOS Safari devices.
2. 30 minutes of sustained streaming.
3. Screen-off / screen-on cycles every 5 minutes.
4. Network handoff: WiFi → 4G → 5G → WiFi (one swap per 10 min).

Acceptance:

- Zero drops attributable to client/server bug (genuine network
  packet-loss drops are acceptable as long as BL-253 auto-reconnect
  recovers within 1–4 s).
- Server CloudWatch shows zero `publish_exception` and
  `incident_queue_drop` over the run.

Mark BL-256 done once a clean run is captured.

---

## Related references

- PRD-021 §3 Sprint 13 — backlog definition
- PRD-013 §3.2 — AI pipeline architecture
- PRD-019 §4.4 — camera pair publish wire format
- `ai-service/src/api/publish_handler.py` — server publish loop
- `ai-service/src/main.py` — startup hooks (YOLO + incident worker)
- `portal/components/exams/CamPairCapture.tsx` — frontend capture loop
- `infra/lib/ai-service-stack.ts` — CloudWatch log group + metric filters

---

## Changelog

| Date | Author | Change |
|---|---|---|
| 2026-05-13 | Sprint 13 autonomous loop | Initial postmortem + runbook (BL-257) |

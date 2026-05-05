"""WebSocket publish route — PRD-019 §4.4.

Telefondan gelen ham JPEG frame'leri kabul eder, decode eder ve mevcut
detection pipeline'ının ortak frame queue'suna kaydeder. Aynı oturum için
birden fazla kamera (sabit IP + telefon + USB) paralel olarak frame
gönderebilir; her bir (session_id, camera_id) çifti ayrı slot'a yazar.

Wire format (PRD-019 §4.4):

1. WS bağlandığında ilk mesaj JSON ``{type: "publish", api_key, session_id,
   camera_id}`` (handshake).
2. Sonrasında ardışık **binary** mesajlar — her message ham JPEG buffer'ı,
   header yok. 5 FPS'te (200ms) gelir.
3. Aralarda gelen text mesajlar (``ping`` vb.) control kanalı olarak
   yorumlanır; bağlantı sıcak tutulur.
"""

from __future__ import annotations

import asyncio
import base64
import dataclasses
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.api.broadcaster import broadcaster
from src.api.protocol import (
    PROTOCOL_VERSION,
    error_message,
    incident_message,
    is_valid_publish,
    status_message,
)
from src.detection.face_mesh import get_face_mesh_extractor
from src.detection.yolo_detector import YoloDetector, DetectorConfig
from src.identity.student_matcher import match_track
from src.persistence.incident_writer import write_incident
from src.persistence.session_meta import get_expected_person_count
from src.scoring.config import (
    GAZE_DIVERSION_CONFIG,
    HEAD_TURN_CONFIG,
    PHONE_IN_HAND_CONFIG,
)
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.empty_seat import evaluate as empty_seat_eval
from src.scoring.rules.gaze_diversion import evaluate as gaze_diversion_eval
from src.scoring.rules.gaze_diversion import update_signal as gaze_update_signal
from src.scoring.rules.head_turn import evaluate as head_turn_eval
from src.scoring.rules.paper_detected import evaluate as paper_detected_eval
from src.scoring.rules.phone_in_hand import evaluate as phone_in_hand_eval
from src.scoring.rules.phone_in_hand import update_overlap as phone_in_hand_update
from src.scoring.rules.unauthorized_person import evaluate as unauthorized_person_eval
from src.scoring.session_state import drop_session_state, get_session_state
from src.scoring.session_tracker import drop_tracker, get_tracker
from src.scoring.track_state import track_store

log = logging.getLogger(__name__)

router = APIRouter()

# Idle heartbeat: kapatma sınırı. Telefon 5s'te bir ping atar, 15s sessizlik
# = disconnected.
_IDLE_TIMEOUT_SECONDS = 15.0

# BL-202 — Face-mesh sampling cap. PRD-013 §3.3:
# - process at most ``MAX_FACES_PER_FRAME`` person tracks per frame
# - skip every other frame to keep CPU under budget
_FACE_MESH_FRAME_SKIP = max(1, int(os.getenv("FACE_MESH_FRAME_SKIP", "2")))
_MAX_FACES_PER_FRAME = max(1, int(os.getenv("FACE_MESH_MAX_FACES", "3")))


def _with_student(
    candidate: IncidentCandidate, student_id: str | None,
) -> IncidentCandidate:
    """Attach the matched student id to a freshly emitted candidate."""
    if student_id is None or candidate.student_id is not None:
        return candidate
    return dataclasses.replace(candidate, student_id=student_id)

# Geçici cv2 import — opencv-python-headless yoksa decode atlanır
try:
    import cv2  # type: ignore[import-untyped]
    import numpy as np  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - opencv missing in some test envs
    cv2 = None  # type: ignore[misc, assignment]
    np = None  # type: ignore[misc, assignment]


# ───────────────────── frame queue (in-memory) ─────────────────────


@dataclass
class PublishedFrame:
    session_id: str
    camera_id: str
    raw_jpeg: bytes
    bgr: Any | None              # numpy ndarray or None when cv2 unavailable
    received_at: datetime
    width: int | None = None
    height: int | None = None


@dataclass
class _FrameStore:
    """Per-session in-memory cache of the most recent frame per camera.

    Senkronizasyon için Lock kullanır; detection pipeline başka bir thread'den
    okuduğunda race olmasın diye.
    """

    _frames: dict[tuple[str, str], PublishedFrame] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def put(self, frame: PublishedFrame) -> None:
        with self._lock:
            self._frames[(frame.session_id, frame.camera_id)] = frame

    def get(self, session_id: str, camera_id: str) -> Optional[PublishedFrame]:
        with self._lock:
            return self._frames.get((session_id, camera_id))

    def list_session(self, session_id: str) -> list[PublishedFrame]:
        with self._lock:
            return [f for (sid, _), f in self._frames.items() if sid == session_id]

    def drop(self, session_id: str, camera_id: str) -> None:
        with self._lock:
            self._frames.pop((session_id, camera_id), None)


frame_store = _FrameStore()


# ───────────────────── shared YOLO singleton ────────────────────
# Lazy-loaded once per process; inference runs in a threadpool so the
# event loop stays responsive for WS reads and broadcasts.
_yolo: YoloDetector | None = None
_yolo_lock = Lock()


def _get_yolo() -> YoloDetector | None:
    """Return the process-wide YoloDetector. None if YOLO is disabled or
    fails to load (we still want to broadcast bare frames)."""
    global _yolo
    if os.getenv("DISABLE_YOLO") == "1":
        return None
    if _yolo is not None:
        return _yolo
    with _yolo_lock:
        if _yolo is not None:
            return _yolo
        try:
            # Default 0.30 (vs ultralytics 0.45) — partial faces / low-light
            # exam rooms drop below 0.45. False positives here are harmless;
            # they still must clear the scoring tier in Phase B.
            conf = float(os.getenv("YOLO_CONF_THRESHOLD", "0.30"))
            iou = float(os.getenv("YOLO_IOU_THRESHOLD", "0.50"))
            det = YoloDetector(DetectorConfig(
                confidence_threshold=conf,
                iou_threshold=iou,
            ))
            det.load()
            _yolo = det
            log.info("YOLO loaded for broadcast inference (conf=%.2f iou=%.2f)", conf, iou)
        except Exception as e:  # noqa: BLE001
            log.warning("YOLO load failed (%s) — frames will broadcast without detections", e)
            _yolo = None
    return _yolo


# ───────────────────── helpers ─────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expected_api_key() -> str:
    return os.getenv("AI_SERVICE_API_KEY", "")


def _decode_jpeg(buf: bytes) -> tuple[Any | None, int | None, int | None]:
    """JPEG buffer'ı BGR ndarray'e çevir. cv2 yoksa None döndür."""
    if cv2 is None or np is None:
        return None, None, None
    arr = np.frombuffer(buf, dtype=np.uint8)
    if arr.size == 0:
        return None, None, None
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        return None, None, None
    h, w = bgr.shape[:2]
    return bgr, int(w), int(h)


def _detect_track_score_sync(
    bgr: Any,
    session_id: str,
    camera_id: str,
    ts: float,
    frame_seq: int,
) -> tuple[list[dict[str, Any]], list[IncidentCandidate]]:
    """Run YOLO → BoT-SORT → rule engine over a BGR frame.

    Returns ``(server_detections, incident_candidates)``. The detection
    list is broadcast over the ServerFrame channel for live preview;
    candidates are persisted off-loop and then broadcast as ServerIncident
    envelopes. Synchronous — call via ``asyncio.to_thread``.

    ``frame_seq`` is the per-camera frame counter (publish_handler increments
    on every JPEG it pumps in). It drives the face-mesh sampling cap so we
    don't run MediaPipe on every frame for every face.
    """
    det = _get_yolo()
    if det is None or bgr is None:
        return [], []
    try:
        results = det.detect(bgr)
    except Exception as e:  # noqa: BLE001
        log.debug("YOLO inference failed: %s", e)
        return [], []

    tracker = get_tracker(session_id, camera_id)
    person_tracks, other_dets = tracker.step(results, bgr)

    candidates: list[IncidentCandidate] = []
    for t in person_tracks:
        state = track_store.get_or_create(session_id, camera_id, t.track_id)
        overlap = phone_in_hand_update(
            state,
            ts=ts,
            person_bbox=t.detection.bbox,
            other_detections=other_dets,
            overlap_threshold=PHONE_IN_HAND_CONFIG.overlap_threshold,
        )
        # BL-220 — try to match the track against an enrolled student. The
        # matcher caches on the state; subsequent calls are no-ops until
        # cooldown expires.
        match_track(state, frame_bgr=bgr, person_bbox=t.detection.bbox, ts=ts)

        cand = phone_in_hand_eval(
            state,
            ts=ts,
            person_bbox=t.detection.bbox,
            overlapping_phone=overlap.get("cell phone"),
            cfg=PHONE_IN_HAND_CONFIG,
        )
        if cand is not None:
            candidates.append(_with_student(cand, state.matched_student_id))
        # BL-206 — paper_detected reuses the same overlap dict
        paper_cand = paper_detected_eval(
            state,
            ts=ts,
            person_bbox=t.detection.bbox,
            overlap_by_class=overlap,
        )
        if paper_cand is not None:
            candidates.append(_with_student(paper_cand, state.matched_student_id))

    # BL-204 — empty_seat watchdog. Scans every track state for the
    # (session, camera) — including ones the tracker has just dropped —
    # so we catch students who left their seat after the last frame.
    for state in track_store.states_for_camera(session_id, camera_id):
        cand = empty_seat_eval(state, ts=ts)
        if cand is not None:
            candidates.append(_with_student(cand, state.matched_student_id))

    # BL-205 — unauthorized_person Phase A: live count vs expected.
    expected_count = get_expected_person_count(session_id)
    if expected_count is not None:
        session_state = get_session_state(session_id, camera_id)
        cand = unauthorized_person_eval(
            session_state,
            ts=ts,
            expected_count=expected_count,
            observed_count=len(person_tracks),
        )
        if cand is not None:
            candidates.append(cand)

    # BL-202 — face-mesh + gaze + head_turn rules.
    # Sample every Nth frame, max ``_MAX_FACES_PER_FRAME`` people per frame.
    if frame_seq % _FACE_MESH_FRAME_SKIP == 0 and person_tracks:
        extractor = get_face_mesh_extractor()
        for t in person_tracks[:_MAX_FACES_PER_FRAME]:
            state = track_store.get_or_create(session_id, camera_id, t.track_id)
            signal = extractor.extract_for_track(bgr, t.detection.bbox)
            if signal is None:
                continue
            gaze_update_signal(state, ts, signal)
            gaze_cand = gaze_diversion_eval(
                state, ts=ts, person_bbox=t.detection.bbox,
                signal=signal, cfg=GAZE_DIVERSION_CONFIG,
            )
            if gaze_cand is not None:
                candidates.append(_with_student(gaze_cand, state.matched_student_id))
            head_cand = head_turn_eval(
                state, ts=ts, person_bbox=t.detection.bbox,
                signal=signal, cfg=HEAD_TURN_CONFIG,
            )
            if head_cand is not None:
                candidates.append(_with_student(head_cand, state.matched_student_id))

    out: list[dict[str, Any]] = [
        {
            "track_id": t.track_id,
            "detection_class": t.detection.class_name,
            "confidence": float(t.detection.confidence),
            "bbox": list(t.detection.bbox),
        }
        for t in person_tracks
    ]
    out.extend(
        {
            "track_id": None,
            "detection_class": d.class_name,
            "confidence": float(d.confidence),
            "bbox": list(d.bbox),
        }
        for d in other_dets
    )
    return out, candidates


# ───────────────────── route ─────────────────────


@router.websocket("/ws/sessions/{session_id}/publish")
async def session_publish(websocket: WebSocket, session_id: str) -> None:
    """Phone-as-camera publish endpoint — PRD-019 §4.4."""
    await websocket.accept()

    # 1) Handshake — JSON publish (5 sn)
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
    except asyncio.TimeoutError:
        await websocket.send_json(error_message("auth_failed", "publish handshake timeout", session_id))
        await websocket.close()
        return

    try:
        first: Any = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.send_json(error_message("invalid_payload", "first message must be JSON", session_id))
        await websocket.close()
        return

    if not is_valid_publish(first):
        await websocket.send_json(error_message("invalid_payload", "first message must be 'publish'", session_id))
        await websocket.close()
        return

    expected = _expected_api_key()
    if expected and first.get("api_key") != expected:
        await websocket.send_json(error_message("auth_failed", "invalid api_key", session_id))
        await websocket.close()
        return

    if first.get("session_id") != session_id:
        await websocket.send_json(error_message("invalid_payload", "session_id mismatch with URL", session_id))
        await websocket.close()
        return

    camera_id = str(first.get("camera_id"))
    await websocket.send_json(
        status_message(session_id, "connected", f"publish stream open camera_id={camera_id}", _now_iso())
    )

    log.info("publish stream open: session=%s camera=%s", session_id, camera_id)

    frames_received = 0

    # 2) Pump loop: binary frame'ler + control text mesajları + idle timeout
    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=_IDLE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                log.warning("publish idle timeout: session=%s camera=%s frames=%d",
                            session_id, camera_id, frames_received)
                await websocket.send_json(error_message("internal", "idle timeout", session_id))
                await websocket.close()
                return

            mtype = msg.get("type")
            if mtype == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"] is not None:
                buf: bytes = msg["bytes"]
                bgr, w, h = _decode_jpeg(buf)
                frame_store.put(
                    PublishedFrame(
                        session_id=session_id,
                        camera_id=camera_id,
                        raw_jpeg=buf,
                        bgr=bgr,
                        received_at=datetime.now(timezone.utc),
                        width=w,
                        height=h,
                    )
                )
                frames_received += 1

                # Fan out to detection subscribers — only if anyone is watching.
                if broadcaster.subscriber_count(session_id) > 0:
                    if bgr is not None:
                        ts_epoch = datetime.now(timezone.utc).timestamp()
                        detections, candidates = await asyncio.to_thread(
                            _detect_track_score_sync,
                            bgr,
                            session_id,
                            camera_id,
                            ts_epoch,
                            frames_received,
                        )
                    else:
                        detections, candidates = [], []
                    frame_msg = {
                        "type": "frame",
                        "protocol_version": PROTOCOL_VERSION,
                        "session_id": session_id,
                        "camera_id": camera_id,
                        "width": w or 0,
                        "height": h or 0,
                        "jpeg_base64": base64.b64encode(buf).decode("ascii"),
                        "timestamp": _now_iso(),
                        "detections": detections,
                    }
                    broadcaster.broadcast(session_id, frame_msg)

                    # Persist + broadcast incidents (off the event loop —
                    # write_incident hits Storage + Postgres).
                    for cand in candidates:
                        row = await asyncio.to_thread(
                            write_incident,
                            cand,
                            session_id=session_id,
                            camera_id=camera_id,
                            frame_jpeg=buf,
                        )
                        if row is not None:
                            broadcaster.broadcast(
                                session_id, incident_message(row, session_id)
                            )
                            log.info(
                                "incident broadcast: session=%s camera=%s track=%s type=%s severity=%s",
                                session_id, camera_id, cand.track_id,
                                cand.incident_type, cand.severity,
                            )
                continue

            if "text" in msg and msg["text"] is not None:
                try:
                    payload = json.loads(msg["text"])
                except json.JSONDecodeError:
                    await websocket.send_json(error_message("invalid_payload", "non-JSON text", session_id))
                    continue
                ptype = payload.get("type") if isinstance(payload, dict) else None
                if ptype == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": _now_iso()})
                elif ptype == "unsubscribe":
                    await websocket.send_json(
                        status_message(session_id, "stream_ended", "publish closed by client", _now_iso())
                    )
                    await websocket.close()
                    return
                else:
                    await websocket.send_json(
                        error_message("invalid_payload", f"unknown control type: {ptype}", session_id)
                    )
    except WebSocketDisconnect:
        log.debug("publish WS disconnected: session=%s camera=%s frames=%d",
                  session_id, camera_id, frames_received)
    finally:
        frame_store.drop(session_id, camera_id)
        drop_tracker(session_id, camera_id)
        track_store.drop_camera(session_id, camera_id)
        drop_session_state(session_id, camera_id)
        log.info("publish stream closed: session=%s camera=%s total_frames=%d",
                 session_id, camera_id, frames_received)


# Re-export for tests
_PROTOCOL_VERSION = PROTOCOL_VERSION

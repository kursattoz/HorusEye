#!/usr/bin/env bash
# Sprint 15 (BL-278) — Controlled-capture session recorder.
# Wraps ffmpeg to dump both RTSP streams to mp4 simultaneously.
# Stops on Ctrl-C. See docs/sprint15-capture-runbook.md for context.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${AI_SERVICE_DIR}"

VOLUNTEER="${1:-}"
SCENARIO="${2:-}"

if [ -z "$VOLUNTEER" ] || [ -z "$SCENARIO" ]; then
  cat >&2 <<EOM
Usage: $0 <volunteer-code> <scenario>
  volunteer-code: short identifier matching the consent file, e.g. 'v01'
  scenario:       S2 | S3 | S4 (see docs/sprint15-capture-runbook.md)

Env vars (required):
  DESK_RTSP_URL     fixed IP cam stream (e.g. rtsp://10.0.0.42/stream1)
  PHONE_RTSP_URL    mobile cam stream  (e.g. rtsp://10.0.0.43/stream1)

Output: data/internal/controlled_tests/raw/<volunteer>/<scenario>/{desk,phone}.mp4
EOM
  exit 2
fi

: "${DESK_RTSP_URL:?DESK_RTSP_URL not set}"
: "${PHONE_RTSP_URL:?PHONE_RTSP_URL not set}"

OUT_DIR="data/internal/controlled_tests/raw/${VOLUNTEER}/${SCENARIO}"
mkdir -p "${OUT_DIR}"

echo "Recording ${VOLUNTEER}/${SCENARIO} → ${OUT_DIR}/"
echo "  (Ctrl-C to stop both feeds. Use takes per the scenario script.)"

# Record both feeds in parallel. -an = no audio (consent gate per
# PRD-017 §18.4 — audio rights are messier than video and we don't
# train on audio anyway).
ffmpeg -rtsp_transport tcp -i "${DESK_RTSP_URL}"  -c copy -an -y "${OUT_DIR}/desk.mp4"  &
DESK_PID=$!
ffmpeg -rtsp_transport tcp -i "${PHONE_RTSP_URL}" -c copy -an -y "${OUT_DIR}/phone.mp4" &
PHONE_PID=$!

trap "kill -INT ${DESK_PID} ${PHONE_PID} 2>/dev/null || true" INT TERM
wait "${DESK_PID}" "${PHONE_PID}"

cat > "${OUT_DIR}/manifest.json" <<EOM
{
  "volunteer":   "${VOLUNTEER}",
  "scenario":    "${SCENARIO}",
  "recorded_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "feeds": {
    "desk":  "desk.mp4",
    "phone": "phone.mp4"
  }
}
EOM

echo "✓ Recorded ${OUT_DIR}/{desk,phone}.mp4 + manifest.json"

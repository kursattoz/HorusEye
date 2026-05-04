"""AI performance report generator — BL-60 (PRD-013).

Pulls incident counts + decision distribution from Supabase for a given
exam session and emits a JSON-friendly summary that the portal renders
on the post-exam report screen (future BL-141).

Run as a CLI:

    python -m src.reports.performance --session-id <uuid> --output report.json

or programmatically via :func:`build_report`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from collections import Counter
from typing import Any


def fetch(url: str, headers: dict[str, str]) -> Any:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def build_report(session_id: str, supabase_url: str, service_key: str) -> dict:
    base = supabase_url.rstrip("/")
    headers = {
        "apikey":       service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    incidents = fetch(
        f"{base}/rest/v1/incidents?session_id=eq.{session_id}&select=id,incident_type,severity,confidence,is_reviewed,proctor_decision",
        headers,
    )

    sessions = fetch(
        f"{base}/rest/v1/exam_sessions?id=eq.{session_id}&select=id,status,started_at,ended_at,exam_id",
        headers,
    )

    if not sessions:
        raise SystemExit(f"Session {session_id} not found")
    session = sessions[0]

    sev_counts   = Counter(i["severity"]      for i in incidents)
    type_counts  = Counter(i["incident_type"] for i in incidents)
    dec_counts   = Counter(
        (i["proctor_decision"] or "undecided") for i in incidents
    )
    reviewed     = sum(1 for i in incidents if i["is_reviewed"])

    avg_conf = (
        sum(float(i["confidence"]) for i in incidents) / len(incidents)
        if incidents else 0.0
    )

    return {
        "session_id":     session_id,
        "exam_id":        session.get("exam_id"),
        "session_status": session.get("status"),
        "started_at":     session.get("started_at"),
        "ended_at":       session.get("ended_at"),
        "totals": {
            "incidents":       len(incidents),
            "reviewed":        reviewed,
            "avg_confidence":  round(avg_conf, 3),
        },
        "severity_breakdown":  dict(sev_counts),
        "type_breakdown":      dict(type_counts),
        "decision_breakdown":  dict(dec_counts),
        # Quality indicators that the portal report card surfaces
        "quality": {
            "reviewed_pct":           round(100.0 * reviewed / len(incidents), 1) if incidents else 0.0,
            "high_severity_pct":      round(100.0 * (sev_counts.get("high", 0) + sev_counts.get("critical", 0)) / len(incidents), 1) if incidents else 0.0,
            "violations":             dec_counts.get("violation", 0),
            "false_positive_signals": dec_counts.get("clean", 0),
        },
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Generate AI performance report for an exam session")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--output",     default="-", help="Output file path; '-' for stdout")
    args = parser.parse_args(argv)

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        parser.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required")

    report = build_report(args.session_id, supabase_url, service_key)
    text = json.dumps(report, indent=2)
    if args.output == "-":
        print(text)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

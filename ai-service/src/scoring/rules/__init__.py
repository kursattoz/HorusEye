"""Sprint 7+ rule engine — output type and shared helpers.

Each rule is a pure function ``evaluate(track_state, ctx) -> IncidentCandidate | None``.
The publish handler runs every applicable rule for each updated track on
each frame; positive results are persisted by ``src.persistence.incident_writer``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class IncidentCandidate:
    """A rule-fire ready for persistence + WS broadcast.

    Field names align 1:1 with ``incidents`` row columns (Incident @1.1)
    so the writer layer is a near-direct mapping.
    """

    incident_type: str                                 # → incidents.incident_type
    severity: str                                      # → incidents.severity
    confidence: float                                  # → incidents.confidence
    track_id: int                                      # → incidents.track_id
    triggered_rules: tuple[str, ...]                   # → incidents.triggered_rules
    bbox: tuple[float, float, float, float]            # anchor (object that triggered)
    person_bbox: tuple[float, float, float, float]     # the tracked person's bbox
    raw_signals: dict[str, Any] = field(default_factory=dict)   # → incidents.raw_signals
    occurred_at: float = 0.0                           # epoch seconds → incidents.occurred_at

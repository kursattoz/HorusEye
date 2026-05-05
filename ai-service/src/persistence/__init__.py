"""Persistence layer — Sprint 7+ (PRD-013 §7.1).

Owns the Supabase service-role client and the incident writer that turns
:class:`~src.scoring.rules.IncidentCandidate` instances into rows in the
``incidents`` table plus evidence JPEGs in the ``incident-evidence``
Storage bucket.
"""

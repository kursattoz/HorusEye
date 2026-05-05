"""Scoring layer — Sprint 7+ (PRD-013 §3.2, §7.2, §7.3 Phase A).

Owns multi-object tracking (BoT-SORT wrapper), per-track rolling state, and
rule evaluation. Sits between the raw detector layer (``src.detection``) and
the persistence layer (``src.persistence``).
"""

-- PRD-021 §3 Sprint 17 + Sprint 18: behavior + pose + multi-cam types.
-- Adds 9 new incident_type values. Drops + re-adds the CHECK constraint
-- atomically (Postgres can't extend a CHECK in place).

ALTER TABLE public.incidents
  DROP CONSTRAINT incidents_incident_type_check;

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_incident_type_check CHECK (incident_type IN (
    -- Phase A / existing (Sprint 7-13)
    'phone_detected','earbuds_detected','paper_detected',
    'gaze_diversion','head_turn','empty_seat',
    'whispering','unauthorized_communication','position_uncertainty',
    -- Sprint 17 — pose / behavior / gaze refinements
    'body_lean_neighbor','standing_up','hand_under_desk',
    'hand_to_ear_mouth','object_passing','gaze_at_lap',
    'gaze_at_neighbor','synchronized_behavior',
    -- Sprint 18 — multi-cam + face covering
    'face_covering'
  ));

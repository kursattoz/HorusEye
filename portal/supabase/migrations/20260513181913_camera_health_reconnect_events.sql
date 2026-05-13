-- BL-253 follow-up — extends camera_health_events.event_type CHECK with
-- the three reconnect telemetry events posted by CamPairCapture:
--   * reconnect_scheduled  — auto-backoff scheduled a retry
--   * reconnect_gave_up    — auto-backoff exhausted; user must intervene
--   * reconnect_manual     — user clicked the manual Reconnect button
-- The old constraint silently rejected these posts (best-effort fetch
-- swallowed the 400), so the health log was missing the reliability
-- signal we need for PRD-019 §4.3 monitoring.

ALTER TABLE public.camera_health_events
  DROP CONSTRAINT camera_health_events_event_type_check;

ALTER TABLE public.camera_health_events
  ADD CONSTRAINT camera_health_events_event_type_check CHECK (event_type IN (
    'connected', 'disconnected', 'reconnected',
    'low_battery', 'critical_battery', 'charging',
    'app_backgrounded', 'app_foregrounded',
    'overheat', 'orientation_changed', 'preview_offscreen',
    'permission_revoked',
    -- BL-253 reconnect telemetry
    'reconnect_scheduled', 'reconnect_gave_up', 'reconnect_manual'
  ));

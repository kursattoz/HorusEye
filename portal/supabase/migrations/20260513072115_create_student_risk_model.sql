-- BL-225 — Sprint 11: Risk score model
-- Per-student risk derived from weighted incident severities over a rolling 90-day window.
-- Severity weights: low=0.25, medium=0.50, high=0.75, critical=1.00
-- Trend: last 30d avg weight vs prior 30d (±15% bands).

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS risk_score      NUMERIC(5,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level      TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS risk_trend      TEXT NOT NULL DEFAULT 'stable'
    CHECK (risk_trend IN ('rising','stable','falling')),
  ADD COLUMN IF NOT EXISTS incident_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_risk_level ON public.students (risk_level) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_risk_score ON public.students (risk_score DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- calculate_student_risk(student_uuid) — pure compute, no side effects
-- Returns: risk components + breakdown JSON (severity → count)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_student_risk(p_student_uuid UUID)
RETURNS TABLE (
  risk_score          NUMERIC,
  risk_level          TEXT,
  risk_trend          TEXT,
  incident_count      INTEGER,
  recent_count        INTEGER,
  prior_count         INTEGER,
  severity_breakdown  JSONB
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_student_code TEXT;
BEGIN
  SELECT s.student_id INTO v_student_code FROM public.students s WHERE s.id = p_student_uuid;
  IF v_student_code IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH i AS (
    SELECT
      inc.severity,
      inc.occurred_at,
      CASE inc.severity
        WHEN 'low' THEN 0.25
        WHEN 'medium' THEN 0.50
        WHEN 'high' THEN 0.75
        WHEN 'critical' THEN 1.00
      END::NUMERIC AS w
    FROM public.incidents inc
    WHERE inc.student_id = v_student_code
      AND inc.occurred_at >= NOW() - INTERVAL '90 days'
  ),
  recent AS (
    SELECT COUNT(*)::INT AS c, COALESCE(AVG(w),0)::NUMERIC AS avg_w
    FROM i WHERE occurred_at >= NOW() - INTERVAL '30 days'
  ),
  prior AS (
    SELECT COUNT(*)::INT AS c, COALESCE(AVG(w),0)::NUMERIC AS avg_w
    FROM i WHERE occurred_at <  NOW() - INTERVAL '30 days'
              AND occurred_at >= NOW() - INTERVAL '60 days'
  ),
  totals AS (
    SELECT COUNT(*)::INT AS total_count, COALESCE(AVG(w),0)::NUMERIC AS rolling
    FROM i
  ),
  breakdown AS (
    SELECT COALESCE(jsonb_object_agg(severity, c), '{}'::JSONB) AS br
    FROM (SELECT severity, COUNT(*)::INT AS c FROM i GROUP BY severity) g
  )
  SELECT
    ROUND(totals.rolling, 3) AS risk_score,
    CASE
      WHEN totals.rolling >= 0.75 THEN 'critical'
      WHEN totals.rolling >= 0.50 THEN 'high'
      WHEN totals.rolling >= 0.25 THEN 'medium'
      ELSE 'low'
    END::TEXT AS risk_level,
    CASE
      WHEN recent.avg_w > prior.avg_w * 1.15 AND recent.c > 0 THEN 'rising'
      WHEN recent.avg_w < prior.avg_w * 0.85 AND prior.c  > 0 THEN 'falling'
      ELSE 'stable'
    END::TEXT AS risk_trend,
    totals.total_count AS incident_count,
    recent.c AS recent_count,
    prior.c  AS prior_count,
    breakdown.br AS severity_breakdown
  FROM totals, recent, prior, breakdown;
END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_student_risk(student_uuid) — write cache columns on students row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_student_risk(p_student_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.calculate_student_risk(p_student_uuid);
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public.students
     SET risk_score      = r.risk_score,
         risk_level      = r.risk_level,
         risk_trend      = r.risk_trend,
         incident_count  = r.incident_count,
         risk_updated_at = NOW()
   WHERE id = p_student_uuid;
END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_session_students_risk(session_uuid) — pre-session bulk refresh.
-- Used by /api/sessions/[id]/refresh-risk and the high-risk notifier (BL-229).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_session_students_risk(p_session_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT ss.student_id AS sid
    FROM public.session_students ss
    WHERE ss.session_id = p_session_id
  LOOP
    PERFORM public.refresh_student_risk(rec.sid);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: refresh risk on incident insert (only when student_id matches a known student).
-- Cheap because each refresh scopes to the single student's 90d window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_incidents_refresh_student_risk()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_uuid UUID;
BEGIN
  IF NEW.student_id IS NULL OR NEW.student_id LIKE 'track:%' THEN
    RETURN NEW;
  END IF;
  SELECT s.id INTO v_uuid FROM public.students s WHERE s.student_id = NEW.student_id LIMIT 1;
  IF v_uuid IS NOT NULL THEN
    PERFORM public.refresh_student_risk(v_uuid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incidents_refresh_student_risk ON public.incidents;
CREATE TRIGGER trg_incidents_refresh_student_risk
  AFTER INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_incidents_refresh_student_risk();

GRANT EXECUTE ON FUNCTION public.calculate_student_risk(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_risk(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_session_students_risk(UUID) TO authenticated;

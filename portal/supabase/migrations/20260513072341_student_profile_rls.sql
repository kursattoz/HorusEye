-- BL-233 — Sprint 11: Student profile privacy via tightened incident RLS.
-- The "profile" is the joined view: student + their incidents + session history.
-- Privacy boundary: admin users OR proctors who actually proctored a session
-- containing the student may see/update the student's incident history.
-- Student list (public.students) remains open to all authenticated — only
-- incident-derived (sensitive) data is gated.

-- ---- helper: is the user admin? ----
CREATE OR REPLACE FUNCTION public.user_is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.user_profiles WHERE id = p_user_id AND is_active = true),
    false
  );
$$;

-- ---- helper: does user proctor any session that includes this student code? ----
CREATE OR REPLACE FUNCTION public.user_proctors_student(p_student_code TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_proctors sp
    JOIN public.session_students ss ON ss.session_id = sp.session_id
    JOIN public.students st         ON st.id          = ss.student_id
    WHERE sp.user_id     = p_user_id
      AND st.student_id  = p_student_code
  );
$$;

-- ---- helper: does user proctor this session? ----
CREATE OR REPLACE FUNCTION public.user_proctors_session(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.session_proctors sp
    WHERE sp.session_id = p_session_id AND sp.user_id = p_user_id
  );
$$;

-- ---- tighten incidents RLS ----
DROP POLICY IF EXISTS incidents_all ON public.incidents;

-- SELECT: admin OR proctor of the incident's session
CREATE POLICY incidents_select ON public.incidents
  FOR SELECT TO authenticated
  USING (
    public.user_is_admin(auth.uid())
    OR public.user_proctors_session(session_id, auth.uid())
  );

-- INSERT: open to authenticated (AI service uses service role; portal admin tools may insert)
CREATE POLICY incidents_insert ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: only admin or session proctor (decision-making)
CREATE POLICY incidents_update ON public.incidents
  FOR UPDATE TO authenticated
  USING (
    public.user_is_admin(auth.uid())
    OR public.user_proctors_session(session_id, auth.uid())
  )
  WITH CHECK (
    public.user_is_admin(auth.uid())
    OR public.user_proctors_session(session_id, auth.uid())
  );

-- DELETE: admin only
CREATE POLICY incidents_delete ON public.incidents
  FOR DELETE TO authenticated
  USING (public.user_is_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.user_is_admin(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_proctors_student(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_proctors_session(UUID, UUID) TO authenticated;

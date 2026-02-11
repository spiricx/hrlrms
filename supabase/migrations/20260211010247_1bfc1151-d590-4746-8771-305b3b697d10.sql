
-- Fix 1: Restrict default_logs SELECT to admins, loan officers, and state-based staff
DROP POLICY IF EXISTS "Authenticated users can view default logs" ON public.default_logs;

CREATE POLICY "Admins and loan officers can view all default logs"
  ON public.default_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'loan_officer'::app_role)
  );

CREATE POLICY "Staff can view default logs for their state beneficiaries"
  ON public.default_logs FOR SELECT
  USING (
    beneficiary_id IN (
      SELECT b.id FROM beneficiaries b
      WHERE b.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
    )
  );

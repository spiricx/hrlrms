
-- Staff Transfers table
CREATE TABLE public.staff_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  from_state text NOT NULL DEFAULT '',
  from_branch text NOT NULL DEFAULT '',
  from_department text NOT NULL DEFAULT '',
  from_unit text NOT NULL DEFAULT '',
  to_state text NOT NULL DEFAULT '',
  to_branch text NOT NULL DEFAULT '',
  to_department text NOT NULL DEFAULT '',
  to_unit text NOT NULL DEFAULT '',
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.staff_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to transfers"
  ON public.staff_transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coordinators view own state transfers"
  ON public.staff_transfers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'loan_officer') AND (
    from_state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
    OR to_state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  ));

-- Staff Leaves table
CREATE TABLE public.staff_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  leave_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_entitled integer NOT NULL DEFAULT 21,
  days_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.staff_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to leaves"
  ON public.staff_leaves FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coordinators view own state leaves"
  ON public.staff_leaves FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'loan_officer') AND (
    staff_id IN (
      SELECT sm.id FROM staff_members sm
      WHERE sm.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
    )
  ));

CREATE POLICY "Staff view own leaves"
  ON public.staff_leaves FOR SELECT TO authenticated
  USING (staff_id IN (
    SELECT sm.id FROM staff_members sm
    WHERE sm.email = (SELECT p.email FROM profiles p WHERE p.user_id = auth.uid())
  ));

-- Staff Audit Logs table
CREATE TABLE public.staff_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'update',
  field_changed text NOT NULL DEFAULT '',
  old_value text DEFAULT '',
  new_value text DEFAULT '',
  modified_by uuid,
  modified_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to audit logs"
  ON public.staff_audit_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coordinators view own state audit logs"
  ON public.staff_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'loan_officer') AND (
    staff_id IN (
      SELECT sm.id FROM staff_members sm
      WHERE sm.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
    )
  ));

-- Coordinators can insert audit logs for own state
CREATE POLICY "Coordinators insert own state audit logs"
  ON public.staff_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'loan_officer') AND (
    staff_id IN (
      SELECT sm.id FROM staff_members sm
      WHERE sm.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
    )
  ));

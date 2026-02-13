
-- Staff members table (separate from profiles/auth users)
CREATE TABLE public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text DEFAULT '',
  surname text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  other_names text DEFAULT '',
  staff_id text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT '',
  unit text DEFAULT '',
  department text DEFAULT '',
  designation text DEFAULT '',
  cadre text DEFAULT '',
  group_name text DEFAULT '',
  gender text DEFAULT '',
  date_of_birth date,
  phone text DEFAULT '',
  email text DEFAULT '',
  date_employed date,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins full access to staff"
ON public.staff_members FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Loan officers (state coordinators): view & edit own state
CREATE POLICY "Coordinators view own state staff"
ON public.staff_members FOR SELECT
USING (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
);

CREATE POLICY "Coordinators insert own state staff"
ON public.staff_members FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
);

CREATE POLICY "Coordinators update own state staff"
ON public.staff_members FOR UPDATE
USING (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
);

-- Staff: view only own record (matched by email)
CREATE POLICY "Staff view own record"
ON public.staff_members FOR SELECT
USING (
  email = (SELECT p.email FROM profiles p WHERE p.user_id = auth.uid())
);

-- Timestamp trigger
CREATE TRIGGER update_staff_members_updated_at
BEFORE UPDATE ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_members;

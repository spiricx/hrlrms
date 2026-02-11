
-- Drop all existing RESTRICTIVE policies on beneficiaries
DROP POLICY IF EXISTS "Admins can view all beneficiaries" ON public.beneficiaries;
DROP POLICY IF EXISTS "Staff view beneficiaries by state" ON public.beneficiaries;
DROP POLICY IF EXISTS "Authenticated staff can insert" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins and loan officers can update" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins can delete" ON public.beneficiaries;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Admins can view all beneficiaries"
  ON public.beneficiaries FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff view beneficiaries by state"
  ON public.beneficiaries FOR SELECT
  USING (
    (state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid()))
    OR (state = ''::text)
  );

CREATE POLICY "Authenticated staff can insert"
  ON public.beneficiaries FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'loan_officer'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "Admins and loan officers can update"
  ON public.beneficiaries FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'loan_officer'::app_role)
  );

CREATE POLICY "Admins can delete"
  ON public.beneficiaries FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Also fix profiles policies (needed for the state-based SELECT to work)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Fix user_roles policies too
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Fix transactions policies
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins and loan officers can insert transactions" ON public.transactions;

CREATE POLICY "Authenticated users can view transactions"
  ON public.transactions FOR SELECT
  USING (true);

CREATE POLICY "Admins and loan officers can insert transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'loan_officer'::app_role)
  );

-- Fix default_logs policies
DROP POLICY IF EXISTS "Authenticated users can view default logs" ON public.default_logs;
DROP POLICY IF EXISTS "System can insert default logs" ON public.default_logs;

CREATE POLICY "Authenticated users can view default logs"
  ON public.default_logs FOR SELECT
  USING (true);

CREATE POLICY "System can insert default logs"
  ON public.default_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

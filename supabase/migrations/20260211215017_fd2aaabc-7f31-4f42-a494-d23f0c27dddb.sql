
-- Drop all existing restrictive policies on beneficiaries
DROP POLICY IF EXISTS "Authenticated staff can insert" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins and loan officers can update" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins can delete" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins can view all beneficiaries" ON public.beneficiaries;
DROP POLICY IF EXISTS "Staff view beneficiaries by state" ON public.beneficiaries;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Admins can view all beneficiaries"
ON public.beneficiaries FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff view beneficiaries by state"
ON public.beneficiaries FOR SELECT
USING (
  (state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid()))
  OR (state = ''::text)
);

CREATE POLICY "Authenticated staff can insert"
ON public.beneficiaries FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'loan_officer'::app_role)
  OR public.has_role(auth.uid(), 'staff'::app_role)
);

CREATE POLICY "Admins and loan officers can update"
ON public.beneficiaries FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'loan_officer'::app_role)
);

CREATE POLICY "Admins can delete"
ON public.beneficiaries FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

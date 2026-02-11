
-- Drop existing restrictive SELECT policies
DROP POLICY IF EXISTS "Admins can view all beneficiaries" ON public.beneficiaries;
DROP POLICY IF EXISTS "Staff view beneficiaries by state" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins and loan officers can insert" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins and loan officers can update" ON public.beneficiaries;
DROP POLICY IF EXISTS "Admins can delete" ON public.beneficiaries;

-- Recreate as PERMISSIVE policies (OR logic)
CREATE POLICY "Admins can view all beneficiaries"
ON public.beneficiaries FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff view beneficiaries by state"
ON public.beneficiaries FOR SELECT
TO authenticated
USING (
  state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  OR state = ''
);

-- Allow admin, loan_officer, AND staff to insert
CREATE POLICY "Authenticated staff can insert"
ON public.beneficiaries FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'loan_officer')
  OR has_role(auth.uid(), 'staff')
);

-- Allow admin and loan_officer to update
CREATE POLICY "Admins and loan officers can update"
ON public.beneficiaries FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'loan_officer')
);

-- Allow admin to delete
CREATE POLICY "Admins can delete"
ON public.beneficiaries FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

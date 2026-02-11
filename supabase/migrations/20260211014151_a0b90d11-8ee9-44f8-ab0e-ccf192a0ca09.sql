
-- Drop the restrictive SELECT policies
DROP POLICY IF EXISTS "Admins can view all beneficiaries" ON public.beneficiaries;
DROP POLICY IF EXISTS "Staff view beneficiaries by state" ON public.beneficiaries;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Admins can view all beneficiaries"
ON public.beneficiaries
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff view beneficiaries by state"
ON public.beneficiaries
FOR SELECT
USING (
  state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  OR state = ''::text
);

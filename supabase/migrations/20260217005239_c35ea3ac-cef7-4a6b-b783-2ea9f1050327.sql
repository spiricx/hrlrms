
-- Update RLS policy that references 'staff' role
DROP POLICY IF EXISTS "Authenticated staff can insert" ON public.beneficiaries;
CREATE POLICY "Authenticated users can insert"
ON public.beneficiaries
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'loan_officer'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

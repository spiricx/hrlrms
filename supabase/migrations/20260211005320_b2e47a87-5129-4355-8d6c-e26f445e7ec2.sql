
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON public.transactions;

-- Admins and loan officers can view all transactions
CREATE POLICY "Admins and loan officers can view all transactions"
  ON public.transactions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'loan_officer'::app_role)
  );

-- Staff can only view transactions for beneficiaries in their state
CREATE POLICY "Staff can view transactions for their state beneficiaries"
  ON public.transactions FOR SELECT
  USING (
    beneficiary_id IN (
      SELECT b.id FROM beneficiaries b
      WHERE b.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
    )
  );

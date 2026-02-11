
-- Drop existing transaction policies
DROP POLICY IF EXISTS "Admins and loan officers can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins and loan officers can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Staff can view transactions for their state beneficiaries" ON public.transactions;

-- Admin: full access to all transactions
CREATE POLICY "Admins full access to transactions"
ON public.transactions FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Loan officers: view transactions for their state/branch beneficiaries
CREATE POLICY "Loan officers view own state transactions"
ON public.transactions FOR SELECT
USING (
  public.has_role(auth.uid(), 'loan_officer'::app_role)
  AND beneficiary_id IN (
    SELECT b.id FROM public.beneficiaries b
    WHERE b.state = (SELECT p.state FROM public.profiles p WHERE p.user_id = auth.uid())
       OR b.bank_branch = (SELECT p.bank_branch FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);

-- Loan officers: insert transactions for their state/branch beneficiaries
CREATE POLICY "Loan officers insert own state transactions"
ON public.transactions FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'loan_officer'::app_role)
  AND recorded_by = auth.uid()
  AND beneficiary_id IN (
    SELECT b.id FROM public.beneficiaries b
    WHERE b.state = (SELECT p.state FROM public.profiles p WHERE p.user_id = auth.uid())
       OR b.bank_branch = (SELECT p.bank_branch FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);

-- Loan officers: update own recordings for their state/branch
CREATE POLICY "Loan officers update own state transactions"
ON public.transactions FOR UPDATE
USING (
  public.has_role(auth.uid(), 'loan_officer'::app_role)
  AND recorded_by = auth.uid()
  AND beneficiary_id IN (
    SELECT b.id FROM public.beneficiaries b
    WHERE b.state = (SELECT p.state FROM public.profiles p WHERE p.user_id = auth.uid())
       OR b.bank_branch = (SELECT p.bank_branch FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);

-- Loan officers: delete own recordings within 24 hours, loan not completed
CREATE POLICY "Loan officers delete own recent transactions"
ON public.transactions FOR DELETE
USING (
  public.has_role(auth.uid(), 'loan_officer'::app_role)
  AND recorded_by = auth.uid()
  AND created_at > (now() - interval '24 hours')
  AND beneficiary_id IN (
    SELECT b.id FROM public.beneficiaries b
    WHERE (b.state = (SELECT p.state FROM public.profiles p WHERE p.user_id = auth.uid())
       OR b.bank_branch = (SELECT p.bank_branch FROM public.profiles p WHERE p.user_id = auth.uid()))
    AND b.status != 'completed'
  )
);

-- Staff: view only for their state
CREATE POLICY "Staff view own state transactions"
ON public.transactions FOR SELECT
USING (
  beneficiary_id IN (
    SELECT b.id FROM public.beneficiaries b
    WHERE b.state = (SELECT p.state FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);

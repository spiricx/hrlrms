
-- Create loan_batches table
CREATE TABLE public.loan_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL UNIQUE,
  name text NOT NULL,
  state text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
);

ALTER TABLE public.loan_batches ENABLE ROW LEVEL SECURITY;

-- Add batch_id to beneficiaries
ALTER TABLE public.beneficiaries ADD COLUMN batch_id uuid REFERENCES public.loan_batches(id);

-- Create batch_repayments table
CREATE TABLE public.batch_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.loan_batches(id),
  month_for integer NOT NULL,
  expected_amount numeric NOT NULL,
  actual_amount numeric NOT NULL,
  rrr_number text NOT NULL,
  payment_date date NOT NULL,
  receipt_url text DEFAULT '',
  notes text DEFAULT '',
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.batch_repayments ENABLE ROW LEVEL SECURITY;

-- RLS for loan_batches
CREATE POLICY "Admins full access to batches"
ON public.loan_batches FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff and officers view batches by state"
ON public.loan_batches FOR SELECT
USING (
  state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  OR state = ''
);

CREATE POLICY "Loan officers insert batches for own state"
ON public.loan_batches FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND (state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid()) OR state = '')
);

CREATE POLICY "Loan officers update own state batches"
ON public.loan_batches FOR UPDATE
USING (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
);

-- RLS for batch_repayments
CREATE POLICY "Admins full access to batch_repayments"
ON public.batch_repayments FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Loan officers view own state batch repayments"
ON public.batch_repayments FOR SELECT
USING (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND batch_id IN (
    SELECT lb.id FROM loan_batches lb
    WHERE lb.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  )
);

CREATE POLICY "Loan officers insert own state batch repayments"
ON public.batch_repayments FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'loan_officer'::app_role)
  AND recorded_by = auth.uid()
  AND batch_id IN (
    SELECT lb.id FROM loan_batches lb
    WHERE lb.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  )
);

CREATE POLICY "Staff view own state batch repayments"
ON public.batch_repayments FOR SELECT
USING (
  batch_id IN (
    SELECT lb.id FROM loan_batches lb
    WHERE lb.state = (SELECT p.state FROM profiles p WHERE p.user_id = auth.uid())
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_repayments;

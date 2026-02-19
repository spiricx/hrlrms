
-- Create reconciliation_sessions table to store monthly reconciliation records
CREATE TABLE public.reconciliation_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization TEXT NOT NULL DEFAULT '',
  payment_month INTEGER NOT NULL,
  payment_year INTEGER NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  total_records INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  total_cbn_amount NUMERIC NOT NULL DEFAULT 0,
  matched_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reconciliation_sessions ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins full access to reconciliation sessions"
ON public.reconciliation_sessions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Loan officers can view all sessions
CREATE POLICY "Loan officers view reconciliation sessions"
ON public.reconciliation_sessions
FOR SELECT
USING (has_role(auth.uid(), 'loan_officer'::app_role));

-- Loan officers can insert their own sessions
CREATE POLICY "Loan officers insert reconciliation sessions"
ON public.reconciliation_sessions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'loan_officer'::app_role) AND created_by = auth.uid());

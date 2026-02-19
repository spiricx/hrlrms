
CREATE TABLE public.reconciliation_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.reconciliation_sessions(id) ON DELETE CASCADE,
  rrr_number text NOT NULL DEFAULT '',
  beneficiary_name text NOT NULL DEFAULT '',
  batch_name text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  system_amount numeric NOT NULL DEFAULT 0,
  cbn_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to reconciliation matches"
  ON public.reconciliation_matches
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Loan officers view reconciliation matches"
  ON public.reconciliation_matches
  FOR SELECT
  USING (has_role(auth.uid(), 'loan_officer'::app_role));

CREATE POLICY "Loan officers insert reconciliation matches"
  ON public.reconciliation_matches
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'loan_officer'::app_role) AND (session_id IN (
    SELECT id FROM public.reconciliation_sessions WHERE created_by = auth.uid()
  )));

CREATE INDEX idx_reconciliation_matches_session_id ON public.reconciliation_matches(session_id);

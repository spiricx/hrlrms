
CREATE TABLE public.flagged_beneficiaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  beneficiary_id UUID NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, beneficiary_id)
);

ALTER TABLE public.flagged_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flags" ON public.flagged_beneficiaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own flags" ON public.flagged_beneficiaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own flags" ON public.flagged_beneficiaries FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.flagged_beneficiaries;

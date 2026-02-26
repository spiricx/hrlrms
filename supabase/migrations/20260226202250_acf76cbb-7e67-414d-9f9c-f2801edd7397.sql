
-- Table to persist starred/bookmarked beneficiaries per user
CREATE TABLE public.starred_beneficiaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, beneficiary_id)
);

-- Enable RLS
ALTER TABLE public.starred_beneficiaries ENABLE ROW LEVEL SECURITY;

-- Users can view their own stars
CREATE POLICY "Users can view own stars"
ON public.starred_beneficiaries FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert own stars
CREATE POLICY "Users can insert own stars"
ON public.starred_beneficiaries FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete own stars
CREATE POLICY "Users can delete own stars"
ON public.starred_beneficiaries FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for instant sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.starred_beneficiaries;

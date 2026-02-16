
CREATE TABLE public.staff_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT 'login',
  state text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  ip_address text DEFAULT '',
  user_agent text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all activity logs"
ON public.staff_activity_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can insert own activity"
ON public.staff_activity_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_staff_activity_logs_created_at ON public.staff_activity_logs (created_at DESC);
CREATE INDEX idx_staff_activity_logs_user_id ON public.staff_activity_logs (user_id);

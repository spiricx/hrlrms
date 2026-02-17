
-- Create role change history table
CREATE TABLE public.role_change_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  user_full_name TEXT NOT NULL DEFAULT '',
  previous_role TEXT,
  new_role TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'assigned',
  changed_by UUID,
  changed_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.role_change_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view and insert
CREATE POLICY "Admins full access to role change logs"
  ON public.role_change_logs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

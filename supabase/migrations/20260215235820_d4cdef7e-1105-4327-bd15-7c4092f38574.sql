
-- Create table to store per-user module access permissions
CREATE TABLE public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  granted_by uuid,
  UNIQUE (user_id, module_key)
);

-- Enable RLS
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- Admins can manage all module access
CREATE POLICY "Admins full access to module access"
ON public.user_module_access
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own module access
CREATE POLICY "Users can view own module access"
ON public.user_module_access
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

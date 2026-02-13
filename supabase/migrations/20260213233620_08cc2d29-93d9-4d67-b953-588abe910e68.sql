
-- Add status_date and status_reason columns to staff_members
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS status_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_reason text DEFAULT '';

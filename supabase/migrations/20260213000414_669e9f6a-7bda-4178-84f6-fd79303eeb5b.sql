
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS nhf_number text DEFAULT '';
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS bvn_number text DEFAULT '';
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS nin_number text DEFAULT '';

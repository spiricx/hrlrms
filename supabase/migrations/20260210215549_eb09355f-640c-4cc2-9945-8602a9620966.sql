
-- Expand profiles with staff identification fields
ALTER TABLE public.profiles 
  ADD COLUMN surname text NOT NULL DEFAULT '',
  ADD COLUMN first_name text NOT NULL DEFAULT '',
  ADD COLUMN other_names text NOT NULL DEFAULT '',
  ADD COLUMN staff_id_no text NOT NULL DEFAULT '',
  ADD COLUMN nhf_account_number text NOT NULL DEFAULT '',
  ADD COLUMN bank_branch text NOT NULL DEFAULT '',
  ADD COLUMN state text NOT NULL DEFAULT '';

-- Add originating branch/state to beneficiaries for location-based filtering
ALTER TABLE public.beneficiaries
  ADD COLUMN bank_branch text NOT NULL DEFAULT '',
  ADD COLUMN state text NOT NULL DEFAULT '';

-- Update RLS: staff (loan_officer) can only see beneficiaries from their branch/state
-- First drop the old SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view beneficiaries" ON public.beneficiaries;

-- Admins see all beneficiaries
CREATE POLICY "Admins can view all beneficiaries"
  ON public.beneficiaries FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Loan officers and staff see beneficiaries from their own state
CREATE POLICY "Staff view beneficiaries by state"
  ON public.beneficiaries FOR SELECT
  USING (
    state = (SELECT p.state FROM public.profiles p WHERE p.user_id = auth.uid())
    OR state = ''
  );

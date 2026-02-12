
-- Add personal bio data columns to beneficiaries table
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS phone_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bvn_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nin_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender text DEFAULT '',
  ADD COLUMN IF NOT EXISTS marital_status text DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS employer_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_of_employment date,
  ADD COLUMN IF NOT EXISTS loan_reference_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS surname text DEFAULT '',
  ADD COLUMN IF NOT EXISTS first_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS other_name text DEFAULT '';

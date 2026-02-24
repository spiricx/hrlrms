
-- 1. Attach handle_new_user trigger to auth.users (creates profile on signup)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Attach auto_assign_first_admin trigger to profiles
CREATE OR REPLACE TRIGGER on_first_profile_auto_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_first_admin();

-- 3. Attach auto_link_staff_on_signup trigger to profiles
CREATE OR REPLACE TRIGGER on_profile_link_staff
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_staff_on_signup();

-- 4. Attach sync_profile_to_staff trigger to profiles
CREATE OR REPLACE TRIGGER on_profile_sync_staff
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_staff();

-- 5. Attach update_beneficiary_default_count triggers
CREATE OR REPLACE TRIGGER trg_beneficiary_default_count
  BEFORE INSERT OR UPDATE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beneficiary_default_count();

CREATE OR REPLACE TRIGGER trg_transaction_default_count
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beneficiary_default_count();

-- 6. Attach sync_beneficiary_from_transactions trigger
CREATE OR REPLACE TRIGGER trg_sync_beneficiary_from_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_beneficiary_from_transactions();

-- 7. Attach updated_at triggers
CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_staff_members_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_beneficiaries_updated_at
  BEFORE UPDATE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_loan_batches_updated_at
  BEFORE UPDATE ON public.loan_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Backfill profiles for existing auth users who don't have profiles
INSERT INTO public.profiles (user_id, email, full_name, surname, first_name, other_names, staff_id_no, nhf_account_number, bank_branch, state)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  COALESCE(u.raw_user_meta_data->>'surname', ''),
  COALESCE(u.raw_user_meta_data->>'first_name', ''),
  COALESCE(u.raw_user_meta_data->>'other_names', ''),
  COALESCE(u.raw_user_meta_data->>'staff_id_no', ''),
  COALESCE(u.raw_user_meta_data->>'nhf_account_number', ''),
  COALESCE(u.raw_user_meta_data->>'bank_branch', ''),
  COALESCE(u.raw_user_meta_data->>'state', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);

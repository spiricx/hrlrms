
-- Update handle_new_user to populate new profile fields from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, surname, first_name, other_names, staff_id_no, nhf_account_number, bank_branch, state)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'surname', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'other_names', ''),
    COALESCE(NEW.raw_user_meta_data->>'staff_id_no', ''),
    COALESCE(NEW.raw_user_meta_data->>'nhf_account_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'bank_branch', ''),
    COALESCE(NEW.raw_user_meta_data->>'state', '')
  );
  RETURN NEW;
END;
$function$;


-- Backfill: Insert staff_members records for profiles that don't have a matching staff_members record (matched by email)
INSERT INTO public.staff_members (staff_id, surname, first_name, email, state, branch, created_by)
SELECT 
  p.staff_id_no,
  p.surname,
  p.first_name,
  p.email,
  p.state,
  p.bank_branch,
  p.user_id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_members sm WHERE LOWER(sm.email) = LOWER(p.email)
)
AND p.email != '';

-- Create trigger function to auto-create staff_members when a profile is created/updated
CREATE OR REPLACE FUNCTION public.sync_profile_to_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if a staff_members record already exists for this email
  IF NOT EXISTS (SELECT 1 FROM public.staff_members WHERE LOWER(email) = LOWER(NEW.email)) THEN
    INSERT INTO public.staff_members (staff_id, surname, first_name, email, state, branch, created_by)
    VALUES (
      NEW.staff_id_no,
      NEW.surname,
      NEW.first_name,
      NEW.email,
      NEW.state,
      NEW.bank_branch,
      NEW.user_id
    );
  ELSE
    -- Update existing staff_members record to keep in sync
    UPDATE public.staff_members
    SET 
      surname = NEW.surname,
      first_name = NEW.first_name,
      state = NEW.state,
      branch = NEW.bank_branch,
      staff_id = COALESCE(NULLIF(NEW.staff_id_no, ''), staff_id),
      updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table
DROP TRIGGER IF EXISTS sync_profile_to_staff_trigger ON public.profiles;
CREATE TRIGGER sync_profile_to_staff_trigger
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_staff();

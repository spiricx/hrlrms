
-- Auto-link: when a new user signs up, if their email matches a staff_members record,
-- automatically assign them the 'staff' role.
CREATE OR REPLACE FUNCTION public.auto_link_staff_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if the new user's email matches a staff member record
  IF EXISTS (SELECT 1 FROM public.staff_members WHERE LOWER(email) = LOWER(NEW.email)) THEN
    -- Only insert if they don't already have the staff role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'staff')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Fire AFTER the profile is created (which happens via handle_new_user trigger on auth.users)
CREATE TRIGGER on_profile_created_link_staff
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_staff_on_signup();

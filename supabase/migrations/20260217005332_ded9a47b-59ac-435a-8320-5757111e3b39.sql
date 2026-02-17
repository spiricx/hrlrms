
-- Update the auto_link_staff_on_signup function to assign 'manager' instead of 'staff'
CREATE OR REPLACE FUNCTION public.auto_link_staff_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.staff_members WHERE LOWER(email) = LOWER(NEW.email)) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'manager')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

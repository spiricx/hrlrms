
-- 1. Fix calculate_default_count to use end-of-month due date logic (align with Golden Record)
CREATE OR REPLACE FUNCTION public.calculate_default_count(
  p_commencement_date date,
  p_tenor_months integer,
  p_monthly_emi numeric,
  p_total_paid numeric,
  p_outstanding_balance numeric,
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_months_due integer;
  v_months_paid integer;
  v_overdue integer;
BEGIN
  v_today := CURRENT_DATE;

  -- Completed loans or near-zero balances have 0 defaults
  IF p_status = 'completed' OR p_outstanding_balance < 0.01 THEN
    RETURN 0;
  END IF;

  -- If commencement hasn't arrived yet, no defaults
  IF v_today < p_commencement_date THEN
    RETURN 0;
  END IF;

  -- END-OF-MONTH due date logic (aligned with Golden Record v_loan_arrears):
  -- Month i is due on: (commencement + i months - 1 day), i.e. last day of that month
  -- Month i is "due" when today >= that date, equivalently when (today + 1 day) >= (commencement + i months)
  -- So months_due = month diff between commencement and (today + 1 day)
  v_months_due := GREATEST(0,
    ((EXTRACT(YEAR FROM (v_today + 1)) - EXTRACT(YEAR FROM p_commencement_date)) * 12 +
     (EXTRACT(MONTH FROM (v_today + 1)) - EXTRACT(MONTH FROM p_commencement_date)))::integer
  );

  -- Cap at tenor
  v_months_due := LEAST(v_months_due, p_tenor_months);

  -- Months fully paid (round to 2dp before floor to prevent precision drift)
  IF p_monthly_emi > 0 THEN
    v_months_paid := FLOOR(ROUND(p_total_paid / p_monthly_emi, 2))::integer;
  ELSE
    v_months_paid := 0;
  END IF;

  v_overdue := GREATEST(0, v_months_due - v_months_paid);

  RETURN v_overdue;
END;
$function$;

-- 2. Add passport_photo_url column to beneficiaries
ALTER TABLE public.beneficiaries 
ADD COLUMN IF NOT EXISTS passport_photo_url text DEFAULT NULL;

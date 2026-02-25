-- Fix calculate_default_count: apply same precision fixes as v_loan_arrears
-- 1. Round before floor to prevent floating-point precision errors
-- 2. Use 0.01 tolerance for near-zero balances

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
  v_months_elapsed integer;
  v_months_due integer;
  v_months_paid integer;
  v_overdue integer;
BEGIN
  v_today := CURRENT_DATE;

  -- Completed loans or near-zero balances have 0 defaults
  -- FIX: use 0.01 tolerance for floating-point precision
  IF p_status = 'completed' OR p_outstanding_balance < 0.01 THEN
    RETURN 0;
  END IF;

  -- If commencement hasn't arrived yet, no defaults
  IF v_today < p_commencement_date THEN
    RETURN 0;
  END IF;

  -- Months elapsed since commencement (inclusive: on commencement date = month 1 is due)
  v_months_elapsed := (
    (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM p_commencement_date)) * 12 +
    (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM p_commencement_date))
  )::integer;

  -- If today's day >= commencement day, current month is due
  IF EXTRACT(DAY FROM v_today) >= EXTRACT(DAY FROM p_commencement_date) THEN
    v_months_elapsed := v_months_elapsed + 1;
  END IF;

  -- Cap at tenor
  v_months_due := LEAST(v_months_elapsed, p_tenor_months);

  -- Months fully paid
  -- FIX: round to 2 decimal places before floor to prevent precision drift
  IF p_monthly_emi > 0 THEN
    v_months_paid := FLOOR(ROUND(p_total_paid / p_monthly_emi, 2))::integer;
  ELSE
    v_months_paid := 0;
  END IF;

  v_overdue := GREATEST(0, v_months_due - v_months_paid);

  RETURN v_overdue;
END;
$function$;
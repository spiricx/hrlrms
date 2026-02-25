
-- 1. Add total_expected column to beneficiaries
-- This stores the TRUE total repayment from the full amortization schedule
-- (including capitalized moratorium interest), replacing the simplified EMI × tenor formula.
ALTER TABLE public.beneficiaries
ADD COLUMN IF NOT EXISTS total_expected numeric NOT NULL DEFAULT 0;

-- 2. Replace the sync trigger function to use total_expected
CREATE OR REPLACE FUNCTION public.sync_beneficiary_from_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_beneficiary_id uuid;
  v_verified_paid numeric;
  v_total_expected numeric;
  v_new_outstanding numeric;
  v_new_status text;
  v_current_status text;
  v_monthly_emi numeric;
  v_tenor_months integer;
BEGIN
  -- Determine which beneficiary to sync
  IF TG_OP = 'DELETE' THEN
    v_beneficiary_id := OLD.beneficiary_id;
  ELSE
    v_beneficiary_id := NEW.beneficiary_id;
  END IF;

  -- Sum all verified transactions for this beneficiary
  SELECT COALESCE(SUM(amount), 0)
  INTO v_verified_paid
  FROM transactions
  WHERE beneficiary_id = v_beneficiary_id;

  -- Get beneficiary loan details
  SELECT total_expected, monthly_emi, tenor_months, status
  INTO v_total_expected, v_monthly_emi, v_tenor_months, v_current_status
  FROM beneficiaries
  WHERE id = v_beneficiary_id;

  -- Fallback: if total_expected not yet populated, use EMI × tenor
  IF v_total_expected IS NULL OR v_total_expected < 0.01 THEN
    v_total_expected := ROUND(v_monthly_emi * v_tenor_months, 2);
  END IF;

  -- Calculate new outstanding balance against ACTUAL total repayment target
  v_new_outstanding := GREATEST(0, ROUND(v_total_expected - v_verified_paid, 2));

  -- Determine status (use ₦0.01 tolerance for floating-point precision)
  IF v_new_outstanding < 0.01 THEN
    v_new_status := 'completed';
  ELSIF v_current_status = 'completed' THEN
    v_new_status := 'active';
  ELSE
    v_new_status := v_current_status;
  END IF;

  -- Update beneficiary record
  UPDATE beneficiaries
  SET
    total_paid = ROUND(v_verified_paid, 2),
    outstanding_balance = v_new_outstanding,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_beneficiary_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Recreate v_loan_arrears view to use stored total_expected
CREATE OR REPLACE VIEW public.v_loan_arrears AS
WITH loan_calc AS (
  SELECT
    b.id, b.name, b.employee_id, b.department, b.state, b.bank_branch,
    b.batch_id, b.loan_amount, b.tenor_months, b.interest_rate, b.monthly_emi,
    b.commencement_date, b.disbursement_date, b.termination_date,
    b.total_paid, b.outstanding_balance, b.status, b.created_by,
    -- Use stored total_expected; fallback to EMI × tenor if not yet populated
    CASE
      WHEN b.total_expected IS NOT NULL AND b.total_expected >= 0.01
      THEN ROUND(b.total_expected, 2)
      ELSE ROUND(b.monthly_emi * b.tenor_months::numeric, 2)
    END AS total_expected,
    CASE
      WHEN CURRENT_DATE < b.commencement_date THEN 0
      ELSE LEAST(
        b.tenor_months,
        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM b.commencement_date)) * 12 +
         (EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM b.commencement_date)))::integer +
        CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) >= EXTRACT(DAY FROM b.commencement_date) THEN 1 ELSE 0 END
      )
    END AS months_due,
    CASE
      WHEN b.monthly_emi > 0 THEN FLOOR(ROUND(b.total_paid / b.monthly_emi, 2))::integer
      ELSE 0
    END AS months_paid
  FROM beneficiaries b
),
arrears_calc AS (
  SELECT lc.*,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN 0
      ELSE GREATEST(0, lc.months_due - lc.months_paid)
    END AS overdue_months,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN 0::numeric
      ELSE GREATEST(0::numeric, ROUND(lc.months_due::numeric * lc.monthly_emi - lc.total_paid, 2))
    END AS overdue_amount,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN NULL::date
      WHEN lc.months_due > lc.months_paid AND lc.monthly_emi > 0
        THEN (lc.commencement_date + lc.months_paid::double precision * '1 mon'::interval)::date
      ELSE NULL::date
    END AS first_unpaid_due_date
  FROM loan_calc lc
),
dpd_calc AS (
  SELECT ac.*,
    CASE
      WHEN ac.status = 'completed' OR ac.outstanding_balance < 0.01 THEN 0
      WHEN ac.first_unpaid_due_date IS NULL THEN 0
      WHEN CURRENT_DATE > ac.first_unpaid_due_date THEN CURRENT_DATE - ac.first_unpaid_due_date
      ELSE 0
    END AS days_past_due
  FROM arrears_calc ac
)
SELECT
  dc.id, dc.name, dc.employee_id, dc.department, dc.state, dc.bank_branch,
  dc.batch_id, dc.loan_amount, dc.tenor_months, dc.interest_rate, dc.monthly_emi,
  dc.commencement_date, dc.disbursement_date, dc.termination_date,
  dc.total_paid, dc.outstanding_balance, dc.status, dc.created_by,
  dc.total_expected, dc.months_due, dc.months_paid,
  dc.overdue_months,
  ROUND(dc.overdue_amount, 2) AS overdue_amount,
  dc.first_unpaid_due_date,
  dc.days_past_due,
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30 THEN GREATEST(0, dc.overdue_months - 1)
    ELSE 0
  END AS arrears_months,
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30
      THEN ROUND(GREATEST(0, dc.overdue_months - 1)::numeric * dc.monthly_emi, 2)
    ELSE 0::numeric
  END AS arrears_amount,
  CASE
    WHEN dc.days_past_due = 0 THEN 'Current'
    WHEN dc.days_past_due <= 30 THEN '1-30 DPD'
    WHEN dc.days_past_due <= 60 THEN '31-60 DPD'
    WHEN dc.days_past_due <= 90 THEN '61-90 DPD'
    ELSE '90+ DPD'
  END AS dpd_bucket,
  CASE
    WHEN dc.status = 'completed' OR dc.outstanding_balance < 0.01 THEN false
    WHEN dc.days_past_due >= 90 THEN true
    ELSE false
  END AS is_npl,
  CASE
    WHEN dc.status = 'completed' OR dc.outstanding_balance < 0.01 THEN 'completed'
    WHEN dc.days_past_due >= 90 THEN 'npl'
    WHEN dc.days_past_due > 0 THEN 'delinquent'
    ELSE 'performing'
  END AS loan_health,
  COALESCE(tx.verified_total_paid, 0::numeric) AS verified_total_paid,
  CASE
    WHEN ABS(dc.total_paid - COALESCE(tx.verified_total_paid, 0::numeric)) > 0.01 THEN true
    ELSE false
  END AS has_payment_discrepancy
FROM dpd_calc dc
LEFT JOIN (
  SELECT beneficiary_id, SUM(amount) AS verified_total_paid
  FROM transactions
  GROUP BY beneficiary_id
) tx ON tx.beneficiary_id = dc.id;


-- Fix v_loan_arrears: use end-of-month due dates instead of 1st-of-month
-- This corrects DPD, months_due, first_unpaid_due_date, and all downstream metrics

CREATE OR REPLACE VIEW public.v_loan_arrears AS
WITH loan_calc AS (
  SELECT
    b.id, b.name, b.employee_id, b.department, b.state, b.bank_branch,
    b.batch_id, b.loan_amount, b.tenor_months, b.interest_rate, b.monthly_emi,
    b.commencement_date, b.disbursement_date, b.termination_date,
    b.total_paid, b.outstanding_balance, b.status, b.created_by,
    CASE
      WHEN b.total_expected IS NOT NULL AND b.total_expected >= 0.01
        THEN round(b.total_expected, 2)
      ELSE round(b.monthly_emi * b.tenor_months::numeric, 2)
    END AS total_expected,
    -- FIX: months_due now uses end-of-month due dates.
    -- Due date of month i = last day of (commencement + (i-1) months)
    --                      = (commencement + i months - 1 day)
    -- Month i is due when today >= (commencement + i months - 1 day)
    -- i.e. today + 1 day >= commencement + i months
    -- So months_due = integer month diff between commencement and (today + 1 day)
    CASE
      WHEN CURRENT_DATE < b.commencement_date THEN 0
      ELSE LEAST(
        b.tenor_months,
        GREATEST(0,
          ((EXTRACT(YEAR FROM (CURRENT_DATE + 1)) - EXTRACT(YEAR FROM b.commencement_date)) * 12 +
           (EXTRACT(MONTH FROM (CURRENT_DATE + 1)) - EXTRACT(MONTH FROM b.commencement_date)))::integer
        )
      )
    END AS months_due,
    CASE
      WHEN b.monthly_emi > 0 THEN floor(round(b.total_paid / b.monthly_emi, 2))::integer
      ELSE 0
    END AS months_paid
  FROM beneficiaries b
),
arrears_calc AS (
  SELECT
    lc.*,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN 0
      ELSE GREATEST(0, lc.months_due - lc.months_paid)
    END AS overdue_months,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN 0::numeric
      ELSE GREATEST(0::numeric, round(lc.months_due::numeric * lc.monthly_emi - lc.total_paid, 2))
    END AS overdue_amount,
    -- FIX: first_unpaid_due_date = last day of the month of the first unpaid instalment
    -- = (commencement + (months_paid + 1) months - 1 day)
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN NULL::date
      WHEN lc.months_due > lc.months_paid AND lc.monthly_emi > 0 THEN
        (lc.commencement_date + (lc.months_paid + 1) * interval '1 month' - interval '1 day')::date
      ELSE NULL::date
    END AS first_unpaid_due_date
  FROM loan_calc lc
),
dpd_calc AS (
  SELECT
    ac.*,
    CASE
      WHEN ac.status = 'completed' OR ac.outstanding_balance < 0.01 THEN 0
      WHEN ac.first_unpaid_due_date IS NULL THEN 0
      WHEN CURRENT_DATE > ac.first_unpaid_due_date THEN (CURRENT_DATE - ac.first_unpaid_due_date)
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
  round(dc.overdue_amount, 2) AS overdue_amount,
  dc.first_unpaid_due_date,
  dc.days_past_due,
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30 THEN GREATEST(0, dc.overdue_months - 1)
    ELSE 0
  END AS arrears_months,
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30 THEN round(GREATEST(0, dc.overdue_months - 1)::numeric * dc.monthly_emi, 2)
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
    WHEN abs(dc.total_paid - COALESCE(tx.verified_total_paid, 0::numeric)) > 0.01 THEN true
    ELSE false
  END AS has_payment_discrepancy
FROM dpd_calc dc
LEFT JOIN (
  SELECT beneficiary_id, sum(amount) AS verified_total_paid
  FROM transactions
  GROUP BY beneficiary_id
) tx ON tx.beneficiary_id = dc.id;

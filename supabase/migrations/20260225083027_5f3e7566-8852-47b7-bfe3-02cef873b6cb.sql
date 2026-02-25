
-- ============================================================
-- FIX: v_loan_arrears Golden Record view
-- 
-- Bug 1: floor(total_paid/emi) loses precision → use round() first
-- Bug 2: DPD has +1 off-by-one error → remove it
-- Bug 3: Near-zero balance not treated as completed → add 0.01 tolerance
-- ============================================================

CREATE OR REPLACE VIEW public.v_loan_arrears AS
WITH loan_calc AS (
  SELECT
    b.id, b.name, b.employee_id, b.department, b.state, b.bank_branch,
    b.batch_id, b.loan_amount, b.tenor_months, b.interest_rate, b.monthly_emi,
    b.commencement_date, b.disbursement_date, b.termination_date,
    b.total_paid, b.outstanding_balance, b.status, b.created_by,
    round(b.monthly_emi * b.tenor_months, 2) AS total_expected,
    -- FIX months_due: unchanged logic
    CASE
      WHEN CURRENT_DATE < b.commencement_date THEN 0
      ELSE LEAST(
        b.tenor_months,
        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM b.commencement_date)) * 12
         + (EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM b.commencement_date)))::integer
        + CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) >= EXTRACT(DAY FROM b.commencement_date) THEN 1 ELSE 0 END
      )
    END AS months_due,
    -- FIX months_paid: round before floor to prevent floating-point truncation
    CASE
      WHEN b.monthly_emi > 0 THEN floor(round(b.total_paid / b.monthly_emi, 2))::integer
      ELSE 0
    END AS months_paid
  FROM beneficiaries b
),
arrears_calc AS (
  SELECT
    lc.*,
    -- FIX: treat near-zero outstanding as completed
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN 0
      ELSE GREATEST(0, lc.months_due - lc.months_paid)
    END AS overdue_months,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN 0
      ELSE GREATEST(0, round(lc.months_due::numeric * lc.monthly_emi - lc.total_paid, 2))
    END AS overdue_amount,
    CASE
      WHEN lc.status = 'completed' OR lc.outstanding_balance < 0.01 THEN NULL
      WHEN lc.months_due > lc.months_paid AND lc.monthly_emi > 0
        THEN (lc.commencement_date + (lc.months_paid * INTERVAL '1 month'))::date
      ELSE NULL
    END AS first_unpaid_due_date
  FROM loan_calc lc
),
dpd_calc AS (
  SELECT
    ac.*,
    -- FIX DPD: remove the +1 off-by-one. DPD=0 on due date, 1 the next day.
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
  -- Arrears: overdue months minus the current-month grace, only when DPD >= 30
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30 THEN GREATEST(0, dc.overdue_months - 1)
    ELSE 0
  END AS arrears_months,
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30 THEN round(GREATEST(0, dc.overdue_months - 1)::numeric * dc.monthly_emi, 2)
    ELSE 0
  END AS arrears_amount,
  -- DPD bucket
  CASE
    WHEN dc.days_past_due = 0 THEN 'Current'
    WHEN dc.days_past_due <= 30 THEN '1-30 DPD'
    WHEN dc.days_past_due <= 60 THEN '31-60 DPD'
    WHEN dc.days_past_due <= 90 THEN '61-90 DPD'
    ELSE '90+ DPD'
  END AS dpd_bucket,
  -- NPL flag
  CASE
    WHEN dc.status = 'completed' OR dc.outstanding_balance < 0.01 THEN false
    WHEN dc.days_past_due >= 90 THEN true
    ELSE false
  END AS is_npl,
  -- Loan health
  CASE
    WHEN dc.status = 'completed' OR dc.outstanding_balance < 0.01 THEN 'completed'
    WHEN dc.days_past_due >= 90 THEN 'npl'
    WHEN dc.days_past_due > 0 THEN 'delinquent'
    ELSE 'performing'
  END AS loan_health,
  -- Verified total paid from transactions
  COALESCE(tx.verified_total_paid, 0) AS verified_total_paid,
  CASE
    WHEN abs(dc.total_paid - COALESCE(tx.verified_total_paid, 0)) > 0.01 THEN true
    ELSE false
  END AS has_payment_discrepancy
FROM dpd_calc dc
LEFT JOIN (
  SELECT beneficiary_id, sum(amount) AS verified_total_paid
  FROM transactions
  GROUP BY beneficiary_id
) tx ON tx.beneficiary_id = dc.id;

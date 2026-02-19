
-- =========================================================
-- 1. Create the authoritative v_loan_arrears view
--    Single source of truth for arrears, DPD, NPL status
-- =========================================================
CREATE OR REPLACE VIEW public.v_loan_arrears AS
WITH loan_calc AS (
  SELECT
    b.id,
    b.name,
    b.employee_id,
    b.department,
    b.state,
    b.bank_branch,
    b.batch_id,
    b.loan_amount,
    b.tenor_months,
    b.interest_rate,
    b.monthly_emi,
    b.commencement_date,
    b.disbursement_date,
    b.termination_date,
    b.total_paid,
    b.outstanding_balance,
    b.status,
    b.created_by,
    -- Total expected repayment (EMI × tenor)
    (b.monthly_emi * b.tenor_months) AS total_expected,
    -- Months elapsed since commencement (inclusive: on commencement day = 1 month due)
    CASE
      WHEN CURRENT_DATE < b.commencement_date THEN 0
      ELSE LEAST(
        b.tenor_months,
        (
          (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM b.commencement_date)) * 12 +
          (EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM b.commencement_date))
        )::integer +
        CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) >= EXTRACT(DAY FROM b.commencement_date) THEN 1 ELSE 0 END
      )
    END AS months_due,
    -- Months fully paid
    CASE WHEN b.monthly_emi > 0 THEN FLOOR(b.total_paid / b.monthly_emi)::integer ELSE 0 END AS months_paid
  FROM public.beneficiaries b
),
arrears_calc AS (
  SELECT
    lc.*,
    -- Overdue months = months due but not paid
    GREATEST(0, lc.months_due - lc.months_paid) AS overdue_months,
    -- Overdue amount
    GREATEST(0, (lc.months_due * lc.monthly_emi) - lc.total_paid) AS overdue_amount,
    -- First unpaid installment date (0-indexed from commencement)
    CASE
      WHEN lc.months_due > lc.months_paid AND lc.monthly_emi > 0
      THEN (lc.commencement_date + ((lc.months_paid) * INTERVAL '1 month'))::date
      ELSE NULL
    END AS first_unpaid_due_date
  FROM loan_calc lc
),
dpd_calc AS (
  SELECT
    ac.*,
    -- Days Past Due (inclusive: on due date = 1 DPD)
    CASE
      WHEN ac.status = 'completed' OR ac.outstanding_balance <= 0 THEN 0
      WHEN ac.first_unpaid_due_date IS NULL THEN 0
      WHEN CURRENT_DATE >= ac.first_unpaid_due_date
      THEN (CURRENT_DATE - ac.first_unpaid_due_date) + 1
      ELSE 0
    END AS days_past_due
  FROM arrears_calc ac
)
SELECT
  dc.id,
  dc.name,
  dc.employee_id,
  dc.department,
  dc.state,
  dc.bank_branch,
  dc.batch_id,
  dc.loan_amount,
  dc.tenor_months,
  dc.interest_rate,
  dc.monthly_emi,
  dc.commencement_date,
  dc.disbursement_date,
  dc.termination_date,
  dc.total_paid,
  dc.outstanding_balance,
  dc.status,
  dc.created_by,
  dc.total_expected,
  dc.months_due,
  dc.months_paid,
  dc.overdue_months,
  ROUND(dc.overdue_amount, 2) AS overdue_amount,
  dc.first_unpaid_due_date,
  dc.days_past_due,
  -- Arrears months: overdue instalments where next period has also arrived
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30
    THEN GREATEST(0, dc.overdue_months - 1)
    ELSE 0
  END AS arrears_months,
  -- Arrears amount
  CASE
    WHEN dc.overdue_months > 0 AND dc.days_past_due >= 30
    THEN ROUND(GREATEST(0, (dc.overdue_months - 1)) * dc.monthly_emi, 2)
    ELSE 0
  END AS arrears_amount,
  -- DPD bucket
  CASE
    WHEN dc.days_past_due = 0 THEN 'Current'
    WHEN dc.days_past_due BETWEEN 1 AND 30 THEN '1-30 DPD'
    WHEN dc.days_past_due BETWEEN 31 AND 60 THEN '31-60 DPD'
    WHEN dc.days_past_due BETWEEN 61 AND 90 THEN '61-90 DPD'
    WHEN dc.days_past_due > 90 THEN '90+ DPD'
    ELSE 'Current'
  END AS dpd_bucket,
  -- NPL status (90+ DPD)
  CASE
    WHEN dc.status = 'completed' OR dc.outstanding_balance <= 0 THEN false
    WHEN dc.days_past_due >= 90 THEN true
    ELSE false
  END AS is_npl,
  -- Loan health classification
  CASE
    WHEN dc.status = 'completed' OR dc.outstanding_balance <= 0 THEN 'completed'
    WHEN dc.days_past_due >= 90 THEN 'npl'
    WHEN dc.days_past_due > 0 THEN 'delinquent'
    ELSE 'performing'
  END AS loan_health,
  -- Transaction-verified total paid (cross-check)
  COALESCE(tx.verified_total_paid, 0) AS verified_total_paid,
  -- Discrepancy flag
  CASE
    WHEN ABS(dc.total_paid - COALESCE(tx.verified_total_paid, 0)) > 0.01 THEN true
    ELSE false
  END AS has_payment_discrepancy
FROM dpd_calc dc
LEFT JOIN (
  SELECT beneficiary_id, SUM(amount) AS verified_total_paid
  FROM public.transactions
  GROUP BY beneficiary_id
) tx ON tx.beneficiary_id = dc.id;

-- =========================================================
-- 2. Create integrity_checks table for audit trail
-- =========================================================
CREATE TABLE IF NOT EXISTS public.integrity_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  check_type text NOT NULL DEFAULT 'daily_reconciliation',
  total_loans integer NOT NULL DEFAULT 0,
  loans_with_discrepancies integer NOT NULL DEFAULT 0,
  total_portfolio_balance numeric NOT NULL DEFAULT 0,
  verified_portfolio_balance numeric NOT NULL DEFAULT 0,
  balance_variance numeric NOT NULL DEFAULT 0,
  total_paid_system numeric NOT NULL DEFAULT 0,
  total_paid_transactions numeric NOT NULL DEFAULT 0,
  payment_variance numeric NOT NULL DEFAULT 0,
  npl_count integer NOT NULL DEFAULT 0,
  npl_ratio numeric NOT NULL DEFAULT 0,
  par_30_count integer NOT NULL DEFAULT 0,
  par_90_count integer NOT NULL DEFAULT 0,
  discrepancy_details jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'clean',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integrity_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to integrity checks"
  ON public.integrity_checks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view integrity checks"
  ON public.integrity_checks FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role));

-- =========================================================
-- 3. Grant access to the view (inherits beneficiaries RLS)
-- =========================================================
GRANT SELECT ON public.v_loan_arrears TO authenticated;
GRANT SELECT ON public.v_loan_arrears TO anon;

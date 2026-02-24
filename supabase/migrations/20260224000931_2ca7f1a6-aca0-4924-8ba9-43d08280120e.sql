
-- Function: recalculate beneficiary financials from transactions
CREATE OR REPLACE FUNCTION public.sync_beneficiary_from_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_beneficiary_id uuid;
  v_verified_paid numeric;
  v_loan_amount numeric;
  v_tenor_months integer;
  v_monthly_emi numeric;
  v_total_expected numeric;
  v_new_outstanding numeric;
  v_new_status text;
  v_current_status text;
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
  SELECT loan_amount, tenor_months, monthly_emi, status
  INTO v_loan_amount, v_tenor_months, v_monthly_emi, v_current_status
  FROM beneficiaries
  WHERE id = v_beneficiary_id;

  -- Calculate total expected (EMI * tenor)
  v_total_expected := ROUND(v_monthly_emi * v_tenor_months, 2);

  -- Calculate new outstanding balance
  v_new_outstanding := GREATEST(0, ROUND(v_total_expected - v_verified_paid, 2));

  -- Determine status
  IF v_new_outstanding <= 0 THEN
    v_new_status := 'completed';
  ELSIF v_current_status = 'completed' THEN
    -- If was completed but now has balance (e.g. transaction deleted), revert to active
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

-- Create trigger on transactions table
DROP TRIGGER IF EXISTS trg_sync_beneficiary_on_transaction ON transactions;
CREATE TRIGGER trg_sync_beneficiary_on_transaction
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION sync_beneficiary_from_transactions();

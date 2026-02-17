
-- Function to calculate default_count for a single beneficiary
CREATE OR REPLACE FUNCTION public.calculate_default_count(
  p_commencement_date date,
  p_tenor_months integer,
  p_monthly_emi numeric,
  p_total_paid numeric,
  p_outstanding_balance numeric,
  p_status text
) RETURNS integer AS $$
DECLARE
  v_today date;
  v_months_elapsed integer;
  v_months_due integer;
  v_months_paid integer;
  v_overdue integer;
BEGIN
  v_today := CURRENT_DATE;

  -- Completed loans have 0 defaults
  IF p_status = 'completed' OR p_outstanding_balance <= 0 THEN
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
  IF p_monthly_emi > 0 THEN
    v_months_paid := FLOOR(p_total_paid / p_monthly_emi)::integer;
  ELSE
    v_months_paid := 0;
  END IF;

  v_overdue := GREATEST(0, v_months_due - v_months_paid);

  RETURN v_overdue;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Function to update default_count on a beneficiary row
CREATE OR REPLACE FUNCTION public.update_beneficiary_default_count()
RETURNS TRIGGER AS $$
DECLARE
  v_ben RECORD;
  v_new_default_count integer;
BEGIN
  -- Determine which beneficiary to update
  IF TG_TABLE_NAME = 'beneficiaries' THEN
    -- Direct update on beneficiaries table
    v_new_default_count := calculate_default_count(
      NEW.commencement_date,
      NEW.tenor_months,
      NEW.monthly_emi,
      NEW.total_paid,
      NEW.outstanding_balance,
      NEW.status
    );
    NEW.default_count := v_new_default_count;
    RETURN NEW;
  END IF;

  -- If triggered from transactions table
  IF TG_TABLE_NAME = 'transactions' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT * INTO v_ben FROM beneficiaries WHERE id = OLD.beneficiary_id;
    ELSE
      SELECT * INTO v_ben FROM beneficiaries WHERE id = NEW.beneficiary_id;
    END IF;

    IF v_ben.id IS NOT NULL THEN
      v_new_default_count := calculate_default_count(
        v_ben.commencement_date,
        v_ben.tenor_months,
        v_ben.monthly_emi,
        v_ben.total_paid,
        v_ben.outstanding_balance,
        v_ben.status
      );

      UPDATE beneficiaries
        SET default_count = v_new_default_count
        WHERE id = v_ben.id AND default_count IS DISTINCT FROM v_new_default_count;
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on beneficiaries: recalculate default_count before insert/update
CREATE TRIGGER trg_beneficiary_default_count
  BEFORE INSERT OR UPDATE OF total_paid, outstanding_balance, status, commencement_date, tenor_months, monthly_emi
  ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beneficiary_default_count();

-- Trigger on transactions: recalculate after transaction changes
CREATE TRIGGER trg_transaction_default_count
  AFTER INSERT OR UPDATE OR DELETE
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beneficiary_default_count();

-- BACKFILL: Update all existing beneficiaries with accurate default_count
UPDATE public.beneficiaries
SET default_count = calculate_default_count(
  commencement_date,
  tenor_months,
  monthly_emi,
  total_paid,
  outstanding_balance,
  status
);

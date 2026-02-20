import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ArrearsRow = Tables<'v_loan_arrears'>;

export interface ArrearsLookup {
  /** Map from beneficiary ID to v_loan_arrears row */
  map: Map<string, ArrearsRow>;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Shared hook that fetches authoritative arrears/delinquency metrics from
 * the v_loan_arrears database view (the "Golden Record").
 *
 * All modules MUST use this instead of the client-side getOverdueAndArrears()
 * to ensure consistent financial data across the entire application.
 */
export function useArrearsLookup(): ArrearsLookup {
  const [map, setMap] = useState<Map<string, ArrearsRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const { data } = await supabase
      .from('v_loan_arrears')
      .select('*');

    const m = new Map<string, ArrearsRow>();
    (data || []).forEach((row) => {
      if (row.id) m.set(row.id, row);
    });
    setMap(m);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { map, loading, refresh: fetchData };
}

/** Helper to safely get arrears data for a beneficiary, with zero defaults */
export function getArrearsFromMap(map: Map<string, ArrearsRow>, id: string) {
  const row = map.get(id);
  return {
    arrearsAmount: Number(row?.arrears_amount ?? 0),
    arrearsMonths: Number(row?.arrears_months ?? 0),
    overdueAmount: Number(row?.overdue_amount ?? 0),
    overdueMonths: Number(row?.overdue_months ?? 0),
    daysOverdue: Number(row?.days_past_due ?? 0),
    monthsPaid: Number(row?.months_paid ?? 0),
    monthsDue: Number(row?.months_due ?? 0),
    isNpl: row?.is_npl ?? false,
    loanHealth: row?.loan_health ?? 'performing',
    dpdBucket: row?.dpd_bucket ?? 'current',
    hasPaymentDiscrepancy: row?.has_payment_discrepancy ?? false,
    verifiedTotalPaid: Number(row?.verified_total_paid ?? 0),
    firstUnpaidDueDate: row?.first_unpaid_due_date ?? null,
  };
}

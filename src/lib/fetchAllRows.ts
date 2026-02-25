import { supabase } from '@/integrations/supabase/client';

interface FetchAllRowsOptions {
  orderBy?: string;
  ascending?: boolean;
  chunkSize?: number;
}

/**
 * Fetches all rows from a table/view using range pagination to avoid the
 * default 1000-row query cap.
 */
export async function fetchAllRows<T>(
  tableOrView: string,
  selectQuery = '*',
  options: FetchAllRowsOptions = {}
): Promise<T[]> {
  const { orderBy, ascending = true, chunkSize = 1000 } = options;

  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(tableOrView as any)
      .select(selectQuery)
      .range(from, from + chunkSize - 1);

    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = (data as T[]) || [];
    rows.push(...page);

    if (page.length < chunkSize) break;
    from += chunkSize;
  }

  return rows;
}

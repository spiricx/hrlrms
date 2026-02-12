import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Filter, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/loanCalculations';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

interface BeneficiaryWithPayment extends Beneficiary {
  lastTransaction?: Transaction | null;
}

function formatTenor(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} Year${years !== 1 ? 's' : ''}`;
  if (years === 0) return `${rem} Month${rem !== 1 ? 's' : ''}`;
  return `${years}Y ${rem}M`;
}

function formatPaymentDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

function getDaysPastDue(b: Beneficiary): number {
  if (b.status === 'completed' || Number(b.outstanding_balance) <= 0) return -1;

  const now = new Date();
  const commencement = new Date(b.commencement_date);

  // Calculate how many months should have been paid by now
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - commencement.getFullYear()) * 12 +
      (now.getMonth() - commencement.getMonth())
  );

  if (monthsElapsed === 0) return -2; // Not yet due

  const expectedPaid = monthsElapsed * Number(b.monthly_emi);
  const actualPaid = Number(b.total_paid);
  const deficit = expectedPaid - actualPaid;

  if (deficit <= 0) return 0; // Current

  // Estimate DPD based on how many months behind
  const monthsBehind = Math.ceil(deficit / Number(b.monthly_emi));
  return monthsBehind * 30;
}

type StatusInfo = {
  label: string;
  className: string;
};

function getStatusInfo(b: Beneficiary): StatusInfo {
  const dpd = getDaysPastDue(b);

  if (Number(b.outstanding_balance) <= 0 || b.status === 'completed') {
    return {
      label: 'Fully Repaid',
      className: 'bg-primary/10 text-primary border-primary/20',
    };
  }
  if (dpd === -2) {
    return {
      label: 'Active',
      className: 'bg-muted text-muted-foreground border-border',
    };
  }
  if (dpd === 0) {
    return {
      label: 'Current',
      className: 'bg-success/10 text-success border-success/20',
    };
  }
  if (dpd >= 90) {
    return {
      label: `NPL / ${dpd} Days`,
      className: 'bg-destructive/10 text-destructive border-destructive/20',
    };
  }
  return {
    label: `${dpd} Days Past Due`,
    className: 'bg-warning/10 text-warning border-warning/20',
  };
}

function getArrearsAmount(b: Beneficiary): number {
  const dpd = getDaysPastDue(b);
  if (dpd <= 0) return 0;
  const monthsBehind = Math.ceil(dpd / 30);
  return monthsBehind * Number(b.monthly_emi);
}

type FilterType = 'all' | 'current' | 'arrears' | 'npl' | 'repaid';

export default function RecentBeneficiariesWidget() {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchData = async () => {
    const { data: bens } = await supabase
      .from('beneficiaries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!bens) {
      setLoading(false);
      return;
    }

    // Fetch latest transaction for each beneficiary
    const benIds = bens.map((b) => b.id);
    const { data: txns } = await supabase
      .from('transactions')
      .select('*')
      .in('beneficiary_id', benIds)
      .order('date_paid', { ascending: false });

    const latestTxMap = new Map<string, Transaction>();
    txns?.forEach((t) => {
      if (!latestTxMap.has(t.beneficiary_id)) {
        latestTxMap.set(t.beneficiary_id, t);
      }
    });

    const enriched: BeneficiaryWithPayment[] = bens.map((b) => ({
      ...b,
      lastTransaction: latestTxMap.get(b.id) ?? null,
    }));

    setBeneficiaries(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let list = beneficiaries;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.employee_id.toLowerCase().includes(q)
      );
    }

    if (filter !== 'all') {
      list = list.filter((b) => {
        const dpd = getDaysPastDue(b);
        switch (filter) {
          case 'current':
            return dpd === 0;
          case 'arrears':
            return dpd > 0 && dpd < 90;
          case 'npl':
            return dpd >= 90;
          case 'repaid':
            return Number(b.outstanding_balance) <= 0 || b.status === 'completed';
          default:
            return true;
        }
      });
    }

    return list;
  }, [beneficiaries, search, filter]);

  const getLastPaymentDisplay = (b: BeneficiaryWithPayment): string => {
    if (Number(b.outstanding_balance) <= 0 && b.lastTransaction) {
      return `Fully Repaid on ${formatPaymentDate(b.lastTransaction.date_paid)}`;
    }
    if (!b.lastTransaction) return 'No payment recorded';
    return `${formatPaymentDate(b.lastTransaction.date_paid)} (${formatCurrency(Number(b.lastTransaction.amount))})`;
  };

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6 py-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold font-display">Recent Beneficiaries</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Link to="/beneficiaries">
            <Button variant="outline" size="sm" className="gap-1.5">
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-6 py-3 border-b border-border sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or loan ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <SelectTrigger className="w-full sm:w-[160px] h-9">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="current">Current</SelectItem>
            <SelectItem value="arrears">In Arrears</SelectItem>
            <SelectItem value="npl">NPL</SelectItem>
            <SelectItem value="repaid">Fully Repaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Beneficiary
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Loan Ref
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tenor
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Loan Amount
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Outstanding
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Arrears
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Last Payment
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                  <div className="animate-pulse">Loading recent beneficiaries...</div>
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                  No beneficiaries found.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((b, idx) => {
                const statusInfo = getStatusInfo(b);
                const arrears = getArrearsAmount(b);
                return (
                  <tr
                    key={b.id}
                    className="hover:bg-secondary/30 transition-colors group"
                  >
                    <td className="px-6 py-3 text-muted-foreground text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        to={`/beneficiaries/${b.id}`}
                        className="flex items-center gap-2.5 group-hover:underline"
                      >
                        <Avatar className="h-7 w-7 text-[10px]">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {b.name
                              .split(' ')
                              .map((w) => w[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium whitespace-nowrap">{b.name}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        to={`/beneficiaries/${b.id}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        {b.employee_id}
                      </Link>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-muted-foreground">
                      {formatTenor(b.tenor_months)}
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {formatCurrency(Number(b.loan_amount))}
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {formatCurrency(Number(b.outstanding_balance))}
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {arrears > 0 ? (
                        <span className="text-destructive font-medium">
                          {formatCurrency(arrears)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">₦0</span>
                      )}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {getLastPaymentDisplay(b)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap',
                          statusInfo.className
                        )}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

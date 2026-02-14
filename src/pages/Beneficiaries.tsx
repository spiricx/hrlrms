import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle } from 'lucide-react';
import { formatCurrency, formatTenor } from '@/lib/loanCalculations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

interface BeneficiaryWithPayment extends Beneficiary {
  lastTransaction?: Transaction | null;
}


function getDaysPastDue(b: Beneficiary): number {
  if (b.status === 'completed' || Number(b.outstanding_balance) <= 0) return -1;
  const now = new Date();
  const commencement = new Date(b.commencement_date);
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - commencement.getFullYear()) * 12 +
      (now.getMonth() - commencement.getMonth())
  );
  if (monthsElapsed === 0) return -2;
  const expectedPaid = monthsElapsed * Number(b.monthly_emi);
  const actualPaid = Number(b.total_paid);
  const deficit = expectedPaid - actualPaid;
  if (deficit <= 0) return 0;
  const monthsBehind = Math.ceil(deficit / Number(b.monthly_emi));
  return monthsBehind * 30;
}

function getMonthsInArrears(b: Beneficiary): number {
  const dpd = getDaysPastDue(b);
  if (dpd <= 0) return 0;
  return Math.ceil(dpd / 30);
}

function getArrearsAmount(b: Beneficiary): number {
  const months = getMonthsInArrears(b);
  return months * Number(b.monthly_emi);
}

type StatusInfo = { label: string; className: string };

function getStatusInfo(b: Beneficiary): StatusInfo {
  const dpd = getDaysPastDue(b);
  if (Number(b.outstanding_balance) <= 0 || b.status === 'completed') {
    return { label: 'Fully Repaid', className: 'bg-primary/10 text-primary border-primary/20' };
  }
  if (dpd === -2) {
    return { label: 'Active', className: 'bg-muted text-muted-foreground border-border' };
  }
  if (dpd === 0) {
    return { label: 'Current', className: 'bg-success/10 text-success border-success/20' };
  }
  if (dpd >= 90) {
    return { label: `NPL / ${dpd} Days`, className: 'bg-destructive/10 text-destructive border-destructive/20' };
  }
  return { label: `${dpd} Days Past Due`, className: 'bg-warning/10 text-warning border-warning/20' };
}

function formatPaymentDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export default function Beneficiaries() {
  const { hasRole } = useAuth();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = hasRole('admin');

  const fetchData = useCallback(async () => {
    const { data: bens, error } = await supabase
      .from('beneficiaries')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && bens) {
      const benIds = bens.map((b) => b.id);
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .in('beneficiary_id', benIds)
        .order('date_paid', { ascending: false });

      const latestTxMap = new Map<string, Transaction>();
      txns?.forEach((t) => {
        if (!latestTxMap.has(t.beneficiary_id)) latestTxMap.set(t.beneficiary_id, t);
      });

      setBeneficiaries(bens.map((b) => ({ ...b, lastTransaction: latestTxMap.get(b.id) ?? null })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('beneficiaries-list').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'beneficiaries'
    }, () => {
      fetchData();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const filtered = useMemo(() => {
    return beneficiaries.filter(b => {
      const q = search.toLowerCase();
      const matchesSearch = b.name.toLowerCase().includes(q) || b.employee_id.toLowerCase().includes(q) || (b.nhf_number && b.nhf_number.toLowerCase().includes(q));
      const matchesState = stateFilter === 'all' || b.state === stateFilter;
      return matchesSearch && matchesState;
    });
  }, [beneficiaries, search, stateFilter]);

  if (loading) {
    return <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading beneficiaries...</div>
      </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display">Beneficiaries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage loan beneficiaries and track repayments</p>
        </div>
        <Link to="/add-beneficiary">
          <Button className="gradient-accent text-accent-foreground border-0 font-semibold gap-2">
            <PlusCircle className="w-4 h-4" />
            New Loan
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, loan ref, or NHF number..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        {isAdmin && (
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Repayment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Repayment Amt</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arrears</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Months in Arrears</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b, idx) => {
                const statusInfo = getStatusInfo(b);
                const arrears = getArrearsAmount(b);
                const monthsArr = getMonthsInArrears(b);
                const lastPayment = b.lastTransaction
                  ? formatPaymentDate(b.lastTransaction.date_paid)
                  : 'No payment recorded';

                return (
                  <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <Link to={`/beneficiary/${b.id}`} className="font-medium hover:underline text-accent whitespace-nowrap">
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/beneficiary/${b.id}`} className="text-accent hover:underline font-mono text-xs">
                        {b.employee_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{b.state || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{b.bank_branch || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatTenor(b.tenor_months)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(Number(b.loan_amount))}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(Number(b.outstanding_balance))}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(Number(b.monthly_emi))}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {b.lastTransaction
                        ? formatCurrency(Number(b.lastTransaction.amount))
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {arrears > 0
                        ? <span className="text-destructive font-medium">{formatCurrency(arrears)}</span>
                        : <span className="text-muted-foreground">₦0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {monthsArr > 0
                        ? <span className="text-destructive font-semibold">{monthsArr}</span>
                        : <span className="text-success font-semibold">0</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{lastPayment}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap',
                        statusInfo.className
                      )}>
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-6 py-12 text-center text-muted-foreground">
                    No beneficiaries found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

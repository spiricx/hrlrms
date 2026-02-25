import { useEffect, useState, useMemo } from 'react';
import { Wallet, Users, AlertTriangle, CheckCircle2, TrendingUp, Banknote, Filter, ShieldAlert } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import StatCard from '@/components/StatCard';
import { formatCurrency } from '@/lib/loanCalculations';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import RecentBeneficiariesWidget from '@/components/dashboard/RecentBeneficiariesWidget';
import { fetchAllRows } from '@/lib/fetchAllRows';

type Beneficiary = Tables<'beneficiaries'>;
type LoanArrears = Tables<'v_loan_arrears'>;
export type LoanHealthFilter = 'all' | 'active' | 'defaulted';

export default function Dashboard() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loanArrears, setLoanArrears] = useState<LoanArrears[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthFilter, setHealthFilter] = useState<LoanHealthFilter>('all');

  useEffect(() => {
    const fetchData = async () => {
      const [beneficiaryRows, arrearsRows] = await Promise.all([
        fetchAllRows<Beneficiary>('beneficiaries', '*', { orderBy: 'created_at', ascending: false }),
        fetchAllRows<LoanArrears>('v_loan_arrears'),
      ]);
      setBeneficiaries(beneficiaryRows);
      setLoanArrears(arrearsRows);
      setLoading(false);
    };
    fetchData();

    const channel = supabase.
    channel('dashboard-beneficiaries').
    on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'beneficiaries' },
      () => {fetchData();}
    ).
    subscribe();

    return () => {supabase.removeChannel(channel);};
  }, []);

  const totalDisbursed = beneficiaries.reduce((s, b) => s + Number(b.loan_amount), 0);
  const totalOutstanding = beneficiaries.reduce((s, b) => s + Number(b.outstanding_balance), 0);
  const totalCollected = beneficiaries.reduce((s, b) => s + Number(b.total_paid), 0);

  // Compute loan health from v_loan_arrears (Golden Record) — single source of truth
  const loanMetrics = useMemo(() => {
    // Build a lookup from the authoritative view
    const arrearsMap = new Map<string, LoanArrears>();
    loanArrears.forEach(a => { if (a.id) arrearsMap.set(a.id, a); });

    let defaulted = 0;
    let completed = 0;
    let active = 0;

    beneficiaries.forEach((b) => {
      if (b.status === 'completed' || Number(b.outstanding_balance) < 0.01) {
        completed++;
        return;
      }

      const arrRow = arrearsMap.get(b.id);
      if (arrRow && arrRow.is_npl) {
        defaulted++;
      } else {
        active++;
      }
    });

    return { defaulted, completed, active };
  }, [beneficiaries, loanArrears]);

  const defaultedCount = loanMetrics.defaulted;
  const completedCount = loanMetrics.completed;
  const activeCount = loanMetrics.active;

  // NPL metrics from v_loan_arrears (single source of truth)
  const nplMetrics = useMemo(() => {
    const activeLoans = loanArrears.filter(a => a.status !== 'completed' && Number(a.outstanding_balance) > 0);
    const nplLoans = activeLoans.filter(a => a.is_npl === true);
    const totalActiveOutstanding = activeLoans.reduce((s, a) => s + Number(a.outstanding_balance || 0), 0);
    const nplOutstanding = nplLoans.reduce((s, a) => s + Number(a.outstanding_balance || 0), 0);
    const nplRatio = totalActiveOutstanding > 0 ? (nplOutstanding / totalActiveOutstanding) * 100 : 0;
    return { nplAmount: nplOutstanding, nplRatio, nplCount: nplLoans.length };
  }, [loanArrears]);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>);

  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Home Renovation Loan portfolio overview</p>
        </div>
        <ToggleGroup type="single" value={healthFilter} onValueChange={(v) => { if (v) setHealthFilter(v as LoanHealthFilter); }} className="bg-secondary/50 rounded-lg p-1">
          <ToggleGroupItem value="all" className="text-xs px-3 py-1.5 rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm">
            All ({beneficiaries.length})
          </ToggleGroupItem>
          <ToggleGroupItem value="active" className="text-xs px-3 py-1.5 rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=on]:text-success">
            Active ({loanMetrics.active})
          </ToggleGroupItem>
          <ToggleGroupItem value="defaulted" className="text-xs px-3 py-1.5 rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=on]:text-destructive">
            Defaulted ({loanMetrics.defaulted})
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total Loan Facilities"
          value={String(beneficiaries.length)}
          icon={<Users className="w-5 h-5" />}
          trend={`${activeCount} active · ${defaultedCount} defaulted`} />

        <StatCard
          label="Total Disbursed"
          value={formatCurrency(totalDisbursed)}
          icon={<Banknote className="w-5 h-5" />}
          variant="accent" />

        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(totalOutstanding)}
          icon={<Wallet className="w-5 h-5" />} />

        <StatCard
          label="Total Collected"
          value={formatCurrency(totalCollected)}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success" />

        <StatCard
          label="Defaulted Loans"
          value={String(defaultedCount)}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="destructive"
          trend={`of ${beneficiaries.length} total`} />

        <StatCard
          label="NPL Amount"
          value={formatCurrency(nplMetrics.nplAmount)}
          icon={<ShieldAlert className="w-5 h-5" />}
          variant="destructive"
          trend={`${nplMetrics.nplCount} NPL accounts`} />

      </div>

      {/* NPL Ratio card */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="bg-card rounded-xl p-5 shadow-card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-destructive/10">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{nplMetrics.nplRatio.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">NPL Ratio</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-xl p-5 shadow-card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-success/10">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{completedCount}</p>
            <p className="text-xs text-muted-foreground">Completed Loans</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Active Loans</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent/10">
            <Banknote className="w-6 h-6 text-accent" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">6%</p>
            <p className="text-xs text-muted-foreground">Annuity Rate</p>
          </div>
        </div>
      </div>

      {/* Recent Beneficiaries Widget */}
      <RecentBeneficiariesWidget healthFilter={healthFilter} />
    </div>);

}
import { useEffect, useState, useMemo } from 'react';
import { Wallet, Users, AlertTriangle, CheckCircle2, TrendingUp, Banknote, Filter } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import StatCard from '@/components/StatCard';
import { formatCurrency, getOverdueAndArrears, stripTime } from '@/lib/loanCalculations';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import RecentBeneficiariesWidget from '@/components/dashboard/RecentBeneficiariesWidget';

type Beneficiary = Tables<'beneficiaries'>;
export type LoanHealthFilter = 'all' | 'active' | 'defaulted';

export default function Dashboard() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthFilter, setHealthFilter] = useState<LoanHealthFilter>('all');

  useEffect(() => {
    const fetchBeneficiaries = async () => {
      const { data, error } = await supabase.
      from('beneficiaries').
      select('*').
      order('created_at', { ascending: false });
      if (!error && data) {
        setBeneficiaries(data);
      }
      setLoading(false);
    };
    fetchBeneficiaries();

    const channel = supabase.
    channel('dashboard-beneficiaries').
    on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'beneficiaries' },
      () => {fetchBeneficiaries();}
    ).
    subscribe();

    return () => {supabase.removeChannel(channel);};
  }, []);

  const totalDisbursed = beneficiaries.reduce((s, b) => s + Number(b.loan_amount), 0);
  const totalOutstanding = beneficiaries.reduce((s, b) => s + Number(b.outstanding_balance), 0);
  const totalCollected = beneficiaries.reduce((s, b) => s + Number(b.total_paid), 0);

  // Dynamically compute loan health based on 90+ Days Past Due
  const loanMetrics = useMemo(() => {
    let defaulted = 0;
    let completed = 0;
    let active = 0;

    beneficiaries.forEach((b) => {
      if (b.status === 'completed' || Number(b.outstanding_balance) <= 0) {
        completed++;
        return;
      }

      const comm = stripTime(new Date(b.commencement_date));
      const today = stripTime(new Date());
      const monthlyEmi = Number(b.monthly_emi);
      const totalPaid = Number(b.total_paid);

      if (monthlyEmi > 0 && today >= comm) {
        const arrears = getOverdueAndArrears(
          b.commencement_date,
          b.tenor_months,
          monthlyEmi,
          totalPaid,
          Number(b.outstanding_balance),
          b.status
        );

        if (arrears.overdueMonths > 0) {
          const paidMonths = Math.floor(totalPaid / monthlyEmi);
          const firstUnpaidMonth = paidMonths + 1;
          const firstUnpaidDate = new Date(comm);
          firstUnpaidDate.setMonth(firstUnpaidDate.getMonth() + (firstUnpaidMonth - 1));
          const dueDateStripped = stripTime(firstUnpaidDate);
          // DPD is inclusive: on the due date = 1 day past due
          const dpd = Math.max(0, Math.floor((today.getTime() - dueDateStripped.getTime()) / (1000 * 60 * 60 * 24))) + 1;

          if (dpd >= 90) {
            defaulted++;
            return;
          }
        }
      }
      active++;
    });

    return { defaulted, completed, active };
  }, [beneficiaries]);

  const defaultedCount = loanMetrics.defaulted;
  const completedCount = loanMetrics.completed;
  const activeCount = loanMetrics.active;


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
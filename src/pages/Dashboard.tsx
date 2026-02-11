import { useEffect, useState } from 'react';
import { Wallet, Users, AlertTriangle, CheckCircle2, TrendingUp, Banknote } from 'lucide-react';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { formatCurrency } from '@/lib/loanCalculations';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;

export default function Dashboard() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBeneficiaries = async () => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setBeneficiaries(data);
      }
      setLoading(false);
    };
    fetchBeneficiaries();

    const channel = supabase
      .channel('dashboard-beneficiaries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'beneficiaries' },
        () => { fetchBeneficiaries(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const totalDisbursed = beneficiaries.reduce((s, b) => s + Number(b.loan_amount), 0);
  const totalOutstanding = beneficiaries.reduce((s, b) => s + Number(b.outstanding_balance), 0);
  const totalCollected = beneficiaries.reduce((s, b) => s + Number(b.total_paid), 0);
  const defaultedCount = beneficiaries.filter((b) => b.status === 'defaulted').length;
  const completedCount = beneficiaries.filter((b) => b.status === 'completed').length;
  const activeCount = beneficiaries.filter((b) => b.status === 'active').length;
  const recentLoans = beneficiaries.slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Home Renovation Loan portfolio overview
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Disbursed"
          value={formatCurrency(totalDisbursed)}
          icon={<Banknote className="w-5 h-5" />}
          variant="accent"
        />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(totalOutstanding)}
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          label="Total Collected"
          value={formatCurrency(totalCollected)}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Defaulted Loans"
          value={String(defaultedCount)}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="destructive"
          trend={`of ${beneficiaries.length} total`}
        />
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
            <p className="text-xs text-muted-foreground">Interest Rate p.a.</p>
          </div>
        </div>
      </div>

      {/* Recent beneficiaries */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold font-display">Recent Beneficiaries</h2>
          <Link to="/beneficiaries" className="text-sm font-medium text-accent hover:underline">
            View All →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentLoans.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No beneficiaries found. Create a new loan to get started.
                  </td>
                </tr>
              )}
              {recentLoans.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4 font-medium">{b.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.employee_id}</td>
                  <td className="px-6 py-4">{formatCurrency(Number(b.loan_amount))}</td>
                  <td className="px-6 py-4">{formatCurrency(Number(b.outstanding_balance))}</td>
                  <td className="px-6 py-4"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { Wallet, Users, AlertTriangle, CheckCircle2, TrendingUp, Banknote } from 'lucide-react';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { mockBeneficiaries, portfolioStats } from '@/lib/mockData';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const recentLoans = mockBeneficiaries.slice(0, 5);

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
          value={formatCurrency(portfolioStats.totalDisbursed)}
          icon={<Banknote className="w-5 h-5" />}
          variant="accent"
        />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(portfolioStats.totalOutstanding)}
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          label="Total Collected"
          value={formatCurrency(portfolioStats.totalCollected)}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Defaulted Loans"
          value={String(portfolioStats.defaultedCount)}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="destructive"
          trend={`of ${portfolioStats.totalBeneficiaries} total`}
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-xl p-5 shadow-card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-success/10">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{portfolioStats.completedCount}</p>
            <p className="text-xs text-muted-foreground">Completed Loans</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{portfolioStats.activeLoanCount}</p>
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
              {recentLoans.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4 font-medium">{b.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.employeeId}</td>
                  <td className="px-6 py-4">{formatCurrency(b.loanAmount)}</td>
                  <td className="px-6 py-4">{formatCurrency(b.outstandingBalance)}</td>
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

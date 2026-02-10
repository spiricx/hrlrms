import { useState } from 'react';
import { mockBeneficiaries, portfolioStats } from '@/lib/mockData';
import { formatCurrency } from '@/lib/loanCalculations';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';

const statusData = [
  { name: 'Active', value: portfolioStats.activeLoanCount, color: 'hsl(152, 60%, 40%)' },
  { name: 'Completed', value: portfolioStats.completedCount, color: 'hsl(222, 60%, 22%)' },
  { name: 'Defaulted', value: portfolioStats.defaultedCount, color: 'hsl(0, 72%, 51%)' },
];

const deptData = mockBeneficiaries.reduce<Record<string, number>>((acc, b) => {
  acc[b.department] = (acc[b.department] || 0) + b.loanAmount;
  return acc;
}, {});

const deptChartData = Object.entries(deptData).map(([dept, amount]) => ({
  department: dept,
  amount: Math.round(amount / 1000000 * 100) / 100,
}));

export default function Reports() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [stateFilter, setStateFilter] = useState('all');

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Loan performance and portfolio insights</p>
        </div>
        {isAdmin && (
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status distribution */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <h2 className="text-lg font-bold font-display mb-4">Loan Status Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </div>
            ))}
          </div>
        </div>

        {/* Department distribution */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <h2 className="text-lg font-bold font-display mb-4">Loans by Department (₦M)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 88%)" />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => `₦${value}M`} />
                <Bar dataKey="amount" fill="hsl(42, 87%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Portfolio summary table */}
      <div className="bg-card rounded-xl shadow-card p-6">
        <h2 className="text-lg font-bold font-display mb-4">Portfolio Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Disbursed</p>
            <p className="mt-1 text-xl font-bold font-display">{formatCurrency(portfolioStats.totalDisbursed)}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Collected</p>
            <p className="mt-1 text-xl font-bold font-display">{formatCurrency(portfolioStats.totalCollected)}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding</p>
            <p className="mt-1 text-xl font-bold font-display">{formatCurrency(portfolioStats.totalOutstanding)}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Recovery Rate</p>
            <p className="mt-1 text-xl font-bold font-display">
              {portfolioStats.totalDisbursed > 0
                ? `${Math.round((portfolioStats.totalCollected / portfolioStats.totalDisbursed) * 100)}%`
                : '0%'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

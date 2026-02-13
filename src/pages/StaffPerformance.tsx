import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Award, Target, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

type StaffMember = { id: string; title: string; surname: string; first_name: string; staff_id: string; state: string; branch: string; designation: string; email: string; status: string; };
type Beneficiary = { id: string; state: string; bank_branch: string; status: string; loan_amount: number; outstanding_balance: number; total_paid: number; monthly_emi: number; created_by: string | null; };
type Transaction = { id: string; beneficiary_id: string; amount: number; date_paid: string; recorded_by: string | null; };

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function formatNaira(n: number) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

export default function StaffPerformance() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState('all');

  useEffect(() => {
    (async () => {
      const [s, b, t] = await Promise.all([
        supabase.from('staff_members').select('id,title,surname,first_name,staff_id,state,branch,designation,email,status'),
        supabase.from('beneficiaries').select('id,state,bank_branch,status,loan_amount,outstanding_balance,total_paid,monthly_emi,created_by'),
        supabase.from('transactions').select('id,beneficiary_id,amount,date_paid,recorded_by'),
      ]);
      setStaff((s.data as any[]) || []);
      setBeneficiaries((b.data as any[]) || []);
      setTransactions((t.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  // Compute metrics per staff (matched via email to profiles/created_by)
  const staffMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return staff.filter(s => filterState === 'all' || s.state === filterState).map(s => {
      // Match beneficiaries by state+branch (staff manages beneficiaries in their branch)
      const myBeneficiaries = beneficiaries.filter(b => b.state === s.state && b.bank_branch === s.branch);
      const activeBens = myBeneficiaries.filter(b => b.status === 'active');
      const nplBens = myBeneficiaries.filter(b => b.outstanding_balance > 0 && b.status === 'active' && b.total_paid < b.monthly_emi * 3);
      const portfolioValue = activeBens.reduce((sum, b) => sum + Number(b.loan_amount), 0);
      const totalOutstanding = activeBens.reduce((sum, b) => sum + Number(b.outstanding_balance), 0);

      // Monthly transactions
      const benIds = new Set(myBeneficiaries.map(b => b.id));
      const monthTxns = transactions.filter(t => {
        if (!benIds.has(t.beneficiary_id)) return false;
        const d = new Date(t.date_paid);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const recoveryMTD = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
      const nplRatio = portfolioValue > 0 ? (nplBens.reduce((s, b) => s + Number(b.outstanding_balance), 0) / portfolioValue * 100) : 0;
      const recoveryRate = totalOutstanding > 0 ? (recoveryMTD / (activeBens.reduce((s, b) => s + Number(b.monthly_emi), 0) || 1) * 100) : 0;

      return {
        ...s,
        totalLoans: myBeneficiaries.length,
        activeLoans: activeBens.length,
        portfolioValue,
        recoveryMTD,
        nplCount: nplBens.length,
        nplRatio: Math.round(nplRatio * 10) / 10,
        recoveryRate: Math.min(Math.round(recoveryRate), 200),
      };
    }).sort((a, b) => b.recoveryMTD - a.recoveryMTD);
  }, [staff, beneficiaries, transactions, filterState]);

  // Branch & state aggregates
  const branchMetrics = useMemo(() => {
    const map = new Map<string, { branch: string; state: string; nplRatio: number; totalRecovery: number; manager: string }>();
    staffMetrics.forEach(s => {
      const key = `${s.state}-${s.branch}`;
      const existing = map.get(key);
      if (!existing || s.designation.toLowerCase().includes('manager')) {
        map.set(key, {
          branch: s.branch,
          state: s.state,
          nplRatio: s.nplRatio,
          totalRecovery: (existing?.totalRecovery || 0) + s.recoveryMTD,
          manager: s.designation.toLowerCase().includes('manager') ? `${s.title} ${s.surname}` : existing?.manager || '',
        });
      } else {
        map.set(key, { ...existing, totalRecovery: existing.totalRecovery + s.recoveryMTD });
      }
    });
    return [...map.values()].sort((a, b) => a.nplRatio - b.nplRatio).slice(0, 10);
  }, [staffMetrics]);

  const stateMetrics = useMemo(() => {
    const map = new Map<string, { state: string; nplRatio: number; recoveryRate: number; totalStaff: number }>();
    staffMetrics.forEach(s => {
      const existing = map.get(s.state);
      if (!existing) {
        map.set(s.state, { state: s.state, nplRatio: s.nplRatio, recoveryRate: s.recoveryRate, totalStaff: 1 });
      } else {
        map.set(s.state, {
          ...existing,
          nplRatio: (existing.nplRatio * existing.totalStaff + s.nplRatio) / (existing.totalStaff + 1),
          recoveryRate: (existing.recoveryRate * existing.totalStaff + s.recoveryRate) / (existing.totalStaff + 1),
          totalStaff: existing.totalStaff + 1,
        });
      }
    });
    return [...map.values()].sort((a, b) => a.nplRatio - b.nplRatio).slice(0, 10);
  }, [staffMetrics]);

  // Top performers auto-flag
  const topPerformers = staffMetrics.slice(0, 3);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading performance data…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Staff Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live metrics computed from loan & transaction data</p>
        </div>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Staff</div><div className="text-2xl font-bold">{staffMetrics.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Portfolio</div><div className="text-2xl font-bold">{formatNaira(staffMetrics.reduce((s, m) => s + m.portfolioValue, 0))}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Recovery (MTD)</div><div className="text-2xl font-bold text-emerald-600">{formatNaira(staffMetrics.reduce((s, m) => s + m.recoveryMTD, 0))}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Avg NPL Ratio</div><div className="text-2xl font-bold">{staffMetrics.length ? (staffMetrics.reduce((s, m) => s + m.nplRatio, 0) / staffMetrics.length).toFixed(1) : 0}%</div></CardContent></Card>
      </div>

      {/* Reward Auto-flag */}
      {topPerformers.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Award className="w-5 h-5 text-primary" /> Top Performers – Reward Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPerformers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <Badge variant={i === 0 ? 'default' : 'secondary'}>{i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'}</Badge>
                  <span className="font-medium">{p.title} {p.surname} {p.first_name}</span>
                  <span className="text-muted-foreground">({p.branch})</span>
                  <span className="text-emerald-600 font-medium">{formatNaira(p.recoveryMTD)} recovered</span>
                  {i === 0 && <Badge className="bg-amber-100 text-amber-700">★ Recommended for Bonus</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recovery by Staff (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={staffMetrics.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="surname" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => formatNaira(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatNaira(v)} />
                <Bar dataKey="recoveryMTD" fill="hsl(var(--primary))" name="Recovery (MTD)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">NPL Ratio by Staff (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={staffMetrics.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="surname" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="nplRatio" fill="hsl(var(--chart-3))" name="NPL Ratio %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard Tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Officers */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Top 10 Loan Officers (Recovery)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/60"><tr>
                {['Rank', 'Name', 'Branch', 'State', 'Recovery (₦)', 'NPL Ratio', 'Recovery Rate'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {staffMetrics.slice(0, 10).map((s, i) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-bold">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.title} {s.surname} {s.first_name}</td>
                    <td className="px-3 py-2">{s.branch}</td>
                    <td className="px-3 py-2">{s.state}</td>
                    <td className="px-3 py-2 font-medium text-emerald-600">{formatNaira(s.recoveryMTD)}</td>
                    <td className="px-3 py-2">{s.nplRatio}%</td>
                    <td className="px-3 py-2">{s.recoveryRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Best Branches */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4" /> Best Branches (Lowest NPL)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/60"><tr>
                {['Rank', 'Branch', 'State', 'NPL Ratio', 'Total Recovery', 'Manager'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {branchMetrics.map((b, i) => (
                  <tr key={`${b.state}-${b.branch}`} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-bold">{i + 1}</td>
                    <td className="px-3 py-2">{b.branch}</td>
                    <td className="px-3 py-2">{b.state}</td>
                    <td className="px-3 py-2">{b.nplRatio}%</td>
                    <td className="px-3 py-2 text-emerald-600">{formatNaira(b.totalRecovery)}</td>
                    <td className="px-3 py-2">{b.manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Best States */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" /> Best Performing States</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/60"><tr>
              {['Rank', 'State', 'NPL Ratio', 'Recovery Rate', 'Total Staff'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {stateMetrics.map((s, i) => (
                <tr key={s.state} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 font-bold">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{s.state}</td>
                  <td className="px-3 py-2">{s.nplRatio.toFixed(1)}%</td>
                  <td className="px-3 py-2">{s.recoveryRate.toFixed(0)}%</td>
                  <td className="px-3 py-2">{s.totalStaff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

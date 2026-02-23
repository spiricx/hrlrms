import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, Filter } from 'lucide-react';
import { formatCurrency, formatDate, stripTime, getMonthsDue } from '@/lib/loanCalculations';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import StatusBadge from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import StatCard from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;
type Profile = Tables<'profiles'>;

interface EnrichedBeneficiary extends Beneficiary {
  lastPaymentDate: string | null;
  creatorName: string;
}

export default function LoanHistory() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { map: arrearsMap } = useArrearsLookup();

  const [beneficiaries, setBeneficiaries] = useState<EnrichedBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('month');

  useEffect(() => {
    const fetchData = async () => {
      const [benResult, txnResult, profileResult] = await Promise.all([
        supabase.from('beneficiaries').select('*').order('created_at', { ascending: false }),
        supabase.from('transactions').select('beneficiary_id, date_paid').order('date_paid', { ascending: false }),
        supabase.from('profiles').select('user_id, full_name'),
      ]);

      const bens = benResult.data || [];
      const txns = txnResult.data || [];
      const profiles = profileResult.data || [];

      const profileMap = new Map<string, string>();
      profiles.forEach(p => profileMap.set(p.user_id, p.full_name || 'Unknown'));

      const latestTxnMap = new Map<string, string>();
      txns.forEach(t => {
        if (!latestTxnMap.has(t.beneficiary_id)) latestTxnMap.set(t.beneficiary_id, t.date_paid);
      });

      const enriched: EnrichedBeneficiary[] = bens.map(b => ({
        ...b,
        lastPaymentDate: latestTxnMap.get(b.id) || null,
        creatorName: b.created_by ? (profileMap.get(b.created_by) || 'Unknown') : 'System',
      }));

      setBeneficiaries(enriched);
      setLoading(false);
    };
    fetchData();

    const channel = supabase.channel('loan-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beneficiaries' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Derived filter options
  const branches = useMemo(() => [...new Set(beneficiaries.map(b => b.bank_branch).filter(Boolean))].sort(), [beneficiaries]);
  const officers = useMemo(() => [...new Set(beneficiaries.map(b => b.creatorName).filter(n => n !== 'System'))].sort(), [beneficiaries]);
  const orgs = useMemo(() => [...new Set(beneficiaries.map(b => b.department).filter(Boolean))].sort(), [beneficiaries]);

  // Health classification
  const classifyHealth = (b: Beneficiary): 'current' | 'arrears' | 'liquidated' => {
    if (b.status === 'completed' || Number(b.outstanding_balance) <= 0) return 'liquidated';
    const a = getArrearsFromMap(arrearsMap, b.id);
    if (a.arrearsMonths > 0) return 'arrears';
    return 'current';
  };

  const filtered = useMemo(() => beneficiaries.filter(b => {
    const q = search.toLowerCase();
    const matchesSearch = !q || b.name.toLowerCase().includes(q) || b.employee_id.toLowerCase().includes(q) || (b.loan_reference_number || '').toLowerCase().includes(q) || (b.nhf_number || '').toLowerCase().includes(q);
    const matchesState = stateFilter === 'all' || b.state === stateFilter;
    const matchesBranch = branchFilter === 'all' || b.bank_branch === branchFilter;
    const matchesOfficer = officerFilter === 'all' || b.creatorName === officerFilter;
    const matchesOrg = orgFilter === 'all' || b.department === orgFilter;
    const health = classifyHealth(b);
    const matchesHealth = healthFilter === 'all' || healthFilter === health;
    return matchesSearch && matchesState && matchesBranch && matchesOfficer && matchesOrg && matchesHealth;
  }), [beneficiaries, search, stateFilter, branchFilter, officerFilter, orgFilter, healthFilter]);

  // Stats
  const totalActive = filtered.filter(b => b.status === 'active' || b.status === 'defaulted').length;
  const totalLiquidated = filtered.filter(b => b.status === 'completed' || Number(b.outstanding_balance) <= 0).length;
  const totalOutstanding = filtered.reduce((s, b) => s + Number(b.outstanding_balance), 0);
  const totalDisbursed = filtered.reduce((s, b) => s + Number(b.loan_amount), 0);
  const inArrearsCount = filtered.filter(b => classifyHealth(b) === 'arrears').length;

  // Group by time period for chart
  const timeSeriesData = useMemo(() => {
    const grouped: Record<string, { label: string; count: number; amount: number }> = {};
    filtered.forEach(b => {
      const d = new Date(b.created_at);
      let key: string;
      let label: string;
      if (groupBy === 'day') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        label = formatDate(d);
      } else if (groupBy === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        label = d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
      } else {
        key = String(d.getFullYear());
        label = key;
      }
      if (!grouped[key]) grouped[key] = { label, count: 0, amount: 0 };
      grouped[key].count++;
      grouped[key].amount += Number(b.loan_amount);
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filtered, groupBy]);

  // Health pie data
  const healthPieData = useMemo(() => {
    let current = 0, arrears = 0, liquidated = 0;
    filtered.forEach(b => {
      const h = classifyHealth(b);
      if (h === 'current') current++;
      else if (h === 'arrears') arrears++;
      else liquidated++;
    });
    return [
      { name: 'Current', value: current, color: 'hsl(152, 60%, 40%)' },
      { name: 'In Arrears', value: arrears, color: 'hsl(0, 72%, 51%)' },
      { name: 'Liquidated', value: liquidated, color: 'hsl(222, 60%, 50%)' },
    ];
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading loan history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-display flex items-center gap-2">
          <Clock className="w-7 h-7 text-primary" /> Loan History
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Comprehensive history of all loan facilities — active, in arrears, and liquidated</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Loans" value={String(filtered.length)} icon={<Clock className="w-5 h-5" />} />
        <StatCard label="Active Loans" value={String(totalActive)} icon={<TrendingUp className="w-5 h-5" />} variant="accent" />
        <StatCard label="Liquidated" value={String(totalLiquidated)} icon={<CheckCircle2 className="w-5 h-5" />} variant="success" />
        <StatCard label="In Arrears" value={String(inArrearsCount)} icon={<AlertTriangle className="w-5 h-5" />} variant="destructive" />
        <StatCard label="Outstanding Balance" value={formatCurrency(totalOutstanding)} icon={<TrendingDown className="w-5 h-5" />} trend={`Disbursed: ${formatCurrency(totalDisbursed)}`} />
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filters</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search name, NHF, Ref..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          {isAdmin && (
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={officerFilter} onValueChange={setOfficerFilter}>
            <SelectTrigger><SelectValue placeholder="Loan Officer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Officers</SelectItem>
              {officers.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger><SelectValue placeholder="Organization" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              {orgs.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger><SelectValue placeholder="Health Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="arrears">In Arrears</SelectItem>
              <SelectItem value="liquidated">Liquidated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Loan creation trend */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold font-display">Loans Created Over Time</h2>
            <Select value={groupBy} onValueChange={v => setGroupBy(v as any)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 88%)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: number, name: string) => name === 'amount' ? formatCurrency(v) : v} />
                <Bar dataKey="count" fill="hsl(42, 87%, 55%)" radius={[4, 4, 0, 0]} name="Loans Created" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Health distribution */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <h2 className="text-lg font-bold font-display mb-4">Loan Health Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={healthPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {healthPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {healthPieData.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold font-display">
            Loan Register — {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">S/N</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Ref</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State / Branch</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Officer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Health</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Days Overdue</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">No loans match the selected filters.</td></tr>
              )}
              {filtered.map((b, idx) => {
                const health = classifyHealth(b);
                const a = getArrearsFromMap(arrearsMap, b.id);
                const createdDate = new Date(b.created_at);

                // Use authoritative DPD from DB view
                const daysOverdue = a.daysOverdue;

                return (
                  <tr
                    key={b.id}
                    className="border-b border-border table-row-highlight cursor-pointer"
                    onClick={() => navigate(`/beneficiary/${b.id}`)}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-primary hover:underline">{b.name}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{b.loan_reference_number || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{b.state || '—'} / {b.bank_branch || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{b.department}</td>
                    <td className="px-3 py-2.5 text-xs">{b.creatorName}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <div>{formatDate(createdDate)}</div>
                      <div className="text-muted-foreground text-[10px]">
                        {createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{formatCurrency(Number(b.loan_amount))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold">
                      {formatCurrency(Number(b.outstanding_balance))}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={health === 'current' ? 'default' : health === 'arrears' ? 'destructive' : 'secondary'}
                        className={cn(
                          'text-[10px]',
                          health === 'current' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                          health === 'liquidated' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                          health === 'arrears' && 'animate-pulse'
                        )}
                      >
                        {health === 'current' ? 'Current' : health === 'arrears' ? 'In Arrears' : 'Liquidated'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {daysOverdue > 0 ? (
                        <span className={cn(
                          'font-semibold',
                          daysOverdue >= 90 ? 'text-destructive animate-pulse' : daysOverdue >= 30 ? 'text-orange-600' : 'text-warning'
                        )}>
                          {daysOverdue} day{daysOverdue !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-emerald-600">0 days</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {b.lastPaymentDate ? formatDate(new Date(b.lastPaymentDate)) : <span className="text-muted-foreground">No payment</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

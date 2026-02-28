import { useEffect, useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/loanCalculations';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import DateRangeFilter from '@/components/DateRangeFilter';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import ReportsExportButtons from '@/components/reports/ReportsExport';

type Beneficiary = Tables<'beneficiaries'>;

export default function Reports() {
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole('admin');

  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const { map: arrearsMap } = useArrearsLookup();
  const [staffName, setStaffName] = useState('');

  // Fetch current user's profile name
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.full_name) setStaffName(data.full_name);
    });
  }, [user]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('beneficiaries').select('*');
      if (data) setBeneficiaries(data);
      setLoading(false);
    };
    fetch();
    const channel = supabase.channel('reports-beneficiaries').on('postgres_changes', {
      event: '*', schema: 'public', table: 'beneficiaries'
    }, () => { fetch(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Derive unique branches and organizations from data
  const branches = useMemo(() => [...new Set(beneficiaries.map(b => b.bank_branch).filter(Boolean))].sort(), [beneficiaries]);
  const organizations = useMemo(() => [...new Set(beneficiaries.map(b => b.department).filter(Boolean))].sort(), [beneficiaries]);
  const years = useMemo(() => {
    const ySet = new Set<number>();
    beneficiaries.forEach(b => {
      if (b.disbursement_date) ySet.add(new Date(b.disbursement_date).getFullYear());
    });
    return [...ySet].sort((a, b) => b - a);
  }, [beneficiaries]);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const filtered = useMemo(() => {
    return beneficiaries.filter(b => {
      if (stateFilter !== 'all' && b.state !== stateFilter) return false;
      if (branchFilter !== 'all' && b.bank_branch !== branchFilter) return false;
      if (orgFilter !== 'all' && b.department !== orgFilter) return false;
      if (yearFilter !== 'all' || monthFilter !== 'all') {
        const d = b.disbursement_date ? new Date(b.disbursement_date) : null;
        if (!d) return false;
        if (yearFilter !== 'all' && d.getFullYear() !== Number(yearFilter)) return false;
        if (monthFilter !== 'all' && d.getMonth() !== Number(monthFilter)) return false;
      }
      // Date range filter on disbursement_date
      if (fromDate || toDate) {
        const d = b.disbursement_date ? new Date(b.disbursement_date) : null;
        if (!d) return false;
        if (fromDate && d < fromDate) return false;
        if (toDate) {
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (d > endOfDay) return false;
        }
      }
      return true;
    });
  }, [beneficiaries, stateFilter, branchFilter, orgFilter, monthFilter, yearFilter, fromDate, toDate]);

  const totalDisbursed = filtered.reduce((s, b) => s + Number(b.loan_amount), 0);
  const totalCollected = filtered.reduce((s, b) => s + Number(b.total_paid), 0);
  const totalOutstanding = filtered.reduce((s, b) => s + Number(b.outstanding_balance), 0);
  const activeCount = filtered.filter(b => b.status === 'active').length;
  const completedCount = filtered.filter(b => b.status === 'completed').length;
  const defaultedCount = filtered.filter(b => b.status === 'defaulted').length;

  // Compute defaulted/active from v_loan_arrears Golden Record
  const computedDefaulted = useMemo(() => {
    return filtered.filter(b => {
      if (b.status === 'completed' || Number(b.outstanding_balance) < 0.01) return false;
      const arrData = getArrearsFromMap(arrearsMap, b.id);
      return arrData.isNpl;
    }).length;
  }, [filtered, arrearsMap]);

  const computedActive = useMemo(() => {
    return filtered.filter(b => {
      if (b.status === 'completed' || Number(b.outstanding_balance) < 0.01) return false;
      const arrData = getArrearsFromMap(arrearsMap, b.id);
      return !arrData.isNpl;
    }).length;
  }, [filtered, arrearsMap]);
  const totalFacilities = filtered.length;

  const statusData = [
    { name: 'Active', value: computedActive, color: 'hsl(152, 60%, 40%)' },
    { name: 'Completed', value: completedCount, color: 'hsl(222, 60%, 22%)' },
    { name: 'Defaulted', value: computedDefaulted, color: 'hsl(0, 72%, 51%)' },
  ];

  // Collection efficiency data for pie chart
  const collectionData = useMemo(() => [
    { name: 'Collected', value: totalCollected, color: 'hsl(152, 60%, 40%)' },
    { name: 'Outstanding', value: totalOutstanding, color: 'hsl(0, 72%, 51%)' },
  ], [totalCollected, totalOutstanding]);

  const deptChartData = useMemo(() => {
    const deptData = filtered.reduce<Record<string, number>>((acc, b) => {
      acc[b.department] = (acc[b.department] || 0) + Number(b.loan_amount);
      return acc;
    }, {});
    return Object.entries(deptData).map(([dept, amount]) => ({
      department: dept,
      amount: Math.round(amount / 1000000 * 100) / 100
    }));
  }, [filtered]);

  // Reset branch when state changes
  useEffect(() => { setBranchFilter('all'); }, [stateFilter]);

  const filteredBranches = useMemo(() => {
    if (stateFilter === 'all') return branches;
    return [...new Set(beneficiaries.filter(b => b.state === stateFilter).map(b => b.bank_branch).filter(Boolean))].sort();
  }, [beneficiaries, stateFilter, branches]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Loan performance and portfolio insights</p>
        </div>
        <ReportsExportButtons data={{
          totalFacilities,
          computedActive,
          computedDefaulted,
          completedCount,
          totalDisbursed,
          totalCollected,
          totalOutstanding,
          recoveryRate: totalDisbursed > 0 ? `${Math.round(totalCollected / totalDisbursed * 100)}%` : '0%',
          deptChartData,
          filters: { month: monthFilter, year: yearFilter, state: stateFilter, branch: branchFilter, organisation: orgFilter },
          staffName: staffName || 'N/A',
        }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate} />
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        {isAdmin && (
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {filteredBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organisations</SelectItem>
            {organizations.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="bg-card rounded-xl shadow-card p-6">
          <h2 className="text-lg font-bold font-display mb-4">Loan Status Distribution</h2>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-secondary text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Facilities</p>
              <p className="text-xl font-bold font-display">{totalFacilities}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Loans</p>
              <p className="text-xl font-bold font-display text-success">{computedActive}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Defaulted</p>
              <p className="text-xl font-bold font-display text-destructive">{computedDefaulted}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Completed</p>
              <p className="text-xl font-bold font-display text-primary">{completedCount}</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {statusData.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </div>

        {/* Collection Efficiency Pie Chart */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <h2 className="text-lg font-bold font-display mb-4">Collection Efficiency</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-secondary text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Collected</p>
              <p className="text-lg font-bold font-display text-success">{formatCurrency(totalCollected)}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding</p>
              <p className="text-lg font-bold font-display text-destructive">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={collectionData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${Math.round(value / totalDisbursed * 100)}%`}>
                  {collectionData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {collectionData.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-card p-6">
          <h2 className="text-lg font-bold font-display mb-4">Loans by Organisations (₦M)</h2>
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

      {/* Portfolio summary */}
      <div className="bg-card rounded-xl shadow-card p-6">
        <h2 className="text-lg font-bold font-display mb-4">Portfolio Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Disbursed</p>
            <p className="mt-1 text-xl font-bold font-display">{formatCurrency(totalDisbursed)}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Collected</p>
            <p className="mt-1 text-xl font-bold font-display">{formatCurrency(totalCollected)}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding</p>
            <p className="mt-1 text-xl font-bold font-display">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Recovery Rate</p>
            <p className="mt-1 text-xl font-bold font-display">
              {totalDisbursed > 0 ? `${Math.round(totalCollected / totalDisbursed * 100)}%` : '0%'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

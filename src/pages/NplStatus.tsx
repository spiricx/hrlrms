import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle, TrendingDown, Wallet, Users, ArrowLeft,
  RefreshCw, Download, ChevronRight, Filter,
} from 'lucide-react';
import StatCard from '@/components/StatCard';
import { formatCurrency } from '@/lib/loanCalculations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

type DrillLevel = 'state' | 'branch' | 'accounts';

interface NplAccount {
  id: string;
  name: string;
  employeeId: string;
  state: string;
  branch: string;
  loanAmount: number;
  outstandingBalance: number;
  dpd: number;
  lastPaymentDate: string | null;
  amountInArrears: number;
  monthlyEmi: number;
}

function calculateDPD(
  beneficiary: Beneficiary,
  transactions: Transaction[]
): number {
  const bTxns = transactions.filter(t => t.beneficiary_id === beneficiary.id);
  const today = new Date();
  const commDate = new Date(beneficiary.commencement_date);

  if (commDate > today) return 0;

  // Calculate how many months should have been paid
  const monthsDiff = (today.getFullYear() - commDate.getFullYear()) * 12 +
    (today.getMonth() - commDate.getMonth());
  const expectedMonths = Math.min(monthsDiff, beneficiary.tenor_months);

  if (expectedMonths <= 0) return 0;

  // Find the highest month_for that has been paid
  const paidMonths = new Set(bTxns.map(t => t.month_for));
  
  // Find earliest unpaid month
  let firstUnpaidMonth = 0;
  for (let m = 1; m <= expectedMonths; m++) {
    if (!paidMonths.has(m)) {
      firstUnpaidMonth = m;
      break;
    }
  }

  if (firstUnpaidMonth === 0) return 0;

  // Calculate DPD from the due date of the first unpaid month
  const dueDate = new Date(commDate);
  dueDate.setMonth(dueDate.getMonth() + firstUnpaidMonth);

  const diffMs = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getLastPaymentDate(beneficiary: Beneficiary, transactions: Transaction[]): string | null {
  const bTxns = transactions
    .filter(t => t.beneficiary_id === beneficiary.id)
    .sort((a, b) => new Date(b.date_paid).getTime() - new Date(a.date_paid).getTime());
  return bTxns[0]?.date_paid ?? null;
}

function getAmountInArrears(beneficiary: Beneficiary, transactions: Transaction[]): number {
  const today = new Date();
  const commDate = new Date(beneficiary.commencement_date);
  const monthsDiff = (today.getFullYear() - commDate.getFullYear()) * 12 +
    (today.getMonth() - commDate.getMonth());
  const expectedMonths = Math.min(Math.max(monthsDiff, 0), beneficiary.tenor_months);
  const expectedTotal = expectedMonths * Number(beneficiary.monthly_emi);
  const totalPaid = Number(beneficiary.total_paid);
  return Math.max(0, expectedTotal - totalPaid);
}

type ParThreshold = 'par30' | 'par60' | 'par90' | 'par120' | 'par180';
const PAR_OPTIONS: { value: ParThreshold; label: string; days: number }[] = [
  { value: 'par30', label: 'PAR 30+', days: 30 },
  { value: 'par60', label: 'PAR 60+', days: 60 },
  { value: 'par90', label: 'PAR 90+ (NPL)', days: 90 },
  { value: 'par120', label: 'PAR 120+', days: 120 },
  { value: 'par180', label: 'PAR 180+', days: 180 },
];

function riskColor(dpd: number) {
  if (dpd >= 90) return 'text-destructive font-bold';
  if (dpd >= 30) return 'text-warning font-semibold';
  return 'text-success';
}

function riskRowBg(dpd: number) {
  if (dpd >= 90) return 'bg-destructive/5';
  if (dpd >= 30) return 'bg-warning/5';
  return '';
}

function nplRatioColor(ratio: number): 'destructive' | 'default' | 'secondary' | 'outline' {
  if (ratio > 5) return 'destructive';
  if (ratio >= 3) return 'default';
  return 'secondary';
}

export default function NplStatus() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('all');
  const [parFilter, setParFilter] = useState<ParThreshold>('par90');
  const [searchQuery, setSearchQuery] = useState('');

  const [drillLevel, setDrillLevel] = useState<DrillLevel>('state');
  const [selectedState, setSelectedState] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');

  const fetchData = useCallback(async () => {
    const [bRes, tRes] = await Promise.all([
      supabase.from('beneficiaries').select('*'),
      supabase.from('transactions').select('*'),
    ]);
    if (bRes.data) setBeneficiaries(bRes.data);
    if (tRes.data) setTransactions(tRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('npl-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beneficiaries' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Build NPL account data
  const nplAccounts: NplAccount[] = useMemo(() => {
    const activeLoans = beneficiaries.filter(b => b.status === 'active' || b.status === 'defaulted');
    return activeLoans.map(b => ({
      id: b.id,
      name: b.name,
      employeeId: b.employee_id,
      state: b.state,
      branch: b.bank_branch,
      loanAmount: Number(b.loan_amount),
      outstandingBalance: Number(b.outstanding_balance),
      dpd: calculateDPD(b, transactions),
      lastPaymentDate: getLastPaymentDate(b, transactions),
      amountInArrears: getAmountInArrears(b, transactions),
      monthlyEmi: Number(b.monthly_emi),
    }));
  }, [beneficiaries, transactions]);

  const parDays = PAR_OPTIONS.find(p => p.value === parFilter)?.days ?? 90;

  // Apply filters
  const filteredAccounts = useMemo(() => {
    let accts = nplAccounts;
    if (stateFilter !== 'all') accts = accts.filter(a => a.state === stateFilter);
    return accts;
  }, [nplAccounts, stateFilter]);

  const activePortfolio = filteredAccounts;
  const totalActiveAmount = activePortfolio.reduce((s, a) => s + a.outstandingBalance, 0);
  const nplList = filteredAccounts.filter(a => a.dpd >= 90);
  const totalNplAmount = nplList.reduce((s, a) => s + a.outstandingBalance, 0);
  const nplRatio = totalActiveAmount > 0 ? (totalNplAmount / totalActiveAmount) * 100 : 0;
  const par30Amount = filteredAccounts.filter(a => a.dpd >= 30).reduce((s, a) => s + a.outstandingBalance, 0);
  const par90Amount = totalNplAmount;

  // State-level aggregation
  const stateData = useMemo(() => {
    const map = new Map<string, {
      state: string; totalLoans: number; activeAmount: number;
      nplAmount: number; nplCount: number; par30: number; par90: number;
    }>();
    for (const a of filteredAccounts) {
      const st = a.state || 'Unknown';
      const entry = map.get(st) || { state: st, totalLoans: 0, activeAmount: 0, nplAmount: 0, nplCount: 0, par30: 0, par90: 0 };
      entry.totalLoans++;
      entry.activeAmount += a.outstandingBalance;
      if (a.dpd >= 90) { entry.nplAmount += a.outstandingBalance; entry.nplCount++; }
      if (a.dpd >= 30) entry.par30 += a.outstandingBalance;
      if (a.dpd >= 90) entry.par90 += a.outstandingBalance;
      map.set(st, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.nplAmount - a.nplAmount);
  }, [filteredAccounts]);

  // Branch-level aggregation (for selected state)
  const branchData = useMemo(() => {
    const stateAccounts = filteredAccounts.filter(a => a.state === selectedState);
    const map = new Map<string, {
      branch: string; totalLoans: number; activeAmount: number;
      nplAmount: number; nplCount: number; worstDpd: number;
    }>();
    for (const a of stateAccounts) {
      const br = a.branch || 'Unknown';
      const entry = map.get(br) || { branch: br, totalLoans: 0, activeAmount: 0, nplAmount: 0, nplCount: 0, worstDpd: 0 };
      entry.totalLoans++;
      entry.activeAmount += a.outstandingBalance;
      if (a.dpd >= 90) { entry.nplAmount += a.outstandingBalance; entry.nplCount++; }
      entry.worstDpd = Math.max(entry.worstDpd, a.dpd);
      map.set(br, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.nplAmount - a.nplAmount);
  }, [filteredAccounts, selectedState]);

  // Individual accounts for drill-down
  const accountsList = useMemo(() => {
    let accts = filteredAccounts.filter(a => a.dpd >= parDays);
    if (drillLevel === 'branch' && selectedState) accts = accts.filter(a => a.state === selectedState);
    if (drillLevel === 'accounts' && selectedBranch) accts = accts.filter(a => a.branch === selectedBranch);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      accts = accts.filter(a => a.name.toLowerCase().includes(q) || a.employeeId.toLowerCase().includes(q));
    }
    return accts.sort((a, b) => b.dpd - a.dpd);
  }, [filteredAccounts, parDays, drillLevel, selectedState, selectedBranch, searchQuery]);

  // Simple trend data (mock last 6 months based on current ratio)
  const trendData = useMemo(() => {
    const months = ['6mo ago', '5mo ago', '4mo ago', '3mo ago', '2mo ago', 'Current'];
    // Simulate a slight trend. In production this would be historical data.
    const base = nplRatio;
    return months.map((month, i) => ({
      month,
      ratio: Math.max(0, +(base + (Math.random() - 0.5) * 3 - (5 - i) * 0.3).toFixed(1)),
    }));
  }, [nplRatio]);

  const handleExport = () => {
    const rows = accountsList.map(a => ({
      Name: a.name,
      'Employee ID': a.employeeId,
      State: a.state,
      Branch: a.branch,
      'Loan Amount': a.loanAmount,
      'Outstanding Balance': a.outstandingBalance,
      DPD: a.dpd,
      'Last Payment': a.lastPaymentDate || 'N/A',
      'Amount in Arrears': a.amountInArrears,
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h]}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `npl_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const navigateTo = (level: DrillLevel, state?: string, branch?: string) => {
    setDrillLevel(level);
    if (state !== undefined) setSelectedState(state);
    if (branch !== undefined) setSelectedBranch(branch);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading NPL data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {drillLevel !== 'state' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateTo(drillLevel === 'accounts' ? 'branch' : 'state')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground">NPL Status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {drillLevel === 'state' && 'Non-Performing Loans Overview'}
              {drillLevel === 'branch' && `Branches in ${selectedState}`}
              {drillLevel === 'accounts' && `Accounts in ${selectedBranch}, ${selectedState}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && drillLevel === 'state' && (
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={parFilter} onValueChange={(v) => setParFilter(v as ParThreshold)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAR_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {drillLevel === 'state' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Active Portfolio"
            value={formatCurrency(totalActiveAmount)}
            icon={<Wallet className="w-5 h-5" />}
          />
          <StatCard
            label="Total NPL Amount"
            value={formatCurrency(totalNplAmount)}
            icon={<AlertTriangle className="w-5 h-5" />}
            variant="destructive"
          />
          <StatCard
            label="NPL Ratio"
            value={`${nplRatio.toFixed(1)}%`}
            icon={<TrendingDown className="w-5 h-5" />}
            variant={nplRatio > 5 ? 'destructive' : nplRatio >= 3 ? 'accent' : 'success'}
          />
          <StatCard
            label="NPL Accounts"
            value={String(nplList.length)}
            icon={<Users className="w-5 h-5" />}
            variant="destructive"
          />
          <StatCard
            label="PAR 30+ Days"
            value={formatCurrency(par30Amount)}
            icon={<AlertTriangle className="w-5 h-5" />}
            variant="accent"
          />
        </div>
      )}

      {/* Trend Chart + Tables */}
      <div className="grid gap-6 lg:grid-cols-3">
        {drillLevel === 'state' && (
          <div className="bg-card rounded-xl shadow-card p-6 lg:col-span-1">
            <h2 className="text-lg font-bold font-display mb-4">NPL Ratio Trend</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 88%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Line type="monotone" dataKey="ratio" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className={`bg-card rounded-xl shadow-card overflow-hidden ${drillLevel === 'state' ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* State View */}
          {drillLevel === 'state' && (
            <>
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-bold font-display">NPL by State</h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">Active Loans</TableHead>
                      <TableHead className="text-right">Active Amount</TableHead>
                      <TableHead className="text-right">NPL Amount</TableHead>
                      <TableHead className="text-right">NPL Count</TableHead>
                      <TableHead className="text-right">NPL Ratio</TableHead>
                      <TableHead className="text-right">PAR 30+</TableHead>
                      <TableHead className="text-right">PAR 90+</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stateData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    )}
                    {stateData.map(row => {
                      const ratio = row.activeAmount > 0 ? (row.nplAmount / row.activeAmount) * 100 : 0;
                      return (
                        <TableRow key={row.state} className={riskRowBg(ratio > 5 ? 90 : ratio >= 3 ? 30 : 0)}>
                          <TableCell className="font-medium">{row.state}</TableCell>
                          <TableCell className="text-right">{row.totalLoans}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.activeAmount)}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">{formatCurrency(row.nplAmount)}</TableCell>
                          <TableCell className="text-right">{row.nplCount}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={nplRatioColor(ratio)}>{ratio.toFixed(1)}%</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(row.par30)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.par90)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateTo('branch', row.state)}
                            >
                              View Branches <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Branch View */}
          {drillLevel === 'branch' && (
            <>
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-bold font-display">Branches in {selectedState}</h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Total Loans</TableHead>
                      <TableHead className="text-right">Active Amount</TableHead>
                      <TableHead className="text-right">NPL Amount</TableHead>
                      <TableHead className="text-right">NPL Count</TableHead>
                      <TableHead className="text-right">NPL Ratio</TableHead>
                      <TableHead className="text-right">Worst DPD</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          No branches found
                        </TableCell>
                      </TableRow>
                    )}
                    {branchData.map(row => {
                      const ratio = row.activeAmount > 0 ? (row.nplAmount / row.activeAmount) * 100 : 0;
                      return (
                        <TableRow key={row.branch} className={riskRowBg(row.worstDpd)}>
                          <TableCell className="font-medium">{row.branch}</TableCell>
                          <TableCell className="text-right">{row.totalLoans}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.activeAmount)}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">{formatCurrency(row.nplAmount)}</TableCell>
                          <TableCell className="text-right">{row.nplCount}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={nplRatioColor(ratio)}>{ratio.toFixed(1)}%</Badge>
                          </TableCell>
                          <TableCell className={`text-right ${riskColor(row.worstDpd)}`}>{row.worstDpd} days</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateTo('accounts', selectedState, row.branch)}
                            >
                              View Details <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Individual Accounts View */}
          {drillLevel === 'accounts' && (
            <>
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold font-display">NPL Accounts</h2>
                <Input
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-64"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Beneficiary Name</TableHead>
                      <TableHead>Branch / State</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">DPD</TableHead>
                      <TableHead>Last Payment</TableHead>
                      <TableHead className="text-right">Amount in Arrears</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountsList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          No NPL accounts found for the selected criteria
                        </TableCell>
                      </TableRow>
                    )}
                    {accountsList.map(a => (
                      <TableRow key={a.id} className={riskRowBg(a.dpd)}>
                        <TableCell className="font-mono text-xs">{a.employeeId}</TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-muted-foreground">{a.branch} / {a.state}</TableCell>
                        <TableCell className="text-right">{formatCurrency(a.loanAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(a.outstandingBalance)}</TableCell>
                        <TableCell className={`text-right ${riskColor(a.dpd)}`}>{a.dpd}</TableCell>
                        <TableCell>{a.lastPaymentDate ? new Date(a.lastPaymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">{formatCurrency(a.amountInArrears)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

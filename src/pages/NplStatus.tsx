import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, TrendingDown, Wallet, Users, ArrowLeft,
  RefreshCw, ChevronRight,
} from 'lucide-react';
import NplExportButtons, { type NplReportData } from '@/components/npl/NplExport';
import StatCard from '@/components/StatCard';
import { formatCurrency, stripTime } from '@/lib/loanCalculations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  organization: string;
  loanAmount: number;
  tenorMonths: number;
  monthlyEmi: number;
  totalPaid: number;
  outstandingBalance: number;
  dpd: number;
  lastPaymentDate: string | null;
  amountInArrears: number;
  monthsInArrears: number;
}

/**
 * Calculate DPD using total_paid / monthly_emi to determine how many instalments
 * have been paid. This is the canonical method used across Dashboard, Beneficiaries,
 * and StaffPerformance — ensuring NPL ratios are 100% consistent across all modules.
 *
 * NOTE: We do NOT use transaction month_for records because beneficiaries often
 * make partial / bulk payments tracked in total_paid, not per-instalment records.
 * Using month_for would falsely classify almost every loan as NPL (100% ratio bug).
 */
function calculateDPD(beneficiary: Beneficiary): number {
  const today = stripTime(new Date());
  const commDate = stripTime(new Date(beneficiary.commencement_date));

  if (today < commDate) return 0;
  if (Number(beneficiary.outstanding_balance) <= 0) return 0;

  const monthlyEmi = Number(beneficiary.monthly_emi);
  if (monthlyEmi <= 0) return 0;

  const totalPaid = Math.round(Number(beneficiary.total_paid) * 100) / 100;

  // Count how many instalments are due (due date <= today), capped at tenor
  let dueMonths = 0;
  for (let i = 1; i <= beneficiary.tenor_months; i++) {
    const dueDate = new Date(commDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));
    if (today >= stripTime(dueDate)) dueMonths = i;
    else break;
  }

  if (dueMonths <= 0) return 0;

  // How many full instalments have been paid
  const paidMonths = Math.min(Math.floor(Math.round(totalPaid * 100) / 100 / monthlyEmi), beneficiary.tenor_months);

  // If all due instalments are paid, no DPD
  if (paidMonths >= dueMonths) return 0;

  // Due date of the first unpaid instalment (0-indexed offset)
  const firstUnpaidDue = new Date(commDate);
  firstUnpaidDue.setMonth(firstUnpaidDue.getMonth() + paidMonths);
  const dueDateStripped = stripTime(firstUnpaidDue);

  // DPD inclusive: 1 on the due date itself
  return Math.max(0, Math.floor((today.getTime() - dueDateStripped.getTime()) / (1000 * 60 * 60 * 24))) + 1;
}

function getLastPaymentDate(beneficiary: Beneficiary, transactions: Transaction[]): string | null {
  const bTxns = transactions
    .filter(t => t.beneficiary_id === beneficiary.id)
    .sort((a, b) => new Date(b.date_paid).getTime() - new Date(a.date_paid).getTime());
  return bTxns[0]?.date_paid ?? null;
}

function getAmountInArrears(beneficiary: Beneficiary): number {
  const today = stripTime(new Date());
  const commDate = stripTime(new Date(beneficiary.commencement_date));

  // Count how many instalments are due (due date <= today)
  let dueMonths = 0;
  for (let i = 1; i <= beneficiary.tenor_months; i++) {
    const dueDate = new Date(commDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));
    if (today >= stripTime(dueDate)) dueMonths = i;
    else break;
  }

  const expectedTotal = dueMonths * Number(beneficiary.monthly_emi);
  const totalPaid = Math.round(Number(beneficiary.total_paid) * 100) / 100;
  // Only the portion that is in arrears (next period has passed)
  // For NPL display purposes show total overdue deficit
  return Math.max(0, Math.round((expectedTotal - totalPaid) * 100) / 100);
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
  const [branchFilter, setBranchFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [parFilter, setParFilter] = useState<ParThreshold>('par90');
  const [searchQuery, setSearchQuery] = useState('');
  const [staffName, setStaffName] = useState('');

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

  // Fetch staff name
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle();
        if (profile?.full_name) setStaffName(profile.full_name);
      }
    })();
  }, []);

  // Build NPL account data
  const nplAccounts: NplAccount[] = useMemo(() => {
    const activeLoans = beneficiaries.filter(b => b.status === 'active' || b.status === 'defaulted');
    return activeLoans.map(b => {
      const emi = Number(b.monthly_emi);
      const arrears = getAmountInArrears(b);
      const monthsInArrears = emi > 0 ? Math.ceil(arrears / emi) : 0;
      return {
        id: b.id,
        name: b.name,
        employeeId: b.employee_id,
        state: b.state,
        branch: b.bank_branch,
        organization: b.department || '',
        loanAmount: Number(b.loan_amount),
        tenorMonths: b.tenor_months,
        monthlyEmi: emi,
        totalPaid: Number(b.total_paid),
        outstandingBalance: Number(b.outstanding_balance),
        dpd: calculateDPD(b),
        lastPaymentDate: getLastPaymentDate(b, transactions),
        amountInArrears: arrears,
        monthsInArrears,
      };
    });
  }, [beneficiaries, transactions]);

  const parDays = PAR_OPTIONS.find(p => p.value === parFilter)?.days ?? 90;


  // Available branches (filtered by selected state)
  const availableBranches = useMemo(() => {
    let filtered = beneficiaries;
    if (stateFilter !== 'all') filtered = filtered.filter(b => b.state === stateFilter);
    const branches = new Set<string>();
    filtered.forEach(b => { if (b.bank_branch) branches.add(b.bank_branch); });
    return Array.from(branches).sort();
  }, [beneficiaries, stateFilter]);

  // Available organizations (department field)
  const availableOrgs = useMemo(() => {
    const orgs = new Set<string>();
    beneficiaries.forEach(b => { if (b.department) orgs.add(b.department); });
    return Array.from(orgs).sort();
  }, [beneficiaries]);



  // Reset branch filter when state changes
  useEffect(() => {
    setBranchFilter('all');
  }, [stateFilter]);

  // Apply filters
  const filteredAccounts = useMemo(() => {
    let accts = nplAccounts;
    if (stateFilter !== 'all') accts = accts.filter(a => a.state === stateFilter);
    if (branchFilter !== 'all') accts = accts.filter(a => a.branch === branchFilter);
    // Organization filter
    if (orgFilter !== 'all') {
      accts = accts.filter(a => {
        const b = beneficiaries.find(b => b.id === a.id);
        return b?.department === orgFilter;
      });
    }
    // Date range filter (disbursement date between from and to)
    if (dateFrom || dateTo) {
      accts = accts.filter(a => {
        const b = beneficiaries.find(b => b.id === a.id);
        if (!b) return false;
        const disbDate = new Date(b.disbursement_date);
        if (dateFrom && disbDate < dateFrom) return false;
        if (dateTo) {
          const toEnd = new Date(dateTo);
          toEnd.setHours(23, 59, 59, 999);
          if (disbDate > toEnd) return false;
        }
        return true;
      });
    }
    return accts;
  }, [nplAccounts, stateFilter, branchFilter, orgFilter, dateFrom, dateTo, beneficiaries]);

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

  const nplReportData: NplReportData = useMemo(() => ({
    totalActiveAmount,
    totalNplAmount,
    nplRatio,
    nplCount: nplList.length,
    par30Amount,
    par90Amount,
    stateData,
    accountsList,
    staffName,
    filters: { state: stateFilter, dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined, dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined, par: parFilter },
  }), [totalActiveAmount, totalNplAmount, nplRatio, nplList.length, par30Amount, par90Amount, stateData, accountsList, staffName, stateFilter, dateFrom, dateTo, parFilter]);

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
          {/* 1. State Filter */}
          {drillLevel === 'state' && (
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* 2. Branch Filter */}
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {availableBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* 3. Organization Filter */}
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              {availableOrgs.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* 4. From Date Filter (Calendar) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-44 justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd MMMM yyyy') : 'From Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(d) => setDateFrom(d)}
                disabled={dateTo ? (date) => date > dateTo : undefined}
                className={cn("p-3 pointer-events-auto")}
                captionLayout="dropdown-buttons"
                fromYear={2010}
                toYear={2060}
              />
              {dateFrom && (
                <div className="p-2 pt-0 border-t">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setDateFrom(undefined)}>
                    Clear
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {/* 5. To Date Filter (Calendar) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-44 justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd MMMM yyyy') : 'To Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(d) => setDateTo(d)}
                disabled={dateFrom ? (date) => date < dateFrom : undefined}
                className={cn("p-3 pointer-events-auto")}
                captionLayout="dropdown-buttons"
                fromYear={2010}
                toYear={2060}
              />
              {dateTo && (
                <div className="p-2 pt-0 border-t">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setDateTo(undefined)}>
                    Clear
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {/* PAR Threshold */}
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
          <NplExportButtons data={nplReportData} />
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
                      <TableHead className="text-center">S/N</TableHead>
                      <TableHead>Beneficiary Names</TableHead>
                      <TableHead>Organizations</TableHead>
                      <TableHead>Branch/State</TableHead>
                      <TableHead className="text-right">No. of Beneficiaries</TableHead>
                      <TableHead className="text-right">Total Disbursed</TableHead>
                      <TableHead className="text-right">Loan Tenor</TableHead>
                      <TableHead className="text-right">Expected Monthly Repayment</TableHead>
                      <TableHead className="text-right">Actual Amount Paid</TableHead>
                      <TableHead className="text-right">Closing Balance</TableHead>
                      <TableHead className="text-right">Months in Arrears</TableHead>
                      <TableHead className="text-right">Arrears in Amount</TableHead>
                      <TableHead className="text-right">DPD</TableHead>
                      <TableHead>Last Payment Date</TableHead>
                      <TableHead className="text-right">Total Repayment Made so Far</TableHead>
                      <TableHead className="text-right">NPL Ratio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountsList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={16} className="text-center py-12 text-muted-foreground">
                          No NPL accounts found for the selected criteria
                        </TableCell>
                      </TableRow>
                    )}
                    {accountsList.map((a, idx) => {
                      const individualNplRatio = totalActiveAmount > 0 ? ((a.outstandingBalance / totalActiveAmount) * 100) : 0;
                      return (
                        <TableRow key={a.id} className={riskRowBg(a.dpd)}>
                          <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>{a.organization || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{a.branch} / {a.state}</TableCell>
                          <TableCell className="text-right">1</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.loanAmount)}</TableCell>
                          <TableCell className="text-right">{a.tenorMonths} months</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.monthlyEmi)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.totalPaid)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.outstandingBalance)}</TableCell>
                          <TableCell className="text-right">{a.monthsInArrears}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">{formatCurrency(a.amountInArrears)}</TableCell>
                          <TableCell className={`text-right ${riskColor(a.dpd)}`}>{a.dpd}</TableCell>
                          <TableCell>{a.lastPaymentDate ? new Date(a.lastPaymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }) : '—'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.totalPaid)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={nplRatioColor(individualNplRatio)}>{individualNplRatio.toFixed(2)}%</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

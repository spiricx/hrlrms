import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle, TrendingDown, Wallet, Users, ArrowLeft,
  RefreshCw, Download, ChevronRight, Filter, FileSpreadsheet, Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
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

  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      try {
        const wb = XLSX.utils.book_new();
        const today = new Date().toISOString().slice(0, 10);

        // --- Sheet 1: Summary ---
        const summaryRows = [
          ['NPL Status Report'],
          ['Generated', new Date().toLocaleDateString('en-NG', { day: '2-digit', month: '2-digit', year: 'numeric' })],
          [],
          ['Metric', 'Value'],
          ['Total Active Portfolio', totalActiveAmount],
          ['Total NPL Amount', totalNplAmount],
          ['NPL Ratio (%)', nplRatio / 100],
          ['Total NPL Accounts', nplList.length],
          ['PAR 30+ Days Amount', par30Amount],
          ['PAR 90+ Days Amount', par90Amount],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        wsSummary['!cols'] = [{ wch: 25 }, { wch: 22 }];
        // Bold title
        if (wsSummary['A1']) wsSummary['A1'].s = { font: { bold: true, sz: 14 } };
        // Bold headers row
        ['A4', 'B4'].forEach(c => { if (wsSummary[c]) wsSummary[c].s = { font: { bold: true } }; });
        // Currency format
        ['B5', 'B6', 'B9', 'B10'].forEach(c => {
          if (wsSummary[c]) wsSummary[c].z = '₦#,##0.00';
        });
        // Percentage format
        if (wsSummary['B7']) wsSummary['B7'].z = '0.0%';
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // --- Sheet 2: By State ---
        const stateHeaders = ['State', 'Total Active Loans', 'Active Amount (₦)', 'NPL Amount (₦)', 'NPL Count', 'NPL Ratio (%)', 'PAR 30+ (₦)', 'PAR 90+ (₦)'];
        const stateRows = stateData.map(r => {
          const ratio = r.activeAmount > 0 ? r.nplAmount / r.activeAmount : 0;
          return [r.state, r.totalLoans, r.activeAmount, r.nplAmount, r.nplCount, ratio, r.par30, r.par90];
        });
        const wsState = XLSX.utils.aoa_to_sheet([stateHeaders, ...stateRows]);
        wsState['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
        // Bold headers
        stateHeaders.forEach((_, i) => {
          const cell = XLSX.utils.encode_cell({ r: 0, c: i });
          if (wsState[cell]) wsState[cell].s = { font: { bold: true } };
        });
        // Format currency & percentage columns
        stateRows.forEach((_, ri) => {
          const row = ri + 1;
          [2, 3, 6, 7].forEach(col => {
            const cell = XLSX.utils.encode_cell({ r: row, c: col });
            if (wsState[cell]) wsState[cell].z = '₦#,##0.00';
          });
          const ratioCell = XLSX.utils.encode_cell({ r: row, c: 5 });
          if (wsState[ratioCell]) wsState[ratioCell].z = '0.0%';
          // Conditional fill for NPL Ratio
          const ratioVal = stateRows[ri][5] as number;
          const fill = ratioVal > 0.1 ? { fgColor: { rgb: 'FFCCCC' } } : ratioVal >= 0.05 ? { fgColor: { rgb: 'FFE0B2' } } : { fgColor: { rgb: 'C8E6C9' } };
          if (wsState[ratioCell]) wsState[ratioCell].s = { ...(wsState[ratioCell].s || {}), fill };
        });
        XLSX.utils.book_append_sheet(wb, wsState, 'By State');

        // --- Sheet 3: By Branch (all states) ---
        const branchHeaders = ['State', 'Branch', 'Total Loans', 'Active Amount (₦)', 'NPL Amount (₦)', 'NPL Count', 'NPL Ratio (%)', 'Worst DPD'];
        const allBranchRows: any[][] = [];
        const allStates = [...new Set(filteredAccounts.map(a => a.state))].sort();
        for (const st of allStates) {
          const stAccts = filteredAccounts.filter(a => a.state === st);
          const brMap = new Map<string, { branch: string; total: number; active: number; npl: number; nplCount: number; worstDpd: number }>();
          for (const a of stAccts) {
            const br = a.branch || 'Unknown';
            const e = brMap.get(br) || { branch: br, total: 0, active: 0, npl: 0, nplCount: 0, worstDpd: 0 };
            e.total++;
            e.active += a.outstandingBalance;
            if (a.dpd >= 90) { e.npl += a.outstandingBalance; e.nplCount++; }
            e.worstDpd = Math.max(e.worstDpd, a.dpd);
            brMap.set(br, e);
          }
          for (const e of brMap.values()) {
            const ratio = e.active > 0 ? e.npl / e.active : 0;
            allBranchRows.push([st, e.branch, e.total, e.active, e.npl, e.nplCount, ratio, e.worstDpd]);
          }
        }
        const wsBranch = XLSX.utils.aoa_to_sheet([branchHeaders, ...allBranchRows]);
        wsBranch['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
        branchHeaders.forEach((_, i) => {
          const cell = XLSX.utils.encode_cell({ r: 0, c: i });
          if (wsBranch[cell]) wsBranch[cell].s = { font: { bold: true } };
        });
        allBranchRows.forEach((row, ri) => {
          const r = ri + 1;
          [3, 4].forEach(col => {
            const cell = XLSX.utils.encode_cell({ r, c: col });
            if (wsBranch[cell]) wsBranch[cell].z = '₦#,##0.00';
          });
          const ratioCell = XLSX.utils.encode_cell({ r, c: 6 });
          if (wsBranch[ratioCell]) wsBranch[ratioCell].z = '0.0%';
        });
        XLSX.utils.book_append_sheet(wb, wsBranch, 'By Branch');

        // --- Sheet 4: Detailed NPL Accounts ---
        const detailHeaders = [
          'Employee ID', 'Beneficiary Name', 'State', 'Branch',
          'Principal Amount (₦)', 'Outstanding Balance (₦)', 'Days Past Due',
          'Classification', 'Last Payment Date', 'Amount in Arrears (₦)',
          'Monthly EMI (₦)', 'Disbursement Date', 'Termination Date',
        ];
        const detailRows = accountsList.map(a => {
          const bRec = beneficiaries.find(b => b.id === a.id);
          const classification = a.dpd >= 180 ? 'PAR 180+' : a.dpd >= 120 ? 'PAR 120+' : a.dpd >= 90 ? 'NPL (PAR 90+)' : a.dpd >= 60 ? 'PAR 60+' : a.dpd >= 30 ? 'PAR 30+' : 'Performing';
          return [
            a.employeeId, a.name, a.state, a.branch,
            a.loanAmount, a.outstandingBalance, a.dpd,
            classification,
            a.lastPaymentDate ? new Date(a.lastPaymentDate).toLocaleDateString('en-GB') : 'N/A',
            a.amountInArrears, a.monthlyEmi,
            bRec ? new Date(bRec.disbursement_date).toLocaleDateString('en-GB') : '',
            bRec ? new Date(bRec.termination_date).toLocaleDateString('en-GB') : '',
          ];
        });
        const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
        wsDetail['!cols'] = [
          { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 22 },
          { wch: 20 }, { wch: 20 }, { wch: 14 },
          { wch: 16 }, { wch: 16 }, { wch: 20 },
          { wch: 16 }, { wch: 16 }, { wch: 16 },
        ];
        detailHeaders.forEach((_, i) => {
          const cell = XLSX.utils.encode_cell({ r: 0, c: i });
          if (wsDetail[cell]) wsDetail[cell].s = { font: { bold: true } };
        });
        detailRows.forEach((row, ri) => {
          const r = ri + 1;
          [4, 5, 9, 10].forEach(col => {
            const cell = XLSX.utils.encode_cell({ r, c: col });
            if (wsDetail[cell]) wsDetail[cell].z = '₦#,##0.00';
          });
          // Red font for DPD > 90
          const dpdCell = XLSX.utils.encode_cell({ r, c: 6 });
          const dpdVal = row[6] as number;
          if (wsDetail[dpdCell] && dpdVal >= 90) {
            wsDetail[dpdCell].s = { font: { color: { rgb: 'CC0000' }, bold: true } };
          }
        });
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Detailed Accounts');

        // Determine file name based on current view
        let fileName: string;
        if (drillLevel === 'accounts' && selectedBranch) {
          fileName = `NPL_Report_${selectedState}_${selectedBranch}_${today}.xlsx`;
        } else if (drillLevel === 'branch' && selectedState) {
          fileName = `NPL_Report_By_State_${selectedState}_${today}.xlsx`;
        } else {
          fileName = `NPL_Report_Nigeria_${today}.xlsx`;
        }

        const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
      } finally {
        setExporting(false);
      }
    }, 100);
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
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}
            {exporting ? 'Preparing…' : 'Export to Excel'}
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

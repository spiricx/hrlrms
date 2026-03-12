import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import { formatCurrency } from '@/lib/loanCalculations';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import BatchDefaultsExport, { type BatchDefaultRecord } from './BatchDefaultsExport';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type LoanBatch = Tables<'loan_batches'>;

interface BatchStat {
  batchId: string;
  batchName: string;
  batchCode: string;
  state: string;
  branch: string;
  totalBeneficiaries: number;
  defaultCount: number;
  totalLoanAmount: number;
  totalOutstanding: number;
  totalPaid: number;
  totalArrearsAmount: number;
  avgMonthsInArrears: number;
  avgAgeOfArrears: number;
  nplAmount: number;
  nplCount: number;
  status: string;
  defaultingBeneficiaries: { beneficiary: Beneficiary; arrears: ReturnType<typeof getArrearsFromMap> }[];
}

export default function BatchDefaultsTab() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const navigate = useNavigate();
  const { map: arrearsMap, loading: arrearsLoading } = useArrearsLookup();

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [batches, setBatches] = useState<LoanBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState('');
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('profiles').select('full_name').eq('user_id', data.user.id).maybeSingle().then(({ data: p }) => {
        if (p?.full_name) setStaffName(p.full_name);
      });
    });
  }, []);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [bRows, batRows] = await Promise.all([
        fetchAllRows<Beneficiary>('beneficiaries', 'id, batch_id, name, loan_amount, outstanding_balance, total_paid, status, state, bank_branch, department, employee_id, nhf_number, loan_reference_number, tenor_months, monthly_emi, commencement_date'),
        fetchAllRows<LoanBatch>('loan_batches'),
      ]);
      setBeneficiaries(bRows);
      setBatches(batRows);
      setLoading(false);
    };
    fetch();
  }, []);

  const batchMap = useMemo(() => {
    const m = new Map<string, LoanBatch>();
    batches.forEach(b => m.set(b.id, b));
    return m;
  }, [batches]);

  const branchOptions = useMemo(() => {
    const filtered = stateFilter === 'all' ? batches : batches.filter(b => b.state === stateFilter);
    return [...new Set(filtered.map(b => b.bank_branch).filter(Boolean))].sort();
  }, [batches, stateFilter]);

  useEffect(() => { setBranchFilter('all'); }, [stateFilter]);

  const batchStats = useMemo(() => {
    if (arrearsLoading) return [];

    const groups = new Map<string, Beneficiary[]>();
    beneficiaries.forEach(b => {
      if (!b.batch_id) return;
      const arr = groups.get(b.batch_id) || [];
      arr.push(b);
      groups.set(b.batch_id, arr);
    });

    const stats: BatchStat[] = [];

    groups.forEach((bens, batchId) => {
      const batch = batchMap.get(batchId);
      if (!batch) return;

      let defaultCount = 0;
      let totalArrearsAmount = 0;
      let totalMonthsArrears = 0;
      let totalDaysArrears = 0;
      let nplAmount = 0;
      let nplCount = 0;
      const defaultingBeneficiaries: BatchStat['defaultingBeneficiaries'] = [];

      bens.forEach(b => {
        const arrears = getArrearsFromMap(arrearsMap, b.id);
        if (arrears.overdueMonths > 0 && b.status !== 'completed') {
          defaultCount++;
          totalArrearsAmount += arrears.arrearsAmount;
          totalMonthsArrears += arrears.arrearsMonths;
          totalDaysArrears += arrears.daysOverdue;
          defaultingBeneficiaries.push({ beneficiary: b, arrears });
          if (arrears.daysOverdue >= 90) {
            nplCount++;
            nplAmount += Number(b.outstanding_balance);
          }
        }
      });

      if (defaultCount === 0) return;

      if (stateFilter !== 'all' && batch.state !== stateFilter) return;
      if (branchFilter !== 'all' && batch.bank_branch !== branchFilter) return;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = batch.name.toLowerCase().includes(q) || batch.batch_code.toLowerCase().includes(q);
        if (!match) return;
      }

      stats.push({
        batchId,
        batchName: batch.name,
        batchCode: batch.batch_code,
        state: batch.state,
        branch: batch.bank_branch,
        totalBeneficiaries: bens.length,
        defaultCount,
        totalLoanAmount: bens.reduce((s, b) => s + Number(b.loan_amount), 0),
        totalOutstanding: bens.reduce((s, b) => s + Number(b.outstanding_balance), 0),
        totalPaid: bens.reduce((s, b) => s + Number(b.total_paid), 0),
        totalArrearsAmount,
        avgMonthsInArrears: defaultCount > 0 ? Math.round(totalMonthsArrears / defaultCount) : 0,
        avgAgeOfArrears: defaultCount > 0 ? Math.round(totalDaysArrears / defaultCount) : 0,
        nplAmount,
        nplCount,
        status: batch.status,
        defaultingBeneficiaries: defaultingBeneficiaries.sort((a, b) => b.arrears.arrearsMonths - a.arrears.arrearsMonths),
      });
    });

    return stats.sort((a, b) => b.totalArrearsAmount - a.totalArrearsAmount);
  }, [beneficiaries, batches, batchMap, arrearsMap, arrearsLoading, stateFilter, branchFilter, searchQuery]);

  const exportRecords: BatchDefaultRecord[] = useMemo(() =>
    batchStats.map(s => ({
      batchName: s.batchName,
      batchCode: s.batchCode,
      state: s.state,
      branch: s.branch,
      totalBeneficiaries: s.totalBeneficiaries,
      defaultCount: s.defaultCount,
      totalLoanAmount: s.totalLoanAmount,
      totalOutstanding: s.totalOutstanding,
      totalPaid: s.totalPaid,
      totalArrearsAmount: s.totalArrearsAmount,
      avgMonthsInArrears: s.avgMonthsInArrears,
      avgAgeOfArrears: s.avgAgeOfArrears,
      status: s.status,
    })),
  [batchStats]);

  const totalNplAmount = batchStats.reduce((s, b) => s + b.nplAmount, 0);
  const totalDefaultCount = batchStats.reduce((s, b) => s + b.defaultCount, 0);
  const totalNplCount = batchStats.reduce((s, b) => s + b.nplCount, 0);

  const isLoading = loading || arrearsLoading;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <BatchDefaultsExport records={exportRecords} staffName={staffName} filters={{ state: stateFilter, branch: branchFilter }} />
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Filters</h3>
        <div className="flex flex-wrap gap-3 items-end">
          {isAdmin && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">State</label>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All States" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Branch</label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branchOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search Batches</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Batch name or code..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-56" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Batches with Defaults</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{batchStats.length.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Defaulting Accounts</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{totalDefaultCount.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Arrears Amount</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{formatCurrency(batchStats.reduce((s, b) => s + b.totalArrearsAmount, 0))}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">NPL Amount</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{formatCurrency(totalNplAmount)}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">NPL Ratio</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">
            {(() => {
              const totalActiveOutstanding = beneficiaries
                .filter(b => b.status !== 'completed' && Number(b.outstanding_balance) >= 0.01)
                .reduce((s, b) => s + Number(b.outstanding_balance), 0);
              const nplOutstanding = beneficiaries
                .filter(b => b.status !== 'completed' && Number(b.outstanding_balance) >= 0.01)
                .filter(b => { const a = getArrearsFromMap(arrearsMap, b.id); return a.daysOverdue >= 90; })
                .reduce((s, b) => s + Number(b.outstanding_balance), 0);
              return totalActiveOutstanding > 0 ? ((nplOutstanding / totalActiveOutstanding) * 100).toFixed(2) : '0.00';
            })()}%
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Batch Default Records ({batchStats.length.toLocaleString()})
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center animate-pulse">Loading...</p>
        ) : batchStats.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No batches with defaults found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-12">S/N</TableHead>
                  <TableHead>Batch Name</TableHead>
                  <TableHead>Batch Code</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-center">Beneficiaries</TableHead>
                  <TableHead className="text-center">Defaults</TableHead>
                  <TableHead className="text-right">Total Loan Amt</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right text-success">Total Paid</TableHead>
                  <TableHead className="text-right">Arrears Amount</TableHead>
                  <TableHead className="text-center">Avg Mths Arrears</TableHead>
                  <TableHead className="text-center">Age of Arrears</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchStats.map((s, i) => (
                  <>
                    <TableRow
                      key={s.batchId}
                      className="hover:bg-primary/5 transition-all cursor-pointer"
                      onClick={() => setExpandedBatch(expandedBatch === s.batchId ? null : s.batchId)}
                    >
                      <TableCell className="px-2">
                        {expandedBatch === s.batchId
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{s.batchName}</TableCell>
                      <TableCell className="font-mono text-xs">{s.batchCode}</TableCell>
                      <TableCell>{s.state || '—'}</TableCell>
                      <TableCell>{s.branch || '—'}</TableCell>
                      <TableCell className="text-center">{s.totalBeneficiaries}</TableCell>
                      <TableCell className="text-center font-semibold text-destructive">{s.defaultCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.totalLoanAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.totalOutstanding)}</TableCell>
                      <TableCell className="text-right font-semibold text-success">{formatCurrency(s.totalPaid)}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatCurrency(s.totalArrearsAmount)}</TableCell>
                      <TableCell className="text-center font-semibold text-destructive">{s.avgMonthsInArrears}</TableCell>
                      <TableCell className="text-center font-semibold text-destructive">{s.avgAgeOfArrears} days</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expandedBatch === s.batchId && (
                      <TableRow key={`${s.batchId}-expanded`}>
                        <TableCell colSpan={15} className="p-0">
                          <div className="bg-muted/30 border-l-4 border-primary/30 px-6 py-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              Defaulting Beneficiaries in {s.batchName} ({s.defaultCount})
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">S/N</TableHead>
                                  <TableHead className="text-xs">Name</TableHead>
                                  <TableHead className="text-xs">Organization</TableHead>
                                  <TableHead className="text-xs">NHF No</TableHead>
                                  <TableHead className="text-xs text-right">Loan Amount</TableHead>
                                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                                  <TableHead className="text-xs text-right text-success">Total Paid</TableHead>
                                  <TableHead className="text-xs text-center">Mths Arrears</TableHead>
                                  <TableHead className="text-xs text-center">Age of Arrears</TableHead>
                                  <TableHead className="text-xs text-right">Amt in Arrears</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {s.defaultingBeneficiaries.map((d, j) => (
                                  <TableRow
                                    key={d.beneficiary.id}
                                    className="hover:bg-primary/5 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/beneficiary/${d.beneficiary.id}`); }}
                                  >
                                    <TableCell className="text-xs text-muted-foreground">{j + 1}</TableCell>
                                    <TableCell className="text-xs font-medium">{d.beneficiary.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{d.beneficiary.department || '—'}</TableCell>
                                    <TableCell className="text-xs">{d.beneficiary.nhf_number || d.beneficiary.employee_id}</TableCell>
                                    <TableCell className="text-xs text-right">{formatCurrency(d.beneficiary.loan_amount)}</TableCell>
                                    <TableCell className="text-xs text-right">{formatCurrency(d.beneficiary.outstanding_balance)}</TableCell>
                                    <TableCell className="text-xs text-right font-semibold text-success">{formatCurrency(d.beneficiary.total_paid)}</TableCell>
                                    <TableCell className="text-xs text-center font-semibold text-destructive">{d.arrears.arrearsMonths}</TableCell>
                                    <TableCell className="text-xs text-center font-semibold text-destructive">{d.arrears.daysOverdue} days</TableCell>
                                    <TableCell className="text-xs text-right font-semibold text-destructive">{formatCurrency(d.arrears.arrearsAmount)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

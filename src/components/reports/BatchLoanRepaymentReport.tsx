import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import BatchRepaymentReportExportButtons, { type BatchRepaymentReportData } from '@/components/reports/BatchRepaymentReportExport';
import type { Tables } from '@/integrations/supabase/types';

type BatchRepayment = Tables<'batch_repayments'>;
type LoanBatch = Tables<'loan_batches'>;

interface EnrichedBatchRepayment extends BatchRepayment {
  batch_name: string;
  batch_code: string;
  batch_state: string;
  batch_branch: string;
  batch_status: string;
}

export default function BatchLoanRepaymentReport() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole('admin');

  const [batchRepayments, setBatchRepayments] = useState<BatchRepayment[]>([]);
  const [batches, setBatches] = useState<LoanBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState('');

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromDateObj, setFromDateObj] = useState<Date | undefined>();
  const [toDateObj, setToDateObj] = useState<Date | undefined>();
  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch staff name
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.full_name) setStaffName(data.full_name);
    });
  }, [user]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [brRes, bRes] = await Promise.all([
        supabase.from('batch_repayments').select('*').order('payment_date', { ascending: false }),
        supabase.from('loan_batches').select('*'),
      ]);
      if (brRes.data) setBatchRepayments(brRes.data);
      if (bRes.data) setBatches(bRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Build batch lookup
  const batchMap = useMemo(() => {
    const map = new Map<string, LoanBatch>();
    batches.forEach(b => map.set(b.id, b));
    return map;
  }, [batches]);

  // Derive filter options
  const batchBranches = useMemo(() => {
    const filtered = stateFilter === 'all' ? batches : batches.filter(b => b.state === stateFilter);
    return [...new Set(filtered.map(b => b.bank_branch).filter(Boolean))].sort();
  }, [batches, stateFilter]);

  const batchNames = useMemo(() => {
    let filtered = batches;
    if (stateFilter !== 'all') filtered = filtered.filter(b => b.state === stateFilter);
    if (branchFilter !== 'all') filtered = filtered.filter(b => b.bank_branch === branchFilter);
    return filtered.map(b => ({ id: b.id, name: b.name, code: b.batch_code })).sort((a, b) => a.name.localeCompare(b.name));
  }, [batches, stateFilter, branchFilter]);

  // Reset dependent filters
  useEffect(() => { setBranchFilter('all'); setBatchFilter('all'); }, [stateFilter]);
  useEffect(() => { setBatchFilter('all'); }, [branchFilter]);

  // Enriched & filtered records
  const filteredRecords = useMemo(() => {
    const records: EnrichedBatchRepayment[] = [];

    batchRepayments.forEach(br => {
      const batch = batchMap.get(br.batch_id);
      if (!batch) return;

      // Date filter
      if (fromDate && br.payment_date < fromDate) return;
      if (toDate && br.payment_date > toDate) return;

      // Dimension filters
      if (stateFilter !== 'all' && batch.state !== stateFilter) return;
      if (branchFilter !== 'all' && batch.bank_branch !== branchFilter) return;
      if (batchFilter !== 'all' && batch.id !== batchFilter) return;

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = batch.name.toLowerCase().includes(q) ||
          batch.batch_code.toLowerCase().includes(q) ||
          br.rrr_number.toLowerCase().includes(q);
        if (!match) return;
      }

      records.push({
        ...br,
        batch_name: batch.name,
        batch_code: batch.batch_code,
        batch_state: batch.state,
        batch_branch: batch.bank_branch,
        batch_status: batch.status,
      });
    });

    return records;
  }, [batchRepayments, batchMap, fromDate, toDate, stateFilter, branchFilter, batchFilter, searchQuery]);

  // Aggregations
  const summary = useMemo(() => {
    const uniqueBatches = new Set(filteredRecords.map(r => r.batch_id));
    let totalExpected = 0;
    let totalActual = 0;

    const stateAgg = new Map<string, { count: number; amount: number }>();
    const branchAgg = new Map<string, { count: number; amount: number }>();
    const batchAgg = new Map<string, { count: number; amount: number; name: string }>();

    filteredRecords.forEach(r => {
      totalExpected += Number(r.expected_amount);
      totalActual += Number(r.actual_amount);

      const sEntry = stateAgg.get(r.batch_state) || { count: 0, amount: 0 };
      sEntry.count++; sEntry.amount += Number(r.actual_amount);
      stateAgg.set(r.batch_state, sEntry);

      const bEntry = branchAgg.get(r.batch_branch) || { count: 0, amount: 0 };
      bEntry.count++; bEntry.amount += Number(r.actual_amount);
      branchAgg.set(r.batch_branch, bEntry);

      const btEntry = batchAgg.get(r.batch_id) || { count: 0, amount: 0, name: r.batch_name };
      btEntry.count++; btEntry.amount += Number(r.actual_amount);
      batchAgg.set(r.batch_id, btEntry);
    });

    return {
      totalRecords: filteredRecords.length,
      uniqueBatches: uniqueBatches.size,
      totalExpected,
      totalActual,
      variance: totalActual - totalExpected,
      stateBreakdown: [...stateAgg.entries()].map(([state, v]) => ({ state, ...v })).sort((a, b) => b.amount - a.amount),
      branchBreakdown: [...branchAgg.entries()].map(([branch, v]) => ({ branch, ...v })).sort((a, b) => b.amount - a.amount),
      batchBreakdown: [...batchAgg.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount),
    };
  }, [filteredRecords]);

  // Build export data
  const reportData: BatchRepaymentReportData = useMemo(() => ({
    records: filteredRecords.map(r => ({
      batchName: r.batch_name,
      batchCode: r.batch_code,
      state: r.batch_state,
      branch: r.batch_branch,
      rrrNumber: r.rrr_number,
      paymentDate: r.payment_date,
      monthFor: r.month_for,
      expectedAmount: Number(r.expected_amount),
      actualAmount: Number(r.actual_amount),
      variance: Number(r.actual_amount) - Number(r.expected_amount),
      notes: r.notes || '',
      batchStatus: r.batch_status,
    })),
    filters: { fromDate, toDate, state: stateFilter, branch: branchFilter, batch: batchFilter },
    staffName: staffName || 'N/A',
    totalRecords: summary.totalRecords,
    uniqueBatches: summary.uniqueBatches,
    totalExpected: summary.totalExpected,
    totalActual: summary.totalActual,
    variance: summary.variance,
    stateBreakdown: summary.stateBreakdown,
    branchBreakdown: summary.branchBreakdown,
    batchBreakdown: summary.batchBreakdown,
  }), [filteredRecords, fromDate, toDate, stateFilter, branchFilter, batchFilter, staffName, summary]);

  return (
    <div className="space-y-6">
      {/* Export Buttons */}
      <div className="flex justify-end">
        <BatchRepaymentReportExportButtons data={reportData} />
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Filters</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <DateRangeFilter
            fromDate={fromDateObj}
            toDate={toDateObj}
            onFromDateChange={(d) => { setFromDateObj(d); setFromDate(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''); }}
            onToDateChange={(d) => { setToDateObj(d); setToDate(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''); }}
          />
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
                {batchBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Batch</label>
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Batches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {batchNames.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Batch name, code, RRR..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-48" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Records</p>
          <p className="mt-1 text-2xl font-bold font-display">{summary.totalRecords.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Batches</p>
          <p className="mt-1 text-2xl font-bold font-display">{summary.uniqueBatches.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Collected</p>
          <p className="mt-1 text-2xl font-bold font-display text-success">{formatCurrency(summary.totalActual)}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Variance (Actual − Expected)</p>
          <p className={`mt-1 text-2xl font-bold font-display ${summary.variance < 0 ? 'text-destructive' : 'text-success'}`}>
            {formatCurrency(summary.variance)}
          </p>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* By State */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">By State</h3>
          {summary.stateBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {summary.stateBreakdown.map(s => (
                <div key={s.state} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium">{s.state || '—'}</span>
                  <div className="text-right">
                    <span className="text-muted-foreground mr-3">{s.count} txns</span>
                    <span className="font-semibold">{formatCurrency(s.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Branch */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">By Branch</h3>
          {summary.branchBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {summary.branchBreakdown.map(b => (
                <div key={b.branch} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium">{b.branch || '—'}</span>
                  <div className="text-right">
                    <span className="text-muted-foreground mr-3">{b.count} txns</span>
                    <span className="font-semibold">{formatCurrency(b.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Batch */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">By Batch</h3>
          {summary.batchBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {summary.batchBreakdown.map(b => (
                <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium truncate mr-2">{b.name}</span>
                  <div className="text-right whitespace-nowrap">
                    <span className="text-muted-foreground mr-3">{b.count} txns</span>
                    <span className="font-semibold">{formatCurrency(b.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Batch Repayment Records ({filteredRecords.length.toLocaleString()})
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center animate-pulse">Loading...</p>
        ) : filteredRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No batch repayment records found for the selected criteria.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">S/N</TableHead>
                  <TableHead>Batch Name</TableHead>
                  <TableHead>Batch Code</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>RRR Number</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-center">Month</TableHead>
                  <TableHead className="text-right">Expected Amount</TableHead>
                  <TableHead className="text-right">Actual Amount</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Batch Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 500).map((r, i) => {
                  const variance = Number(r.actual_amount) - Number(r.expected_amount);
                  return (
                    <TableRow
                      key={r.id}
                      className="hover:bg-primary/5 transition-all"
                    >
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.batch_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.batch_code}</TableCell>
                      <TableCell>{r.batch_state || '—'}</TableCell>
                      <TableCell>{r.batch_branch || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.rrr_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(new Date(r.payment_date))}</TableCell>
                      <TableCell className="text-center">{r.month_for}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(r.expected_amount))}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(r.actual_amount))}</TableCell>
                      <TableCell className={`text-right ${variance < 0 ? 'text-destructive font-semibold' : variance > 0 ? 'text-success font-semibold' : ''}`}>
                        {formatCurrency(variance)}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{r.notes || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.batch_status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}>
                          {r.batch_status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredRecords.length > 500 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Showing 500 of {filteredRecords.length.toLocaleString()} records. Export to view all.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

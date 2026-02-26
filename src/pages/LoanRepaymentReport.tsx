import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, formatTenor } from '@/lib/loanCalculations';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DateRangeFilter from '@/components/DateRangeFilter';
import LoanRepaymentReportExportButtons, {
  type RepaymentRecord,
  type RepaymentReportData,
} from '@/components/reports/LoanRepaymentReportExport';
import BatchLoanRepaymentReport from '@/components/reports/BatchLoanRepaymentReport';
import type { Tables } from '@/integrations/supabase/types';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useStarredBeneficiaries } from '@/hooks/useStarredBeneficiaries';
import StarButton from '@/components/StarButton';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

export default function LoanRepaymentReport() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole('admin');

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState('');

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromDateObj, setFromDateObj] = useState<Date | undefined>();
  const [toDateObj, setToDateObj] = useState<Date | undefined>();
  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.full_name) setStaffName(data.full_name);
    });
  }, [user]);

  const { map: arrearsMap } = useArrearsLookup();
  const { isStarred, toggle: toggleStar } = useStarredBeneficiaries();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [beneficiaryRows, transactionRows] = await Promise.all([
        fetchAllRows<Beneficiary>('beneficiaries'),
        fetchAllRows<Transaction>('transactions', '*', { orderBy: 'date_paid', ascending: false }),
      ]);

      setBeneficiaries(beneficiaryRows);
      setTransactions(transactionRows);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Build a lookup map for beneficiaries
  const beneficiaryMap = useMemo(() => {
    const map = new Map<string, Beneficiary>();
    beneficiaries.forEach(b => map.set(b.id, b));
    return map;
  }, [beneficiaries]);

  // Derive filter options from data
  const branches = useMemo(() => [...new Set(beneficiaries.map(b => b.bank_branch).filter(Boolean))].sort(), [beneficiaries]);
  const organisations = useMemo(() => [...new Set(beneficiaries.map(b => b.department).filter(Boolean))].sort(), [beneficiaries]);

  const filteredBranches = useMemo(() => {
    if (stateFilter === 'all') return branches;
    return [...new Set(beneficiaries.filter(b => b.state === stateFilter).map(b => b.bank_branch).filter(Boolean))].sort();
  }, [beneficiaries, stateFilter, branches]);

  // Reset branch when state changes
  useEffect(() => { setBranchFilter('all'); }, [stateFilter]);

  // Filtered records
  // Compute per-beneficiary cumulative payments and last repayment amounts
  const beneficiaryCumulativeMap = useMemo(() => {
    const map = new Map<string, { cumulative: number; lastAmount: number }>();
    // Sort transactions by date ascending for cumulative
    const sorted = [...transactions].sort((a, b) => a.date_paid.localeCompare(b.date_paid));
    sorted.forEach(t => {
      const prev = map.get(t.beneficiary_id) || { cumulative: 0, lastAmount: 0 };
      prev.cumulative += Number(t.amount);
      prev.lastAmount = Number(t.amount);
      map.set(t.beneficiary_id, { ...prev });
    });
    return map;
  }, [transactions]);

  // Build running cumulative per beneficiary as we iterate
  const filteredRecords = useMemo(() => {
    const records: RepaymentRecord[] = [];
    // Sort transactions by date for proper cumulative tracking
    const sortedTxns = [...transactions].sort((a, b) => a.date_paid.localeCompare(b.date_paid));
    const runningCumulative = new Map<string, number>();

    sortedTxns.forEach(t => {
      const b = beneficiaryMap.get(t.beneficiary_id);
      if (!b) return;

      // Date filter
      if (fromDate && t.date_paid < fromDate) return;
      if (toDate && t.date_paid > toDate) return;

      // Dimension filters
      if (stateFilter !== 'all' && b.state !== stateFilter) return;
      if (branchFilter !== 'all' && b.bank_branch !== branchFilter) return;
      if (orgFilter !== 'all' && b.department !== orgFilter) return;

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = b.name.toLowerCase().includes(q) ||
          b.employee_id.toLowerCase().includes(q) ||
          (b.loan_reference_number || '').toLowerCase().includes(q) ||
          t.rrr_number.toLowerCase().includes(q);
        if (!match) return;
      }

      // Running cumulative
      const prevCum = runningCumulative.get(t.beneficiary_id) || 0;
      const newCum = prevCum + Number(t.amount);
      runningCumulative.set(t.beneficiary_id, newCum);

      // Use Golden Record for overdue/arrears metrics
      const arrData = getArrearsFromMap(arrearsMap, b.id);

      // Expected repayment from Golden Record
      const expectedRepayment = arrData.monthsDue * Number(b.monthly_emi);

      // Last repayment amount for this beneficiary
      const benCum = beneficiaryCumulativeMap.get(b.id);

      records.push({
        beneficiaryId: b.id,
        beneficiaryName: b.name,
        employeeId: b.employee_id,
        loanRef: b.loan_reference_number || '',
        nhfNumber: b.nhf_number || '',
        organisation: b.department,
        state: b.state,
        branch: b.bank_branch,
        loanAmount: Number(b.loan_amount),
        monthlyEmi: Number(b.monthly_emi),
        totalPaid: Number(b.total_paid),
        outstandingBalance: Number(b.outstanding_balance),
        tenorMonths: b.tenor_months,
        disbursementDate: b.disbursement_date,
        commencementDate: b.commencement_date,
        status: b.status,
        expectedRepayment,
        cumulativePayment: newCum,
        lastRepaymentAmount: benCum?.lastAmount || 0,
        overdueAmount: arrData.overdueAmount,
        monthsOverdue: arrData.overdueMonths,
        arrearsAmount: arrData.arrearsAmount,
        monthsInArrears: arrData.arrearsMonths,
        rrrNumber: t.rrr_number,
        datePaid: t.date_paid,
        amount: Number(t.amount),
        monthFor: t.month_for,
      });
    });

    return records;
  }, [transactions, beneficiaryMap, beneficiaryCumulativeMap, arrearsMap, fromDate, toDate, stateFilter, branchFilter, orgFilter, searchQuery]);

  // Aggregations
  const reportData: RepaymentReportData = useMemo(() => {
    const uniqueBeneficiaryIds = new Set(filteredRecords.map(r => r.employeeId));

    // State breakdown
    const stateAgg = new Map<string, { count: number; amount: number }>();
    const branchAgg = new Map<string, { count: number; amount: number }>();
    const orgAgg = new Map<string, { count: number; amount: number }>();

    let totalCollected = 0;
    const outstandingSet = new Map<string, number>();

    filteredRecords.forEach(r => {
      totalCollected += r.amount;
      outstandingSet.set(r.employeeId, r.outstandingBalance);

      const sEntry = stateAgg.get(r.state) || { count: 0, amount: 0 };
      sEntry.count++; sEntry.amount += r.amount;
      stateAgg.set(r.state, sEntry);

      const bEntry = branchAgg.get(r.branch) || { count: 0, amount: 0 };
      bEntry.count++; bEntry.amount += r.amount;
      branchAgg.set(r.branch, bEntry);

      const oEntry = orgAgg.get(r.organisation) || { count: 0, amount: 0 };
      oEntry.count++; oEntry.amount += r.amount;
      orgAgg.set(r.organisation, oEntry);
    });

    const totalOutstanding = [...outstandingSet.values()].reduce((s, v) => s + v, 0);

    return {
      records: filteredRecords,
      filters: { fromDate, toDate, state: stateFilter, branch: branchFilter, organisation: orgFilter },
      staffName: staffName || 'N/A',
      totalRepayments: filteredRecords.length,
      totalAmountCollected: totalCollected,
      totalOutstanding,
      uniqueBeneficiaries: uniqueBeneficiaryIds.size,
      stateBreakdown: [...stateAgg.entries()].map(([state, v]) => ({ state, ...v })).sort((a, b) => b.amount - a.amount),
      branchBreakdown: [...branchAgg.entries()].map(([branch, v]) => ({ branch, ...v })).sort((a, b) => b.amount - a.amount),
      orgBreakdown: [...orgAgg.entries()].map(([organisation, v]) => ({ organisation, ...v })).sort((a, b) => b.amount - a.amount),
    };
  }, [filteredRecords, fromDate, toDate, stateFilter, branchFilter, orgFilter, staffName]);

  const statusColor = (s: string) => {
    if (s === 'active') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (s === 'completed') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display">Loan Repayment Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Comprehensive repayment records by date, state, branch & organisation</p>
        </div>
      </div>

      <Tabs defaultValue="individual" className="space-y-6">
        <TabsList>
          <TabsTrigger value="individual">Loan Repayment Report</TabsTrigger>
          <TabsTrigger value="batch">Batch Loan Repayment Report</TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="space-y-6">
          <div className="flex justify-end">
            <LoanRepaymentReportExportButtons data={reportData} />
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
                {filteredBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Organisation</label>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Organisations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organisations</SelectItem>
                {organisations.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Name, ID, RRR..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-48" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Transactions</p>
          <p className="mt-1 text-2xl font-bold font-display">{reportData.totalRepayments.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Beneficiaries</p>
          <p className="mt-1 text-2xl font-bold font-display">{reportData.uniqueBeneficiaries.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Collected</p>
          <p className="mt-1 text-2xl font-bold font-display text-success">{formatCurrency(reportData.totalAmountCollected)}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding Balance</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{formatCurrency(reportData.totalOutstanding)}</p>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* By State */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">By State</h3>
          {reportData.stateBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {reportData.stateBreakdown.map(s => (
                <div key={s.state} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium">{s.state}</span>
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
          {reportData.branchBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {reportData.branchBreakdown.map(b => (
                <div key={b.branch} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium">{b.branch}</span>
                  <div className="text-right">
                    <span className="text-muted-foreground mr-3">{b.count} txns</span>
                    <span className="font-semibold">{formatCurrency(b.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Organisation */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">By Organisation</h3>
          {reportData.orgBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {reportData.orgBreakdown.map(o => (
                <div key={o.organisation} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-medium truncate mr-2">{o.organisation}</span>
                  <div className="text-right whitespace-nowrap">
                    <span className="text-muted-foreground mr-3">{o.count} txns</span>
                    <span className="font-semibold">{formatCurrency(o.amount)}</span>
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
          Repayment Records ({filteredRecords.length.toLocaleString()})
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center animate-pulse">Loading...</p>
        ) : filteredRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No repayment records found for the selected criteria.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">★</TableHead>
                  <TableHead className="w-12">S/N</TableHead>
                  <TableHead>Beneficiary</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Loan Amount</TableHead>
                  <TableHead className="text-center">Tenor</TableHead>
                  <TableHead className="text-right">Monthly Repayment</TableHead>
                  <TableHead className="text-right">Expected Repayment</TableHead>
                  <TableHead>RRR</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-center">Period</TableHead>
                  <TableHead className="text-right">Amount Paid</TableHead>
                  <TableHead className="text-right">Cumulative Payment</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Last Repay Amt</TableHead>
                  <TableHead className="text-right">Overdue Amt</TableHead>
                  <TableHead className="text-center">Mths Overdue</TableHead>
                  <TableHead className="text-right">Arrears Amt</TableHead>
                  <TableHead className="text-center">Mths in Arrears</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 500).map((r, i) => (
                  <TableRow
                    key={`${r.rrrNumber}-${r.datePaid}-${i}`}
                    className="cursor-pointer hover:border-l-[3px] hover:border-l-primary hover:bg-primary/5 transition-all"
                    onClick={() => navigate(`/beneficiary/${r.beneficiaryId}`)}
                  >
                    <TableCell className="text-center">
                      <StarButton isStarred={isStarred(r.beneficiaryId)} onToggle={() => toggleStar(r.beneficiaryId)} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium text-primary underline-offset-2 hover:underline whitespace-nowrap">{r.beneficiaryName}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{r.organisation}</TableCell>
                    <TableCell>{r.state}</TableCell>
                    <TableCell>{r.branch}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.loanAmount)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">{formatTenor(r.tenorMonths)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.monthlyEmi)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.expectedRepayment)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.rrrNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(new Date(r.datePaid))}</TableCell>
                    <TableCell className="text-center">{r.monthFor}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(r.amount)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(r.cumulativePayment)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.outstandingBalance)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.lastRepaymentAmount)}</TableCell>
                    <TableCell className={`text-right ${r.overdueAmount > 0 ? 'text-destructive font-semibold' : ''}`}>{formatCurrency(r.overdueAmount)}</TableCell>
                    <TableCell className={`text-center ${r.monthsOverdue > 0 ? 'text-destructive font-semibold' : ''}`}>{r.monthsOverdue}</TableCell>
                    <TableCell className={`text-right ${r.arrearsAmount > 0 ? 'text-destructive font-semibold' : ''}`}>{formatCurrency(r.arrearsAmount)}</TableCell>
                    <TableCell className={`text-center ${r.monthsInArrears > 0 ? 'text-destructive font-semibold' : ''}`}>{r.monthsInArrears}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(r.status)}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
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
        </TabsContent>

        <TabsContent value="batch">
          <BatchLoanRepaymentReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

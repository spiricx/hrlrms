import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import IndividualDefaultsExport, { type IndividualDefaultRecord } from './IndividualDefaultsExport';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

export default function IndividualDefaultsTab() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { map: arrearsMap, loading: arrearsLoading } = useArrearsLookup();

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState('');

  // Filters
  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDateObj, setFromDateObj] = useState<Date | undefined>();
  const [toDateObj, setToDateObj] = useState<Date | undefined>();

  // Fetch staff name
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('profiles').select('full_name').eq('user_id', data.user.id).maybeSingle().then(({ data: p }) => {
        if (p?.full_name) setStaffName(p.full_name);
      });
    });
  }, []);

  // Fetch data
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [bRows, tRows] = await Promise.all([
        fetchAllRows<Beneficiary>('beneficiaries'),
        fetchAllRows<Transaction>('transactions', '*', { orderBy: 'date_paid', ascending: false }),
      ]);
      setBeneficiaries(bRows);
      setTransactions(tRows);
      setLoading(false);
    };
    fetch();
  }, []);

  // Last payment lookup
  const lastPaymentMap = useMemo(() => {
    const m = new Map<string, { amount: number; date: string }>();
    transactions.forEach(t => {
      if (!m.has(t.beneficiary_id)) {
        m.set(t.beneficiary_id, { amount: t.amount, date: t.date_paid });
      }
    });
    return m;
  }, [transactions]);

  // Branches derived from beneficiaries filtered by state
  const branches = useMemo(() => {
    const filtered = stateFilter === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === stateFilter);
    return [...new Set(filtered.map(b => b.bank_branch).filter(Boolean))].sort();
  }, [beneficiaries, stateFilter]);

  // Reset branch when state changes
  useEffect(() => { setBranchFilter('all'); }, [stateFilter]);

  // Filter to defaults only (overdue_months > 0 from arrears view)
  const defaultRecords = useMemo(() => {
    if (arrearsLoading) return [];

    return beneficiaries
      .filter(b => {
        const arrears = getArrearsFromMap(arrearsMap, b.id);
        // Only include accounts in default (has overdue months)
        if (arrears.overdueMonths <= 0) return false;
        if (b.status === 'completed') return false;

        // State filter
        if (stateFilter !== 'all' && b.state !== stateFilter) return false;
        // Branch filter
        if (branchFilter !== 'all' && b.bank_branch !== branchFilter) return false;

        // Date filter on commencement_date
        if (fromDateObj) {
          const cd = new Date(b.commencement_date);
          if (cd < fromDateObj) return false;
        }
        if (toDateObj) {
          const cd = new Date(b.commencement_date);
          if (cd > toDateObj) return false;
        }

        // Search
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const match =
            b.name.toLowerCase().includes(q) ||
            b.employee_id.toLowerCase().includes(q) ||
            (b.nhf_number || '').toLowerCase().includes(q) ||
            (b.loan_reference_number || '').toLowerCase().includes(q) ||
            b.department.toLowerCase().includes(q) ||
            b.state.toLowerCase().includes(q) ||
            b.bank_branch.toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      })
      .map(b => {
        const arrears = getArrearsFromMap(arrearsMap, b.id);
        const lastPmt = lastPaymentMap.get(b.id);
        return { beneficiary: b, arrears, lastPmt };
      })
      .sort((a, b) => b.arrears.arrearsMonths - a.arrears.arrearsMonths);
  }, [beneficiaries, arrearsMap, arrearsLoading, stateFilter, branchFilter, searchQuery, fromDateObj, toDateObj, lastPaymentMap]);

  // Build export data
  const exportRecords: IndividualDefaultRecord[] = useMemo(() =>
    defaultRecords.map(r => ({
      name: r.beneficiary.name,
      organization: r.beneficiary.department,
      loanRefNo: r.beneficiary.loan_reference_number || '',
      nhfNo: r.beneficiary.nhf_number || r.beneficiary.employee_id,
      state: r.beneficiary.state,
      branch: r.beneficiary.bank_branch,
      tenor: r.beneficiary.tenor_months,
      loanAmount: r.beneficiary.loan_amount,
      monthlyRepayment: r.beneficiary.monthly_emi,
      outstanding: r.beneficiary.outstanding_balance,
      totalPaid: r.beneficiary.total_paid,
      lastPmtAmt: r.lastPmt?.amount ?? 0,
      lastPmtDate: r.lastPmt?.date ?? null,
      ageOfArrears: r.arrears.daysOverdue,
      monthsInArrears: r.arrears.arrearsMonths,
      amtInArrears: r.arrears.arrearsAmount,
      status: r.beneficiary.status,
    })),
  [defaultRecords]);

  const isLoading = loading || arrearsLoading;

  return (
    <div className="space-y-5">
      {/* Export Buttons */}
      <div className="flex justify-end">
        <IndividualDefaultsExport records={exportRecords} staffName={staffName} filters={{ state: stateFilter, branch: branchFilter }} />
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Filters</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <DateRangeFilter
            fromDate={fromDateObj}
            toDate={toDateObj}
            onFromDateChange={setFromDateObj}
            onToDateChange={setToDateObj}
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
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Name, NHF No, Loan Ref..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-56" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Accounts in Default</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{defaultRecords.length.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Outstanding</p>
          <p className="mt-1 text-2xl font-bold font-display">{formatCurrency(defaultRecords.reduce((s, r) => s + Number(r.beneficiary.outstanding_balance), 0))}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Arrears Amount</p>
          <p className="mt-1 text-2xl font-bold font-display text-destructive">{formatCurrency(defaultRecords.reduce((s, r) => s + r.arrears.arrearsAmount, 0))}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Individual Default Records ({defaultRecords.length.toLocaleString()})
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center animate-pulse">Loading...</p>
        ) : defaultRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No individual accounts in default found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">S/N</TableHead>
                  <TableHead>Beneficiary</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Loan Ref No</TableHead>
                  <TableHead>NHF No</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-center">Tenor</TableHead>
                  <TableHead className="text-right">Loan Amount</TableHead>
                  <TableHead className="text-right">Monthly Repayment</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right text-success">Total Paid</TableHead>
                  <TableHead className="text-right">Last Pmt Amt</TableHead>
                  <TableHead>Last Pmt Date</TableHead>
                  <TableHead className="text-center">Age of Arrears</TableHead>
                  <TableHead className="text-center">Mths Arrears</TableHead>
                  <TableHead className="text-right">Amt in Arrears</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defaultRecords.slice(0, 500).map((r, i) => (
                  <TableRow key={r.beneficiary.id} className="hover:bg-primary/5 transition-all">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.beneficiary.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.beneficiary.department || '—'}</TableCell>
                    <TableCell className="text-xs">{r.beneficiary.loan_reference_number || '—'}</TableCell>
                    <TableCell className="text-xs">{r.beneficiary.nhf_number || r.beneficiary.employee_id}</TableCell>
                    <TableCell>{r.beneficiary.state || '—'}</TableCell>
                    <TableCell>{r.beneficiary.bank_branch || '—'}</TableCell>
                    <TableCell className="text-center">{r.beneficiary.tenor_months}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.beneficiary.loan_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.beneficiary.monthly_emi)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.beneficiary.outstanding_balance)}</TableCell>
                    <TableCell className="text-right font-semibold text-success">{formatCurrency(r.beneficiary.total_paid)}</TableCell>
                    <TableCell className="text-right">{r.lastPmt ? formatCurrency(r.lastPmt.amount) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.lastPmt ? formatDate(new Date(r.lastPmt.date)) : '—'}</TableCell>
                    <TableCell className="text-center font-semibold text-destructive">{r.arrears.daysOverdue} days</TableCell>
                    <TableCell className="text-center font-semibold text-destructive">{r.arrears.arrearsMonths}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">{formatCurrency(r.arrears.arrearsAmount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        {r.beneficiary.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {defaultRecords.length > 500 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Showing 500 of {defaultRecords.length.toLocaleString()} records. Export to view all.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

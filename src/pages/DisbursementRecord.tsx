import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileBarChart } from 'lucide-react';
import { formatCurrency, formatTenor } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import { NG_DATE } from '@/lib/dateFormat';
import { useAuth } from '@/contexts/AuthContext';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import DateRangeFilter from '@/components/DateRangeFilter';
import StatusBadge from '@/components/StatusBadge';
import DisbursementRecordExport from '@/components/disbursement/DisbursementRecordExport';
import { fetchAllRows } from '@/lib/fetchAllRows';

interface LoanBatch {
  id: string;
  name: string;
  batch_code: string;
  state: string;
  bank_branch: string;
}

interface Beneficiary {
  id: string;
  name: string;
  loan_amount: number;
  monthly_emi: number;
  outstanding_balance: number;
  total_paid: number;
  tenor_months: number;
  disbursement_date: string;
  status: string;
  batch_id: string | null;
  default_count: number;
  department: string;
}

interface Transaction {
  beneficiary_id: string;
  amount: number;
  date_paid: string;
}

interface BatchSummary {
  batchId: string;
  batchName: string;
  organization: string;
  tenor: number;
  beneficiaryCount: number;
  disbursementMonth: string;
  disbursementYear: number;
  totalDisbursed: number;
  outstandingBalance: number;
  totalRepaid: number;
  monthlyRepayment: number;
  ageOfArrears: number;
  monthsInArrears: number;
  amtInArrears: number;
  lastPaymentDate: string | null;
  defaults: number;
  nplRatio: number;
  status: string;
  firstDisbursementDate: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function DisbursementRecord() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const { map: arrearsMap } = useArrearsLookup();

  // Fetch batches
  const { data: batches = [] } = useQuery({
    queryKey: ['dr-batches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_batches').select('id, name, batch_code, state, bank_branch').order('name');
      if (error) throw error;
      return data as LoanBatch[];
    },
  });

  // Fetch all beneficiaries
  const { data: beneficiaries = [] } = useQuery({
    queryKey: ['dr-beneficiaries'],
    queryFn: async () => {
      return fetchAllRows<Beneficiary>('beneficiaries',
        'id, name, loan_amount, monthly_emi, outstanding_balance, total_paid, tenor_months, disbursement_date, status, batch_id, default_count, department',
        { orderBy: 'name' }
      );
    },
  });

  // Fetch last payment per beneficiary
  const { data: transactions = [] } = useQuery({
    queryKey: ['dr-transactions'],
    queryFn: async () => {
      return fetchAllRows<Transaction>('transactions', 'beneficiary_id, amount, date_paid', { orderBy: 'date_paid', ascending: false });
    },
  });

  const lastPaymentMap = useMemo(() => {
    const map = new Map<string, { date: string; amount: number }>();
    for (const t of transactions) {
      if (!map.has(t.beneficiary_id)) {
        map.set(t.beneficiary_id, { date: t.date_paid, amount: t.amount });
      }
    }
    return map;
  }, [transactions]);

  const branches = useMemo(() => {
    const set = new Set(batches.map(b => b.bank_branch).filter(Boolean));
    return Array.from(set).sort();
  }, [batches]);

  // Build batch summaries
  const summaries: BatchSummary[] = useMemo(() => {
    return batches.map(batch => {
      const members = beneficiaries.filter(b => b.batch_id === batch.id);
      if (members.length === 0) return null;

      const totalDisbursed = members.reduce((s, m) => s + m.loan_amount, 0);
      const outstandingBalance = members.reduce((s, m) => s + m.outstanding_balance, 0);
      const totalRepaid = members.reduce((s, m) => s + m.total_paid, 0);
      const monthlyRepayment = members.reduce((s, m) => s + m.monthly_emi, 0);
      const defaults = members.reduce((s, m) => s + m.default_count, 0);

      // Arrears from view
      let totalAgeOfArrears = 0;
      let totalMonthsArrears = 0;
      let totalAmtArrears = 0;
      let nplCount = 0;
      for (const m of members) {
        const a = getArrearsFromMap(arrearsMap, m.id);
        totalAgeOfArrears += a.daysOverdue;
        totalMonthsArrears += a.arrearsMonths;
        totalAmtArrears += a.arrearsAmount;
        if (a.isNpl) nplCount++;
      }
      const avgAge = members.length > 0 ? Math.round(totalAgeOfArrears / members.length) : 0;
      const avgMonths = members.length > 0 ? Math.round(totalMonthsArrears / members.length) : 0;
      const nplRatio = members.length > 0 ? Math.round((nplCount / members.length) * 100 * 100) / 100 : 0;

      // Last payment date across all members
      let lastPmtDate: string | null = null;
      for (const m of members) {
        const lp = lastPaymentMap.get(m.id);
        if (lp && (!lastPmtDate || lp.date > lastPmtDate)) lastPmtDate = lp.date;
      }

      const firstDisb = members.reduce((min, m) => m.disbursement_date < min ? m.disbursement_date : min, members[0].disbursement_date);
      const d = new Date(firstDisb);
      const maxTenor = Math.max(...members.map(m => m.tenor_months));

      // Status
      const allCompleted = members.every(m => m.status === 'completed');
      const status = allCompleted ? 'completed' : 'active';

      return {
        batchId: batch.id,
        batchName: batch.name,
        organization: members[0]?.department || '',
        tenor: maxTenor,
        beneficiaryCount: members.length,
        disbursementMonth: MONTHS[d.getMonth()],
        disbursementYear: d.getFullYear(),
        totalDisbursed,
        outstandingBalance,
        totalRepaid,
        monthlyRepayment,
        ageOfArrears: avgAge,
        monthsInArrears: avgMonths,
        amtInArrears: totalAmtArrears,
        lastPaymentDate: lastPmtDate,
        defaults,
        nplRatio,
        status,
        firstDisbursementDate: firstDisb,
      } as BatchSummary;
    }).filter(Boolean) as BatchSummary[];
  }, [batches, beneficiaries, arrearsMap, lastPaymentMap]);

  // Filter summaries
  const filtered = useMemo(() => {
    let data = summaries;
    if (filterState !== 'all') {
      const batchIds = new Set(batches.filter(b => b.state === filterState).map(b => b.id));
      data = data.filter(s => batchIds.has(s.batchId));
    }
    if (filterBranch !== 'all') {
      const batchIds = new Set(batches.filter(b => b.bank_branch === filterBranch).map(b => b.id));
      data = data.filter(s => batchIds.has(s.batchId));
    }
    if (fromDate) {
      data = data.filter(s => new Date(s.firstDisbursementDate) >= fromDate);
    }
    if (toDate) {
      data = data.filter(s => new Date(s.firstDisbursementDate) <= toDate);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(s =>
        s.batchName.toLowerCase().includes(q) ||
        s.organization.toLowerCase().includes(q)
      );
    }
    return data;
  }, [summaries, filterState, filterBranch, fromDate, toDate, search, batches]);

  const staffName = user?.user_metadata?.surname && user?.user_metadata?.first_name
    ? `${user.user_metadata.surname}, ${user.user_metadata.first_name}`
    : user?.email?.split('@')[0] || 'User';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileBarChart className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Disbursement Record</h1>
          <p className="text-sm text-muted-foreground">View and export all loan disbursement records by batch</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search batch or organization..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate} />
      </div>

      {/* Export buttons */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} batch{filtered.length !== 1 ? 'es' : ''} found</p>
        {filtered.length > 0 && (
          <DisbursementRecordExport records={filtered} staffName={staffName} filters={{ state: filterState, branch: filterBranch }} />
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">S/N</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Loan Batch</TableHead>
              <TableHead className="text-center">Tenor</TableHead>
              <TableHead className="text-center">Beneficiaries</TableHead>
              <TableHead>Month & Year</TableHead>
              <TableHead className="text-right">Total Disbursed (₦)</TableHead>
              <TableHead className="text-right">Outstanding (₦)</TableHead>
              <TableHead className="text-right text-success">Total Repaid (₦)</TableHead>
              <TableHead className="text-right">Monthly Repayment (₦)</TableHead>
              <TableHead className="text-center">Age of Arrears</TableHead>
              <TableHead className="text-center">Mths Arrears</TableHead>
              <TableHead className="text-right">Amt in Arrears (₦)</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead className="text-center">Defaults</TableHead>
              <TableHead className="text-center">NPL Ratio</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={17} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
            ) : filtered.map((s, i) => (
              <TableRow key={s.batchId}>
                <TableCell className="font-medium">{i + 1}</TableCell>
                <TableCell>{s.organization}</TableCell>
                <TableCell className="font-medium">{s.batchName}</TableCell>
                <TableCell className="text-center">{formatTenor(s.tenor)}</TableCell>
                <TableCell className="text-center">{s.beneficiaryCount}</TableCell>
                <TableCell>{s.disbursementMonth} {s.disbursementYear}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(s.totalDisbursed)}</TableCell>
                <TableCell className="text-right">{formatCurrency(s.outstandingBalance)}</TableCell>
                <TableCell className="text-right font-bold text-success">{formatCurrency(s.totalRepaid)}</TableCell>
                <TableCell className="text-right">{formatCurrency(s.monthlyRepayment)}</TableCell>
                <TableCell className="text-center">{s.ageOfArrears > 0 ? `${s.ageOfArrears} days` : '—'}</TableCell>
                <TableCell className="text-center">{s.monthsInArrears > 0 ? s.monthsInArrears : '—'}</TableCell>
                <TableCell className="text-right font-semibold text-destructive">{s.amtInArrears > 0 ? formatCurrency(s.amtInArrears) : '—'}</TableCell>
                <TableCell>{s.lastPaymentDate ? format(new Date(s.lastPaymentDate), NG_DATE) : '—'}</TableCell>
                <TableCell className="text-center">{s.defaults}</TableCell>
                <TableCell className="text-center">{s.nplRatio > 0 ? `${s.nplRatio}%` : '—'}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

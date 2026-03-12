import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileText, Bell, ExternalLink } from 'lucide-react';
import { formatCurrency, formatTenor } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import { NG_DATE } from '@/lib/dateFormat';
import { useAuth } from '@/contexts/AuthContext';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import DateRangeFilter from '@/components/DateRangeFilter';
import NotificationOfDisbursementExport from '@/components/disbursement/NotificationOfDisbursementExport';
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
  surname: string | null;
  first_name: string | null;
  other_name: string | null;
  department: string;
  nhf_number: string | null;
  loan_reference_number: string | null;
  loan_amount: number;
  monthly_emi: number;
  tenor_months: number;
  disbursement_date: string;
  termination_date: string;
  batch_id: string | null;
}

export default function NotificationOfDisbursement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  // Fetch batches
  const { data: batches = [] } = useQuery({
    queryKey: ['loan-batches-nod'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_batches').select('id, name, batch_code, state, bank_branch').order('name');
      if (error) throw error;
      return data as LoanBatch[];
    },
  });

  // Fetch all beneficiaries for org name lookup and date filtering
  const { data: allBeneficiaries = [] } = useQuery({
    queryKey: ['nod-all-beneficiaries'],
    queryFn: async () => {
      return fetchAllRows<Beneficiary>('beneficiaries',
        'id, surname, first_name, other_name, department, nhf_number, loan_reference_number, loan_amount, monthly_emi, tenor_months, disbursement_date, termination_date, batch_id',
        { orderBy: 'surname' }
      );
    },
  });

  // Build org name per batch
  const batchOrgMap = useMemo(() => {
    const m = new Map<string, string>();
    allBeneficiaries.forEach(b => {
      if (b.batch_id && !m.has(b.batch_id) && b.department) {
        m.set(b.batch_id, b.department);
      }
    });
    return m;
  }, [allBeneficiaries]);

  // Build first disbursement date per batch
  const batchDisbDateMap = useMemo(() => {
    const m = new Map<string, string>();
    allBeneficiaries.forEach(b => {
      if (b.batch_id) {
        const existing = m.get(b.batch_id);
        if (!existing || b.disbursement_date < existing) {
          m.set(b.batch_id, b.disbursement_date);
        }
      }
    });
    return m;
  }, [allBeneficiaries]);

  // Filter batches by state/branch/search/date
  const filteredBatches = useMemo(() => {
    let b = batches;
    if (filterState !== 'all') b = b.filter(x => x.state === filterState);
    if (filterBranch !== 'all') b = b.filter(x => x.bank_branch === filterBranch);
    if (search) {
      const q = search.toLowerCase();
      b = b.filter(x => {
        const orgName = batchOrgMap.get(x.id) || '';
        return x.name.toLowerCase().includes(q) ||
          x.batch_code.toLowerCase().includes(q) ||
          orgName.toLowerCase().includes(q);
      });
    }
    if (fromDate) {
      b = b.filter(x => {
        const d = batchDisbDateMap.get(x.id);
        return d && new Date(d) >= fromDate;
      });
    }
    if (toDate) {
      b = b.filter(x => {
        const d = batchDisbDateMap.get(x.id);
        return d && new Date(d) <= toDate;
      });
    }
    return b;
  }, [batches, filterState, filterBranch, search, fromDate, toDate, batchOrgMap, batchDisbDateMap]);

  const branches = useMemo(() => {
    const set = new Set(batches.map(b => b.bank_branch).filter(Boolean));
    return Array.from(set).sort();
  }, [batches]);

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  // Fetch beneficiaries for selected batch
  const { data: beneficiaries = [], isLoading } = useQuery({
    queryKey: ['nod-beneficiaries', selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return [];
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('id, surname, first_name, other_name, department, nhf_number, loan_reference_number, loan_amount, monthly_emi, tenor_months, disbursement_date, termination_date, batch_id')
        .eq('batch_id', selectedBatchId)
        .order('surname');
      if (error) throw error;
      return data as Beneficiary[];
    },
    enabled: !!selectedBatchId,
  });

  const staffName = user?.user_metadata?.surname && user?.user_metadata?.first_name
    ? `${user.user_metadata.surname}, ${user.user_metadata.first_name}`
    : user?.email?.split('@')[0] || 'User';

  const exportRecords = beneficiaries.map(b => ({
    surname: b.surname || '',
    firstName: b.first_name || '',
    otherName: b.other_name || '',
    organization: b.department,
    loanBatch: selectedBatch?.name || '',
    nhfNumber: b.nhf_number || '',
    loanRefNo: b.loan_reference_number || '',
    amountDisbursed: b.loan_amount,
    monthlyRepayment: b.monthly_emi,
    tenor: b.tenor_months,
    disbursementDate: b.disbursement_date,
    terminationDate: b.termination_date,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notification of Disbursement</h1>
          <p className="text-sm text-muted-foreground">Print disbursement notification letters for loan batches</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search batch, organization..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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

      {/* Batch selection - now a clickable table */}
      <div className="bg-card rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold text-foreground">Select a Loan Batch ({filteredBatches.length})</h2>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">S/N</TableHead>
                <TableHead>Batch Name</TableHead>
                <TableHead>Batch Code</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">No batches found</TableCell></TableRow>
              ) : filteredBatches.map((b, i) => (
                <TableRow
                  key={b.id}
                  className={`cursor-pointer transition-all ${selectedBatchId === b.id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-primary/5'}`}
                  onClick={() => setSelectedBatchId(b.id)}
                >
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="font-mono text-xs">{b.batch_code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{batchOrgMap.get(b.id) || '—'}</TableCell>
                  <TableCell>{b.state || '—'}</TableCell>
                  <TableCell>{b.bank_branch || '—'}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/batch-repayment?batch=${b.id}`); }}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Results */}
      {selectedBatchId && (
        <div className="bg-card rounded-xl border p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">{selectedBatch?.name}</h2>
              <p className="text-sm text-muted-foreground">
                {beneficiaries.length} beneficiar{beneficiaries.length === 1 ? 'y' : 'ies'} • {selectedBatch?.state} • {selectedBatch?.bank_branch}
              </p>
            </div>
            {beneficiaries.length > 0 && (
              <NotificationOfDisbursementExport
                records={exportRecords}
                batchName={selectedBatch?.name || ''}
                organization={beneficiaries[0]?.department || ''}
                staffName={staffName}
              />
            )}
          </div>

          {isLoading ? (
            <p className="text-muted-foreground py-6 text-center">Loading…</p>
          ) : beneficiaries.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center">No beneficiaries found in this batch.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">S/N</TableHead>
                    <TableHead>Surname</TableHead>
                    <TableHead>First Name</TableHead>
                    <TableHead>Other Name</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Loan Batch</TableHead>
                    <TableHead>NHF Number</TableHead>
                    <TableHead>Loan Ref No</TableHead>
                    <TableHead className="text-right">Amount Disbursed</TableHead>
                    <TableHead className="text-right">Monthly Repayment</TableHead>
                    <TableHead className="text-center">Tenor</TableHead>
                    <TableHead>Disbursement Date</TableHead>
                    <TableHead>Termination Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {beneficiaries.map((b, i) => (
                    <TableRow key={b.id} className="hover:bg-primary/5 cursor-pointer" onClick={() => navigate(`/beneficiary/${b.id}`)}>
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      <TableCell>{b.surname || '—'}</TableCell>
                      <TableCell>{b.first_name || '—'}</TableCell>
                      <TableCell>{b.other_name || '—'}</TableCell>
                      <TableCell>{b.department}</TableCell>
                      <TableCell>{selectedBatch?.name}</TableCell>
                      <TableCell>{b.nhf_number || '—'}</TableCell>
                      <TableCell>{b.loan_reference_number || '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(b.loan_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(b.monthly_emi)}</TableCell>
                      <TableCell className="text-center">{formatTenor(b.tenor_months)}</TableCell>
                      <TableCell>{format(new Date(b.disbursement_date), NG_DATE)}</TableCell>
                      <TableCell>{format(new Date(b.termination_date), NG_DATE)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

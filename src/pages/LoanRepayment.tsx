import { useState, useEffect, useMemo } from 'react';
import { Search, ExternalLink, Banknote, Pencil, Trash2, MessageSquare, CalendarIcon } from 'lucide-react';
import { formatCurrency, formatDate, formatTenor } from '@/lib/loanCalculations';
import { useArrearsLookup, getArrearsFromMap } from '@/hooks/useArrearsLookup';
import StatusBadge from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';
import DateRangeFilter from '@/components/DateRangeFilter';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;


interface BeneficiaryWithTxnInfo extends Beneficiary {
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
}

export default function LoanRepayment() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin');
  const { map: arrearsMap } = useArrearsLookup();

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryWithTxnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  // Modal state
  const [selectedBen, setSelectedBen] = useState<BeneficiaryWithTxnInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Repayment history state
  const [historyBen, setHistoryBen] = useState<BeneficiaryWithTxnInfo | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTxns, setHistoryTxns] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Edit state
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Delete state
  const [deletingTxn, setDeletingTxn] = useState<Transaction | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Bulk select state
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Form state
  const [repaymentMonth, setRepaymentMonth] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [rrrNumber, setRrrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [receiptUrl, setReceiptUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      // Fetch beneficiaries and their latest transaction in parallel
      const [benResult, txnResult] = await Promise.all([
        supabase.from('beneficiaries').select('*').order('name', { ascending: true }),
        supabase.from('transactions').select('beneficiary_id, date_paid, amount').order('date_paid', { ascending: false })
      ]);

      const bens = benResult.data || [];
      const txns = txnResult.data || [];

      // Build map of latest txn per beneficiary
      const latestTxnMap = new Map<string, { date: string; amount: number }>();
      txns.forEach((t) => {
        if (!latestTxnMap.has(t.beneficiary_id)) {
          latestTxnMap.set(t.beneficiary_id, { date: t.date_paid, amount: Number(t.amount) });
        }
      });

      const enriched: BeneficiaryWithTxnInfo[] = bens.map((b) => {
        const latest = latestTxnMap.get(b.id);
        return {
          ...b,
          lastPaymentDate: latest?.date || null,
          lastPaymentAmount: latest?.amount ?? null,
        };
      });

      setBeneficiaries(enriched);
      setLoading(false);
    };
    fetchData();

    const channel = supabase.channel('repayment-beneficiaries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beneficiaries' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => beneficiaries.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch = b.name.toLowerCase().includes(q) ||
      b.employee_id.toLowerCase().includes(q) ||
      (b.nhf_number && b.nhf_number.toLowerCase().includes(q));
    const matchesState = stateFilter === 'all' || b.state === stateFilter;
    // Date range filter on commencement_date
    let matchesDate = true;
    if (fromDate || toDate) {
      const d = new Date(b.commencement_date);
      if (fromDate && d < fromDate) matchesDate = false;
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) matchesDate = false;
      }
    }
    return matchesSearch && matchesState && matchesDate;
  }), [beneficiaries, search, stateFilter, fromDate, toDate]);

  const resetForm = () => {
    setRepaymentMonth('');
    setAmountPaid('');
    setRrrNumber('');
    setPaymentDate(undefined);
    setReceiptUrl('');
    setNotes('');
  };

  const openRecordModal = (b: BeneficiaryWithTxnInfo) => {
    setSelectedBen(b);
    resetForm();
    setModalOpen(true);
  };

  const openHistory = async (b: BeneficiaryWithTxnInfo) => {
    setHistoryBen(b);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setSelectedTxnIds(new Set()); // reset selection on open
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('beneficiary_id', b.id)
      .order('month_for', { ascending: true });
    setHistoryTxns(data || []);
    setHistoryLoading(false);
  };

  const handleSave = async () => {
    if (!selectedBen || !paymentDate) return;

    // Default to expected amount if blank
    const effectiveAmount = amountPaid.trim() === '' ? String(selectedBen.monthly_emi) : amountPaid;

    if (Number(effectiveAmount) <= 0) {
      toast({ title: 'Validation Error', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    if (!rrrNumber.trim()) {
      toast({ title: 'Validation Error', description: 'Remita RRR is required.', variant: 'destructive' });
      return;
    }
    if (!repaymentMonth) {
      toast({ title: 'Validation Error', description: 'Select the starting repayment month.', variant: 'destructive' });
      return;
    }

    // Check duplicate RRR
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('rrr_number', rrrNumber.trim())
      .maybeSingle();
    if (existing) {
      toast({ title: 'Duplicate RRR', description: 'This Remita Reference Number has already been used.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const totalAmount = Number(effectiveAmount);
    const startMonth = Number(repaymentMonth);
    const emi = Number(selectedBen.monthly_emi);
    const maxMonth = selectedBen.tenor_months;

    // Auto-forward allocation: split payment across consecutive months
    const transactions: { month_for: number; amount: number }[] = [];
    let remaining = totalAmount;
    let currentMonth = startMonth;

    while (remaining > 0 && currentMonth <= maxMonth) {
      const allocation = Math.min(remaining, emi);
      transactions.push({ month_for: currentMonth, amount: Math.round(allocation * 100) / 100 });
      remaining = Math.round((remaining - allocation) * 100) / 100;
      currentMonth++;
    }

    // If there's still remaining after all months, add it to the last month
    if (remaining > 0 && transactions.length > 0) {
      transactions[transactions.length - 1].amount += remaining;
    }

    // Insert all transaction records
    const inserts = transactions.map((t, idx) => ({
      beneficiary_id: selectedBen.id,
      amount: t.amount,
      rrr_number: idx === 0 ? rrrNumber.trim() : `${rrrNumber.trim()}-ADV-M${t.month_for}`,
      date_paid: format(paymentDate, 'yyyy-MM-dd'),
      month_for: t.month_for,
      recorded_by: user?.id || null,
      receipt_url: receiptUrl.trim(),
      notes: idx === 0
        ? (transactions.length > 1
          ? `${notes.trim()} [Advance payment covering months ${startMonth}-${startMonth + transactions.length - 1}]`.trim()
          : notes.trim())
        : `Advance allocation from Month ${startMonth} payment (RRR: ${rrrNumber.trim()})`
    }));

    const { error: txError } = await supabase.from('transactions').insert(inserts);

    if (txError) {
      toast({ title: 'Error', description: txError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Update beneficiary balance
    const newTotalPaid = Number(selectedBen.total_paid) + totalAmount;
    const newOutstanding = Math.max(0, Number(selectedBen.outstanding_balance) - totalAmount);

    await supabase.from('beneficiaries').update({
      total_paid: newTotalPaid,
      outstanding_balance: newOutstanding,
      status: newOutstanding <= 0 ? 'completed' : selectedBen.status
    }).eq('id', selectedBen.id);

    setSaving(false);
    setModalOpen(false);

    const monthsCovered = transactions.length;
    toast({
      title: monthsCovered > 1 ? `Advance Repayment Recorded (${monthsCovered} months)` : 'Repayment Recorded',
      description: monthsCovered > 1
        ? `₦${totalAmount.toLocaleString()} applied to months ${startMonth}–${startMonth + monthsCovered - 1}.`
        : `Balance updated using payment date: ${format(paymentDate, 'dd MMM yyyy')}.`
    });
  };

  const canEditTxn = (t: Transaction) => {
    if (isAdmin) return true;
    return t.recorded_by === user?.id;
  };

  const canDeleteTxn = (t: Transaction) => {
    if (isAdmin) return true;
    if (t.recorded_by !== user?.id) return false;
    const createdAt = new Date(t.created_at);
    const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) return false;
    return true;
  };

  const openEditModal = (t: Transaction) => {
    setEditingTxn(t);
    setRepaymentMonth(String(t.month_for));
    setAmountPaid(String(t.amount));
    setRrrNumber(t.rrr_number);
    setPaymentDate(new Date(t.date_paid));
    setReceiptUrl(t.receipt_url || '');
    setNotes(t.notes || '');
    setEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingTxn || !historyBen || !paymentDate) return;
    if (!amountPaid || Number(amountPaid) <= 0) {
      toast({ title: 'Validation Error', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    if (!rrrNumber.trim()) {
      toast({ title: 'Validation Error', description: 'Remita RRR is required.', variant: 'destructive' });
      return;
    }

    // Check duplicate RRR (exclude current)
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('rrr_number', rrrNumber.trim())
      .neq('id', editingTxn.id)
      .maybeSingle();
    if (existing) {
      toast({ title: 'Duplicate RRR', description: 'This RRR is already used by another transaction.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const oldAmount = Number(editingTxn.amount);
    const newAmount = Number(amountPaid);
    const diff = newAmount - oldAmount;

    const { error } = await supabase.from('transactions').update({
      amount: newAmount,
      rrr_number: rrrNumber.trim(),
      date_paid: format(paymentDate, 'yyyy-MM-dd'),
      month_for: Number(repaymentMonth),
      receipt_url: receiptUrl.trim(),
      notes: notes.trim()
    }).eq('id', editingTxn.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Adjust beneficiary balance
    if (diff !== 0) {
      await supabase.from('beneficiaries').update({
        total_paid: Number(historyBen.total_paid) + diff,
        outstanding_balance: Math.max(0, Number(historyBen.outstanding_balance) - diff)
      }).eq('id', historyBen.id);
    }

    setSaving(false);
    setEditModalOpen(false);
    toast({ title: 'Repayment Updated', description: 'Transaction updated successfully.' });
    openHistory(historyBen);
  };

  const handleDelete = async () => {
    if (!deletingTxn || !historyBen) return;
    setDeleting(true);

    const { error } = await supabase.from('transactions').delete().eq('id', deletingTxn.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setDeleting(false);
      return;
    }

    // Reverse balance
    const amount = Number(deletingTxn.amount);
    await supabase.from('beneficiaries').update({
      total_paid: Math.max(0, Number(historyBen.total_paid) - amount),
      outstanding_balance: Number(historyBen.outstanding_balance) + amount,
      status: 'active'
    }).eq('id', historyBen.id);

    setDeleting(false);
    setDeleteDialogOpen(false);
    toast({ title: 'Repayment Deleted', description: 'Transaction removed and balance restored.' });
    openHistory(historyBen);
  };

  // Bulk select helpers
  const deletableTxnIds = historyTxns.filter(t => canDeleteTxn(t)).map(t => t.id);

  const toggleTxnSelect = (id: string) => {
    setSelectedTxnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllTxnSelect = () => {
    if (selectedTxnIds.size === deletableTxnIds.length && deletableTxnIds.length > 0) {
      setSelectedTxnIds(new Set());
    } else {
      setSelectedTxnIds(new Set(deletableTxnIds));
    }
  };

  const handleBulkDelete = async () => {
    if (!historyBen || selectedTxnIds.size === 0) return;
    setBulkDeleting(true);

    const toDelete = historyTxns.filter(t => selectedTxnIds.has(t.id));
    const totalAmount = toDelete.reduce((sum, t) => sum + Number(t.amount), 0);

    const { error } = await supabase.from('transactions').delete().in('id', Array.from(selectedTxnIds));
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setBulkDeleting(false);
      setBulkDeleteDialogOpen(false);
      return;
    }

    // Reverse combined balance
    await supabase.from('beneficiaries').update({
      total_paid: Math.max(0, Number(historyBen.total_paid) - totalAmount),
      outstanding_balance: Number(historyBen.outstanding_balance) + totalAmount,
      status: 'active'
    }).eq('id', historyBen.id);

    setBulkDeleting(false);
    setBulkDeleteDialogOpen(false);
    setSelectedTxnIds(new Set());
    toast({ title: `${toDelete.length} Repayment(s) Deleted`, description: `${formatCurrency(totalAmount)} reversed and balance restored.` });
    openHistory(historyBen);
  };

  // Compute arrears info from DB view (Golden Record)
  const getArrearsInfo = (b: Beneficiary) => {
    const a = getArrearsFromMap(arrearsMap, b.id);
    return {
      overdueAmount: a.overdueAmount,
      overdueMonths: a.overdueMonths,
      arrearsAmount: a.arrearsAmount,
      monthsInArrears: a.arrearsMonths,
    };
  };

  // Compute running loan balance for history
  // Starting balance = totalPayment (EMI × tenor) per the annuity formula.
  // Per business rules the moratorium period does NOT capitalise or add extra interest.
  const computeHistoryBalances = (txns: Transaction[], loanAmount: number, interestRate: number, tenorMonths: number) => {
    const monthlyRate = interestRate / 100 / 12;
    const emi =
      monthlyRate === 0
        ? loanAmount / tenorMonths
        : (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenorMonths)) /
          (Math.pow(1 + monthlyRate, tenorMonths) - 1);
    const startingBalance = Math.round(emi * tenorMonths * 100) / 100;
    let runningBalance = startingBalance;
    return txns.map((t) => {
      runningBalance = Math.max(0, runningBalance - Number(t.amount));
      return { ...t, loanBalance: Math.round(runningBalance * 100) / 100 };
    });
  };

  // Generate month options based on beneficiary tenor
  const editMonthOptions = editingTxn && historyBen ?
    Array.from({ length: historyBen.tenor_months }, (_, i) => i + 1) : [];

  const monthOptions = selectedBen ?
    Array.from({ length: selectedBen.tenor_months }, (_, i) => i + 1) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading active loans...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display">Loan Repayment</h1>
        <p className="mt-1 text-sm text-muted-foreground">Record and track monthly repayments via Remita</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, NHF or Loan Ref..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate} />
        {isAdmin &&
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">NHF Number</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Repayment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Repayment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground text-warning">Overdue Amt</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground text-warning">Months Overdue</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground text-destructive">Arrears Amount</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground text-destructive">Months in Arrears</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment Date</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => {
                const { overdueAmount, overdueMonths, arrearsAmount, monthsInArrears } = getArrearsInfo(b);
                return (
                  <tr key={b.id} className={cn("table-row-highlight", monthsInArrears > 0 && "bg-destructive/5", overdueMonths > 0 && monthsInArrears === 0 && "bg-warning/5")}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{b.name}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{b.department || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.state || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.bank_branch || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{b.nhf_number || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.employee_id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatTenor(b.tenor_months)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(b.loan_amount))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(b.outstanding_balance))}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(b.monthly_emi))}</td>
                    <td className="px-4 py-3 text-right">{b.lastPaymentAmount != null ? formatCurrency(b.lastPaymentAmount) : '—'}</td>
                    {/* Overdue */}
                    <td className={cn("px-4 py-3 text-right font-semibold", overdueAmount > 0 ? "text-warning" : "text-success")}>{overdueAmount > 0 ? formatCurrency(overdueAmount) : '₦0'}</td>
                    <td className={cn("px-4 py-3 text-center font-semibold", overdueMonths > 0 ? "text-warning" : "text-success")}>{overdueMonths > 0 ? overdueMonths : '0'}</td>
                    {/* Arrears */}
                    <td className={cn("px-4 py-3 text-right font-semibold", arrearsAmount > 0 ? "text-destructive animate-pulse" : "text-success")}>{arrearsAmount > 0 ? formatCurrency(arrearsAmount) : '₦0'}</td>
                    <td className={cn("px-4 py-3 text-center font-semibold", monthsInArrears > 0 ? "text-destructive animate-pulse" : "text-success")}>{monthsInArrears > 0 ? monthsInArrears : '0'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{b.lastPaymentDate ? formatDate(new Date(b.lastPaymentDate)) : '—'}</td>
                    <td className="px-4 py-3 text-center space-x-1">
                      <Button size="sm" onClick={() => openRecordModal(b)} className="gap-1">
                        <Banknote className="w-3.5 h-3.5" /> Record
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openHistory(b)}>
                        History
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 &&
                <tr>
                  <td colSpan={15} className="px-6 py-12 text-center text-muted-foreground">
                    No active loans found.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Repayment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Record Repayment</DialogTitle>
            <DialogDescription>Enter repayment details from the Remita receipt.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
          {selectedBen &&
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-xs text-muted-foreground">Beneficiary</p>
                  <p className="text-sm font-semibold">{selectedBen.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Repayment</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(Number(selectedBen.monthly_emi))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                  <p className="text-sm font-semibold">{formatCurrency(Number(selectedBen.outstanding_balance))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">NHF Number</p>
                  <p className="text-sm font-semibold font-mono">{selectedBen.nhf_number || 'Not Set'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Loan Ref</p>
                  <p className="text-sm font-semibold font-mono">{selectedBen.loan_reference_number || selectedBen.employee_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tenor</p>
                  <p className="text-sm font-semibold">{formatTenor(selectedBen.tenor_months)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Starting Repayment Month *</Label>
                  <p className="text-xs text-muted-foreground mb-1">If payment covers multiple months, excess will auto-allocate to subsequent months.</p>
                  <Select value={repaymentMonth} onValueChange={setRepaymentMonth}>
                    <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Amount Paid (₦)</Label>
                  <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={selectedBen ? Number(selectedBen.monthly_emi).toLocaleString() : '0.00'} />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to use expected amount ({selectedBen ? formatCurrency(Number(selectedBen.monthly_emi)) : '—'}). Enter different amount for partial payment.</p>
                  {selectedBen && amountPaid && Number(amountPaid) > Number(selectedBen.monthly_emi) && repaymentMonth && (
                    <div className="mt-2 p-2.5 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-medium">
                      💡 This payment covers <strong>{Math.min(Math.floor(Number(amountPaid) / Number(selectedBen.monthly_emi)), selectedBen.tenor_months - Number(repaymentMonth) + 1)} month(s)</strong> starting from Month {repaymentMonth}
                      {Number(amountPaid) % Number(selectedBen.monthly_emi) > 0 && Number(amountPaid) / Number(selectedBen.monthly_emi) < (selectedBen.tenor_months - Number(repaymentMonth) + 1) &&
                        <span> (+ partial ₦{(Number(amountPaid) % Number(selectedBen.monthly_emi)).toLocaleString()} for the next month)</span>
                      }
                    </div>
                  )}
                </div>

                <div>
                  <Label>Remita Reference Number (RRR) *</Label>
                  <Input value={rrrNumber} onChange={(e) => setRrrNumber(e.target.value)} placeholder="e.g. 3405-2458-5572" />
                  <p className="text-xs text-muted-foreground mt-1">Enter RRR in format XXXX-XXXX-XXXX.</p>
                </div>

                <div>
                  <Label>Payment Date (as on Remita receipt) *</Label>
                  <p className="text-xs text-muted-foreground mb-1">Enter the exact date shown on the Remita receipt — this is the official repayment date.</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !paymentDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {paymentDate ? format(paymentDate, 'dd MMM yyyy') : 'Select payment date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 z-[200]"
                      align="start"
                      side="bottom"
                      sideOffset={4}
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={setPaymentDate}
                        disabled={(d) => d > new Date() || d < new Date('2016-01-01')}
                        captionLayout="dropdown-buttons"
                        fromYear={2016}
                        toYear={new Date().getFullYear()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Remita Receipt URL</Label>
                  <Input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://remita.net/receipt/... (optional)" />
                </div>

                <div>
                  <Label>Notes / Remarks</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional comments" rows={2} />
                </div>
              </div>
            </div>
          }
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Repayment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repayment History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Repayment History — {historyBen?.name}</DialogTitle>
            <DialogDescription>
              {historyBen && (
                <span className="flex gap-6 mt-1 text-sm">
                  <span><strong>NHF:</strong> {historyBen.nhf_number || 'N/A'}</span>
                  <span><strong>Loan Ref:</strong> {historyBen.employee_id}</span>
                  <span><strong>Loan Amount:</strong> {formatCurrency(Number(historyBen.loan_amount))}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {historyLoading ?
            <div className="py-8 text-center text-muted-foreground animate-pulse">Loading...</div> :
            historyTxns.length === 0 ?
              <div className="py-8 text-center text-muted-foreground">No repayments recorded yet.</div> :

              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="rounded-lg bg-success/10 border border-success/20 p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Total Payment Made So Far</p>
                    <p className="text-2xl font-bold text-success">{formatCurrency(historyTxns.reduce((s, t) => s + Number(t.amount), 0))}</p>
                  </div>
                  <div className={cn("rounded-lg border p-4", Number(historyBen?.outstanding_balance) > 0 ? "bg-destructive/10 border-destructive/20" : "bg-success/10 border-success/20")}>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Total Loan Outstanding</p>
                    <p className={cn("text-2xl font-bold", Number(historyBen?.outstanding_balance) > 0 ? "text-destructive" : "text-success")}>{formatCurrency(Number(historyBen?.outstanding_balance ?? 0))}</p>
                  </div>
                </div>

                {/* Bulk action toolbar */}
                {deletableTxnIds.length > 0 && (
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedTxnIds.size === deletableTxnIds.length && deletableTxnIds.length > 0}
                        onCheckedChange={toggleAllTxnSelect}
                        id="select-all-txns"
                      />
                      <label htmlFor="select-all-txns" className="text-sm text-muted-foreground cursor-pointer select-none">
                        {selectedTxnIds.size === 0
                          ? `Select all deletable (${deletableTxnIds.length})`
                          : `${selectedTxnIds.size} of ${deletableTxnIds.length} selected`}
                      </label>
                    </div>
                    {selectedTxnIds.size > 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setBulkDeleteDialogOpen(true)}
                        disabled={bulkDeleting}
                        className="gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Selected ({selectedTxnIds.size})
                      </Button>
                    )}
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/60">
                        {deletableTxnIds.length > 0 && <th className="px-3 py-3 text-center w-10"></th>}
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Repayment Month</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Date on Remita Receipt</th>
                        <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount on Remita Receipt</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Remita RRR</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Receipt Link</th>
                        <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Loan Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Date Recorded</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Recorded</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</th>
                        <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(() => {
                        const withBalances = historyBen
                          ? computeHistoryBalances(historyTxns, Number(historyBen.loan_amount), historyBen.interest_rate, historyBen.tenor_months)
                          : historyTxns.map(t => ({ ...t, loanBalance: 0 }));
                        return withBalances.map((t) => (
                          <tr key={t.id} className={cn("table-row-highlight", selectedTxnIds.has(t.id) && "bg-primary/5")}>
                            {deletableTxnIds.length > 0 && (
                              <td className="px-3 py-3.5 text-center">
                                {canDeleteTxn(t) ? (
                                  <Checkbox
                                    checked={selectedTxnIds.has(t.id)}
                                    onCheckedChange={() => toggleTxnSelect(t.id)}
                                  />
                                ) : <span className="w-4 h-4 block" />}
                              </td>
                            )}
                            <td className="px-4 py-3.5 font-semibold text-base">Month {t.month_for}</td>
                            <td className="px-4 py-3.5">{formatDate(new Date(t.date_paid))}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-base">{formatCurrency(Number(t.amount))}</td>
                            <td className="px-4 py-3.5 font-mono text-xs">{t.rrr_number}</td>
                            <td className="px-4 py-3.5">
                              {t.receipt_url ?
                                <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                                  <ExternalLink className="w-3 h-3" /> Open
                                </a> : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-base">{formatCurrency(t.loanBalance)}</td>
                            <td className="px-4 py-3.5 text-muted-foreground">{formatDate(new Date(t.created_at))}</td>
                            <td className="px-4 py-3.5 text-muted-foreground">{format(new Date(t.created_at), 'hh:mm a')}</td>
                            <td className="px-4 py-3.5 max-w-[150px]">
                              {t.notes ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help truncate max-w-[120px]">
                                      <MessageSquare className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{t.notes}</span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-sm whitespace-pre-wrap">{t.notes}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-center space-x-1">
                              {canEditTxn(t) &&
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditModal(t)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              }
                              {canDeleteTxn(t) &&
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { setDeletingTxn(t); setDeleteDialogOpen(true); }}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              }
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
          }
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTxnIds.size} Repayment(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {selectedTxnIds.size} repayment record(s) and restore the combined amount to the outstanding balance. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Deleting...' : 'Delete All Selected'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Repayment Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Repayment</DialogTitle>
            <DialogDescription>Modify the repayment details below.</DialogDescription>
          </DialogHeader>

          {editingTxn &&
            <div className="space-y-3">
              <div>
                <Label>Repayment Month *</Label>
                <Select value={repaymentMonth} onValueChange={setRepaymentMonth}>
                  <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                  <SelectContent>
                    {editMonthOptions.map((m) => <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount Paid (₦) *</Label>
                <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
              </div>
              <div>
                <Label>Remita Reference Number (RRR) *</Label>
                <Input value={rrrNumber} onChange={(e) => setRrrNumber(e.target.value)} />
              </div>
              <div>
                <Label>Payment Date (as on Remita receipt) *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-full justify-start text-left font-normal', !paymentDate && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paymentDate ? format(paymentDate, 'dd MMM yyyy') : 'Select payment date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 z-[200]"
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={setPaymentDate}
                      disabled={(d) => d > new Date() || d < new Date('2016-01-01')}
                      captionLayout="dropdown-buttons"
                      fromYear={2016}
                      toYear={new Date().getFullYear()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Remita Receipt URL *</Label>
                <Input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} />
              </div>
              <div>
                <Label>Notes / Remarks</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          }

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? 'Updating...' : 'Update Repayment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repayment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the repayment record and restore the amount ({deletingTxn ? formatCurrency(Number(deletingTxn.amount)) : ''}) to the outstanding balance. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

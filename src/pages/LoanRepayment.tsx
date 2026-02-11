import { useState, useEffect, useMemo } from 'react';
import { Search, ExternalLink, Banknote, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
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
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

export default function LoanRepayment() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin');

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  // Modal state
  const [selectedBen, setSelectedBen] = useState<Beneficiary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Repayment history state
  const [historyBen, setHistoryBen] = useState<Beneficiary | null>(null);
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

  // Form state
  const [repaymentMonth, setRepaymentMonth] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [rrrNumber, setRrrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [receiptUrl, setReceiptUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const fetchBeneficiaries = async () => {
      const { data, error } = await supabase.
      from('beneficiaries').
      select('*').
      eq('status', 'active').
      order('name', { ascending: true });
      if (!error && data) setBeneficiaries(data);
      setLoading(false);
    };
    fetchBeneficiaries();

    const channel = supabase.channel('repayment-beneficiaries').
    on('postgres_changes', { event: '*', schema: 'public', table: 'beneficiaries' }, () => fetchBeneficiaries()).
    subscribe();
    return () => {supabase.removeChannel(channel);};
  }, []);

  const filtered = useMemo(() => beneficiaries.filter((b) => {
    const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.employee_id.toLowerCase().includes(search.toLowerCase());
    const matchesState = stateFilter === 'all' || b.state === stateFilter;
    return matchesSearch && matchesState;
  }), [beneficiaries, search, stateFilter]);

  const resetForm = () => {
    setRepaymentMonth('');
    setAmountPaid('');
    setRrrNumber('');
    setPaymentDate(undefined);
    setReceiptUrl('');
    setNotes('');
  };

  const openRecordModal = (b: Beneficiary) => {
    setSelectedBen(b);
    resetForm();
    setModalOpen(true);
  };

  const openHistory = async (b: Beneficiary) => {
    setHistoryBen(b);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data } = await supabase.
    from('transactions').
    select('*').
    eq('beneficiary_id', b.id).
    order('month_for', { ascending: true });
    setHistoryTxns(data || []);
    setHistoryLoading(false);
  };

  const handleSave = async () => {
    if (!selectedBen || !paymentDate) return;

    if (!amountPaid || Number(amountPaid) <= 0) {
      toast({ title: 'Validation Error', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    if (!rrrNumber.trim()) {
      toast({ title: 'Validation Error', description: 'Remita RRR is required.', variant: 'destructive' });
      return;
    }
    if (!repaymentMonth) {
      toast({ title: 'Validation Error', description: 'Select the repayment month.', variant: 'destructive' });
      return;
    }
    if (!receiptUrl.trim()) {
      toast({ title: 'Validation Error', description: 'Receipt URL is required.', variant: 'destructive' });
      return;
    }

    // Check duplicate RRR
    const { data: existing } = await supabase.
    from('transactions').
    select('id').
    eq('rrr_number', rrrNumber.trim()).
    maybeSingle();
    if (existing) {
      toast({ title: 'Duplicate RRR', description: 'This Remita Reference Number has already been used.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const amount = Number(amountPaid);
    const monthFor = Number(repaymentMonth);

    const { error: txError } = await supabase.from('transactions').insert({
      beneficiary_id: selectedBen.id,
      amount,
      rrr_number: rrrNumber.trim(),
      date_paid: format(paymentDate, 'yyyy-MM-dd'),
      month_for: monthFor,
      recorded_by: user?.id || null,
      receipt_url: receiptUrl.trim(),
      notes: notes.trim()
    });

    if (txError) {
      toast({ title: 'Error', description: txError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Update beneficiary balance
    const newTotalPaid = Number(selectedBen.total_paid) + amount;
    const newOutstanding = Math.max(0, Number(selectedBen.outstanding_balance) - amount);

    await supabase.from('beneficiaries').update({
      total_paid: newTotalPaid,
      outstanding_balance: newOutstanding,
      status: newOutstanding <= 0 ? 'completed' : selectedBen.status
    }).eq('id', selectedBen.id);

    setSaving(false);
    setModalOpen(false);
    toast({
      title: 'Repayment Recorded',
      description: `Balance updated using payment date: ${format(paymentDate, 'dd/MM/yyyy')}.`
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
    if (historyBen?.status === 'completed') return false;
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
    const { data: existing } = await supabase.
    from('transactions').
    select('id').
    eq('rrr_number', rrrNumber.trim()).
    neq('id', editingTxn.id).
    maybeSingle();
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
    toast({ title: 'Repayment Updated', description: `Transaction updated successfully.` });
    // Refresh history
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

  // Generate month options based on beneficiary tenor
  const editMonthOptions = editingTxn && historyBen ?
  Array.from({ length: historyBen.tenor_months }, (_, i) => i + 1) :
  [];

  const monthOptions = selectedBen ?
  Array.from({ length: selectedBen.tenor_months }, (_, i) => i + 1) :
  [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading active loans...</div>
      </div>);

  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display">Loan Repayment</h1>
        <p className="mt-1 text-sm text-muted-foreground">Record and track monthly repayments via Remita</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
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
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emp ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">MONTHLY REPAYMENT</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) =>
              <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4 font-medium whitespace-nowrap">{b.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.employee_id}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.state || '—'}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(Number(b.loan_amount))}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(Number(b.monthly_emi))}</td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(Number(b.outstanding_balance))}</td>
                  <td className="px-6 py-4"><StatusBadge status={b.status} /></td>
                  <td className="px-6 py-4 text-center space-x-2">
                    <Button size="sm" onClick={() => openRecordModal(b)} className="gap-1">
                      <Banknote className="w-3.5 h-3.5" /> Record
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openHistory(b)}>
                      History
                    </Button>
                  </td>
                </tr>
              )}
              {filtered.length === 0 &&
              <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
            <DialogDescription>Enter repayment details from the Remita receipt.</DialogDescription>
          </DialogHeader>

          {selectedBen &&
          <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-xs text-muted-foreground">Beneficiary</p>
                  <p className="text-sm font-semibold">{selectedBen.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className="text-sm font-semibold">{formatCurrency(Number(selectedBen.outstanding_balance))}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Repayment Month *</Label>
                  <Select value={repaymentMonth} onValueChange={setRepaymentMonth}>
                    <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Amount Paid (₦) *</Label>
                  <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0.00" />
                </div>

                <div>
                  <Label>Remita Reference Number (RRR) *</Label>
                  <Input value={rrrNumber} onChange={(e) => setRrrNumber(e.target.value)} placeholder="e.g. 310007771234" />
                </div>

                <div>
                  <Label>Payment Date (as on Remita receipt) *</Label>
                  <p className="text-xs text-muted-foreground mb-1">Enter the exact date shown on the Remita receipt — this is the official repayment date.</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !paymentDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {paymentDate ? format(paymentDate, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={setPaymentDate}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")} />

                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Remita Receipt URL *</Label>
                  <Input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://remita.net/receipt/..." />
                </div>

                <div>
                  <Label>Notes / Remarks</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional comments" rows={2} />
                </div>
              </div>
            </div>
          }

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Repayment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repayment History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Repayment History — {historyBen?.name}</DialogTitle>
            <DialogDescription>All recorded repayments for this loan facility.</DialogDescription>
          </DialogHeader>

          {historyLoading ?
          <div className="py-8 text-center text-muted-foreground animate-pulse">Loading...</div> :
          historyTxns.length === 0 ?
          <div className="py-8 text-center text-muted-foreground">No repayments recorded yet.</div> :

          <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Month</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">RRR</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Payment Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Receipt</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Recorded On</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyTxns.map((t) =>
                <tr key={t.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">Month {t.month_for}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(t.amount))}</td>
                      <td className="px-4 py-3 font-mono text-xs">{t.rrr_number}</td>
                      <td className="px-4 py-3">{formatDate(new Date(t.date_paid))}</td>
                      <td className="px-4 py-3">
                        {t.receipt_url ?
                    <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                            <ExternalLink className="w-3 h-3" /> Open
                          </a> :
                    '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(t.created_at))}</td>
                      <td className="px-4 py-3 text-center space-x-1">
                        {canEditTxn(t) &&
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditModal(t)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                    }
                        {canDeleteTxn(t) &&
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => {setDeletingTxn(t);setDeleteDialogOpen(true);}}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                    }
                      </td>
                    </tr>
                )}
                </tbody>
              </table>
            </div>
          }
        </DialogContent>
      </Dialog>

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
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !paymentDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paymentDate ? format(paymentDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} disabled={(date) => date > new Date()} initialFocus className="p-3 pointer-events-auto" />
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
    </div>);

}
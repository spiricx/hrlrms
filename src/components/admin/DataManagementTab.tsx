import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatCurrency, formatTenor } from '@/lib/loanCalculations';
import { Search, Trash2, Pencil, AlertTriangle, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

// ─── Beneficiaries / Bio Data Sub-tab ───
function BeneficiaryManagement() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editBen, setEditBen] = useState<Beneficiary | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', state: '', bank_branch: '', department: '', employee_id: '', nhf_number: '', phone_number: '', email: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('beneficiaries').select('*').order('name');
    setBeneficiaries(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return beneficiaries.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.employee_id.toLowerCase().includes(q) ||
      (b.nhf_number && b.nhf_number.toLowerCase().includes(q)) ||
      (b.loan_reference_number && b.loan_reference_number.toLowerCase().includes(q))
    );
  }, [beneficiaries, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(b => b.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    // First delete related transactions
    const ids = Array.from(selected);
    await supabase.from('transactions').delete().in('beneficiary_id', ids);
    const { error } = await supabase.from('beneficiaries').delete().in('id', ids);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${ids.length} beneficiary record(s) deleted successfully.`);
      setSelected(new Set());
      fetchData();
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
  };

  const openEdit = (b: Beneficiary) => {
    setEditBen(b);
    setEditForm({
      name: b.name,
      state: b.state,
      bank_branch: b.bank_branch,
      department: b.department,
      employee_id: b.employee_id,
      nhf_number: b.nhf_number || '',
      phone_number: b.phone_number || '',
      email: b.email || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editBen) return;
    setSaving(true);
    const { error } = await supabase.from('beneficiaries').update({
      name: editForm.name,
      state: editForm.state,
      bank_branch: editForm.bank_branch,
      department: editForm.department,
      employee_id: editForm.employee_id,
      nhf_number: editForm.nhf_number,
      phone_number: editForm.phone_number,
      email: editForm.email,
    }).eq('id', editBen.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Beneficiary updated successfully.');
      setEditOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, NHF, Staff ID, Loan Ref..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete Selected ({selected.size})
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>NHF No.</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Loan Ref</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Loan Amount</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No records found.</TableCell></TableRow>
                ) : filtered.map((b, i) => (
                  <TableRow key={b.id} className={selected.has(b.id) ? 'bg-destructive/5' : ''}>
                    <TableCell><Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggleSelect(b.id)} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{b.name}</TableCell>
                    <TableCell className="text-xs font-mono">{b.nhf_number || '—'}</TableCell>
                    <TableCell className="text-xs">{b.employee_id}</TableCell>
                    <TableCell className="text-xs">{b.loan_reference_number || '—'}</TableCell>
                    <TableCell className="text-xs">{b.state || '—'}</TableCell>
                    <TableCell className="text-xs">{b.bank_branch || '—'}</TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(Number(b.loan_amount))}</TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(Number(b.outstanding_balance))}</TableCell>
                    <TableCell>
                      <Badge variant={b.status === 'completed' ? 'default' : 'secondary'} className="text-xs capitalize">{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setSelected(new Set([b.id])); setDeleteDialogOpen(true); }} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-3 border-t text-xs text-muted-foreground">
            Showing {filtered.length} of {beneficiaries.length} records
            {selected.size > 0 && <span className="ml-2 text-destructive font-medium">({selected.size} selected)</span>}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete <strong>{selected.size}</strong> beneficiary record(s) and all their associated loan repayment transactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : `Delete ${selected.size} Record(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Beneficiary</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2">
              <Label>Full Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Staff ID</Label>
              <Input value={editForm.employee_id} onChange={e => setEditForm(p => ({ ...p, employee_id: e.target.value }))} />
            </div>
            <div>
              <Label>NHF Number</Label>
              <Input value={editForm.nhf_number} onChange={e => setEditForm(p => ({ ...p, nhf_number: e.target.value }))} />
            </div>
            <div>
              <Label>Organization</Label>
              <Input value={editForm.department} onChange={e => setEditForm(p => ({ ...p, department: e.target.value }))} />
            </div>
            <div>
              <Label>State</Label>
              <Select value={editForm.state} onValueChange={v => setEditForm(p => ({ ...p, state: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch</Label>
              <Input value={editForm.bank_branch} onChange={e => setEditForm(p => ({ ...p, bank_branch: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editForm.phone_number} onChange={e => setEditForm(p => ({ ...p, phone_number: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Loan Repayment (Transactions) Sub-tab ───
function TransactionManagement() {
  const [transactions, setTransactions] = useState<(Transaction & { beneficiary_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ amount: '', rrr_number: '', date_paid: '', month_for: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: txns } = await supabase.from('transactions').select('*').order('date_paid', { ascending: false }).limit(1000);
    if (txns && txns.length > 0) {
      const benIds = [...new Set(txns.map(t => t.beneficiary_id))];
      const { data: bens } = await supabase.from('beneficiaries').select('id, name').in('id', benIds);
      const benMap = new Map(bens?.map(b => [b.id, b.name]) || []);
      setTransactions(txns.map(t => ({ ...t, beneficiary_name: benMap.get(t.beneficiary_id) || '—' })));
    } else {
      setTransactions([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter(t =>
      (t.beneficiary_name || '').toLowerCase().includes(q) ||
      t.rrr_number.toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selected);

    // Get amounts to reverse
    const toDelete = transactions.filter(t => ids.includes(t.id));
    const benAmounts = new Map<string, number>();
    toDelete.forEach(t => {
      benAmounts.set(t.beneficiary_id, (benAmounts.get(t.beneficiary_id) || 0) + Number(t.amount));
    });

    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) {
      toast.error(error.message);
    } else {
      // Note: sync_beneficiary_from_transactions trigger handles balance reversal automatically
      toast.success(`${ids.length} transaction(s) deleted successfully.`);
      setSelected(new Set());
      fetchData();
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
  };

  const openEdit = (t: Transaction) => {
    setEditTxn(t);
    setEditForm({
      amount: String(t.amount),
      rrr_number: t.rrr_number,
      date_paid: t.date_paid,
      month_for: String(t.month_for),
      notes: t.notes || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTxn) return;
    setSaving(true);
    const { error } = await supabase.from('transactions').update({
      amount: Number(editForm.amount),
      rrr_number: editForm.rrr_number,
      date_paid: editForm.date_paid,
      month_for: Number(editForm.month_for),
      notes: editForm.notes,
    }).eq('id', editTxn.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Transaction updated successfully.');
      setEditOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by beneficiary name or RRR..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete Selected ({selected.size})
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Beneficiary</TableHead>
                  <TableHead>RRR Number</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No transactions found.</TableCell></TableRow>
                ) : filtered.map((t, i) => (
                  <TableRow key={t.id} className={selected.has(t.id) ? 'bg-destructive/5' : ''}>
                    <TableCell><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm whitespace-nowrap">{t.beneficiary_name}</TableCell>
                    <TableCell className="text-xs font-mono">{t.rrr_number}</TableCell>
                    <TableCell className="text-xs">Month {t.month_for}</TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(Number(t.amount))}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(t.date_paid), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{t.notes || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setSelected(new Set([t.id])); setDeleteDialogOpen(true); }} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-3 border-t text-xs text-muted-foreground">
            Showing {filtered.length} of {transactions.length} records
            {selected.size > 0 && <span className="ml-2 text-destructive font-medium">({selected.size} selected)</span>}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete <strong>{selected.size}</strong> loan repayment transaction(s). Beneficiary balances will be automatically reversed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : `Delete ${selected.size} Transaction(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <Label>Amount</Label>
              <Input type="number" value={editForm.amount} onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Month For</Label>
              <Input type="number" value={editForm.month_for} onChange={e => setEditForm(p => ({ ...p, month_for: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>RRR Number</Label>
              <Input value={editForm.rrr_number} onChange={e => setEditForm(p => ({ ...p, rrr_number: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Payment Date</Label>
              <Input type="date" value={editForm.date_paid} onChange={e => setEditForm(p => ({ ...p, date_paid: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Batch Loan Repayment Sub-tab ───
function BatchRepaymentManagement() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editBatch, setEditBatch] = useState<any | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', state: '', bank_branch: '', status: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('loan_batches').select('*').order('created_at', { ascending: false });
    setBatches(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return batches.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.batch_code.toLowerCase().includes(q) ||
      (b.state && b.state.toLowerCase().includes(q))
    );
  }, [batches, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(b => b.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selected);
    // Delete related batch_repayments first
    await supabase.from('batch_repayments').delete().in('batch_id', ids);
    // Unlink beneficiaries from batch
    await supabase.from('beneficiaries').update({ batch_id: null }).in('batch_id', ids);
    const { error } = await supabase.from('loan_batches').delete().in('id', ids);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${ids.length} batch(es) deleted successfully.`);
      setSelected(new Set());
      fetchData();
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
  };

  const openEdit = (b: any) => {
    setEditBatch(b);
    setEditForm({ name: b.name, state: b.state, bank_branch: b.bank_branch, status: b.status });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editBatch) return;
    setSaving(true);
    const { error } = await supabase.from('loan_batches').update({
      name: editForm.name,
      state: editForm.state,
      bank_branch: editForm.bank_branch,
      status: editForm.status,
    }).eq('id', editBatch.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Batch updated successfully.');
      setEditOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by batch name, code, or state..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete Selected ({selected.size})
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Batch Name</TableHead>
                  <TableHead>Batch Code</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No batches found.</TableCell></TableRow>
                ) : filtered.map((b, i) => (
                  <TableRow key={b.id} className={selected.has(b.id) ? 'bg-destructive/5' : ''}>
                    <TableCell><Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggleSelect(b.id)} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{b.name}</TableCell>
                    <TableCell className="text-xs font-mono">{b.batch_code}</TableCell>
                    <TableCell className="text-xs">{b.state || '—'}</TableCell>
                    <TableCell className="text-xs">{b.bank_branch || '—'}</TableCell>
                    <TableCell><Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="text-xs capitalize">{b.status}</Badge></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(b.created_at), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setSelected(new Set([b.id])); setDeleteDialogOpen(true); }} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-3 border-t text-xs text-muted-foreground">
            Showing {filtered.length} of {batches.length} records
            {selected.size > 0 && <span className="ml-2 text-destructive font-medium">({selected.size} selected)</span>}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete <strong>{selected.size}</strong> loan batch(es) and all their associated repayment records. Beneficiaries will be unlinked from these batches. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : `Delete ${selected.size} Batch(es)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Loan Batch</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2">
              <Label>Batch Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>State</Label>
              <Select value={editForm.state} onValueChange={v => setEditForm(p => ({ ...p, state: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch</Label>
              <Input value={editForm.bank_branch} onChange={e => setEditForm(p => ({ ...p, bank_branch: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Data Management Tab ───
export default function DataManagementTab() {
  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <MessageSquare className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Deletion Request Process</p>
            <p className="text-xs text-muted-foreground mt-1">
              Loan Officers should submit deletion requests via the <strong>Feedback & Support</strong> module. Only Administrators can delete records from this panel after reviewing the request.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="beneficiaries" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="beneficiaries">Beneficiaries / Bio Data</TabsTrigger>
          <TabsTrigger value="transactions">Loan Repayment</TabsTrigger>
          <TabsTrigger value="batches">Batch Loan Repayment</TabsTrigger>
        </TabsList>

        <TabsContent value="beneficiaries" className="mt-4">
          <BeneficiaryManagement />
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          <TransactionManagement />
        </TabsContent>
        <TabsContent value="batches" className="mt-4">
          <BatchRepaymentManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

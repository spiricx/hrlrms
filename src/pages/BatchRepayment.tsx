import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Search, Plus, Banknote, ExternalLink, Loader2, ChevronLeft,
  FileSpreadsheet, History, TrendingDown, CalendarCheck, AlertTriangle, Clock, Eye, Trash2,
  Pencil, ChevronDown, ChevronRight, CalendarIcon
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency, formatDate, calculateLoan, formatTenor, stripTime, getOverdueAndArrears } from '@/lib/loanCalculations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatusBadge from '@/components/StatusBadge';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface LoanBatch {
  id: string;
  batch_code: string;
  name: string;
  state: string;
  bank_branch: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: string;
}

interface BatchBeneficiary {
  id: string;
  name: string;
  employee_id: string;
  loan_amount: number;
  monthly_emi: number;
  outstanding_balance: number;
  total_paid: number;
  status: string;
  state: string;
  bank_branch: string;
  batch_id: string | null;
  tenor_months: number;
  interest_rate: number;
  moratorium_months: number;
  disbursement_date: string;
  commencement_date: string;
  termination_date: string;
  nhf_number: string | null;
  loan_reference_number: string | null;
  department: string;
  default_count: number;
}

interface BatchRepaymentRecord {
  id: string;
  batch_id: string;
  month_for: number;
  expected_amount: number;
  actual_amount: number;
  rrr_number: string;
  payment_date: string;
  receipt_url: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export default function BatchRepayment() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin');

  const [batches, setBatches] = useState<LoanBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  // Create batch state
  const [createOpen, setCreateOpen] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [batchState, setBatchState] = useState('');
  const [batchBranch, setBatchBranch] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Assign beneficiaries state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBatch, setAssignBatch] = useState<LoanBatch | null>(null);
  const [unassigned, setUnassigned] = useState<BatchBeneficiary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);

  // Record payment state
  const [payOpen, setPayOpen] = useState(false);
  const [payBatch, setPayBatch] = useState<LoanBatch | null>(null);
  const [batchMembers, setBatchMembers] = useState<BatchBeneficiary[]>([]);
  const [payMonth, setPayMonth] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payRrr, setPayRrr] = useState('');
  const [payDate, setPayDate] = useState<Date | undefined>();
  const [payReceipt, setPayReceipt] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [payIncludedIds, setPayIncludedIds] = useState<Set<string>>(new Set());

  // Batch history state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBatch, setHistoryBatch] = useState<LoanBatch | null>(null);
  const [historyRecords, setHistoryRecords] = useState<BatchRepaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingRepaymentId, setDeletingRepaymentId] = useState<string | null>(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Batch detail view
  const [detailBatch, setDetailBatch] = useState<LoanBatch | null>(null);
  const [detailMembers, setDetailMembers] = useState<BatchBeneficiary[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailHistory, setDetailHistory] = useState<BatchRepaymentRecord[]>([]);
  const [detailTransactions, setDetailTransactions] = useState<Record<string, any[]>>({});

  // Expanded history rows and edit state
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [editBatchRepOpen, setEditBatchRepOpen] = useState(false);
  const [editBatchRep, setEditBatchRep] = useState<BatchRepaymentRecord | null>(null);
  const [editBatchRepAmount, setEditBatchRepAmount] = useState('');
  const [editBatchRepRrr, setEditBatchRepRrr] = useState('');
  const [editBatchRepDate, setEditBatchRepDate] = useState<Date | undefined>();
  const [editBatchRepReceipt, setEditBatchRepReceipt] = useState('');
  const [editBatchRepNotes, setEditBatchRepNotes] = useState('');
  const [editBatchRepSaving, setEditBatchRepSaving] = useState(false);
  const [editTxOpen, setEditTxOpen] = useState(false);
  const [editTx, setEditTx] = useState<{ id: string; beneficiary_id: string; beneficiary_name: string; amount: number; rrr_number: string; month_for: number; batch_repayment_id: string } | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxSaving, setEditTxSaving] = useState(false);

  const fetchBatches = async () => {
    const { data, error } = await supabase
      .from('loan_batches')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setBatches(data as LoanBatch[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchBatches();
    const channel = supabase
      .channel('batch-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_batches' }, () => fetchBatches())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Compute batch stats
  interface BatchStat {
    count: number;
    totalAmount: number;
    monthlyDue: number;
    outstanding: number;
    tenorMonths: number;
    arrearsAmount: number;
    monthsInArrears: number;
    lastPaymentDate: string | null;
    lastPaymentAmount: number | null;
  }
  const [batchStats, setBatchStats] = useState<Record<string, BatchStat>>({});
  useEffect(() => {
    if (batches.length === 0) return;
    const fetchStats = async () => {
      const { data } = await supabase
        .from('beneficiaries')
        .select('batch_id, loan_amount, monthly_emi, outstanding_balance, tenor_months, total_paid, commencement_date, status')
        .not('batch_id', 'is', null);

      // Fetch last batch repayment per batch
      const { data: repayments } = await supabase
        .from('batch_repayments')
        .select('batch_id, payment_date, actual_amount')
        .order('payment_date', { ascending: false });

      const lastPaymentMap: Record<string, { date: string; amount: number }> = {};
      if (repayments) {
        repayments.forEach((r: any) => {
          if (!lastPaymentMap[r.batch_id]) {
            lastPaymentMap[r.batch_id] = { date: r.payment_date, amount: Number(r.actual_amount) };
          }
        });
      }

      if (data) {
        const stats: Record<string, BatchStat> = {};
        data.forEach((b: any) => {
          if (!b.batch_id) return;
          if (!stats[b.batch_id]) stats[b.batch_id] = {
            count: 0, totalAmount: 0, monthlyDue: 0, outstanding: 0,
            tenorMonths: 0, arrearsAmount: 0, monthsInArrears: 0,
            lastPaymentDate: null, lastPaymentAmount: null,
          };
          const s = stats[b.batch_id];
          s.count++;
          s.totalAmount += Number(b.loan_amount);
          s.monthlyDue += Number(b.monthly_emi);
          s.outstanding += Number(b.outstanding_balance);
          // Use max tenor for display
          if (b.tenor_months > s.tenorMonths) s.tenorMonths = b.tenor_months;
          // Aggregate arrears
          const arrears = getOverdueAndArrears(
            b.commencement_date, b.tenor_months, Number(b.monthly_emi),
            Number(b.total_paid), Number(b.outstanding_balance), b.status
          );
          s.arrearsAmount += arrears.arrearsAmount;
          if (arrears.monthsInArrears > s.monthsInArrears) s.monthsInArrears = arrears.monthsInArrears;
        });
        // Attach last payment info
        Object.keys(stats).forEach(batchId => {
          const lp = lastPaymentMap[batchId];
          if (lp) {
            stats[batchId].lastPaymentDate = lp.date;
            stats[batchId].lastPaymentAmount = lp.amount;
          }
        });
        setBatchStats(stats);
      }
    };
    fetchStats();
  }, [batches]);

  const filtered = useMemo(() => batches.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.batch_code.toLowerCase().includes(search.toLowerCase());
    const matchState = stateFilter === 'all' || b.state === stateFilter;
    return matchSearch && matchState;
  }), [batches, search, stateFilter]);

  const generateBatchCode = () => {
    const year = new Date().getFullYear();
    const seq = String(batches.length + 1).padStart(3, '0');
    return `BATCH-${year}-${seq}`;
  };

  const handleCreateBatch = async () => {
    if (!batchName.trim()) {
      toast({ title: 'Validation Error', description: 'Batch name is required.', variant: 'destructive' });
      return;
    }
    if (!batchState) {
      toast({ title: 'Validation Error', description: 'State is required.', variant: 'destructive' });
      return;
    }
    setCreatingBatch(true);
    const code = generateBatchCode();
    const { error } = await supabase.from('loan_batches').insert({
      batch_code: code,
      name: batchName.trim(),
      state: batchState,
      bank_branch: batchBranch,
      created_by: user?.id || null,
    } as any);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Batch Created', description: `${code} created successfully.` });
      setCreateOpen(false);
      setBatchName('');
      setBatchState('');
      setBatchBranch('');
      fetchBatches();
    }
    setCreatingBatch(false);
  };

  const openAssign = async (batch: LoanBatch) => {
    setAssignBatch(batch);
    setSelectedIds(new Set());
    setAssignOpen(true);
    setAssignLoading(true);
    // Get unassigned beneficiaries in same state
    const { data } = await supabase
      .from('beneficiaries')
      .select('id, name, employee_id, loan_amount, monthly_emi, outstanding_balance, total_paid, status, state, bank_branch, batch_id, tenor_months, interest_rate, moratorium_months, disbursement_date, commencement_date, termination_date, nhf_number, loan_reference_number, department, default_count')
      .is('batch_id', null)
      .eq('state', batch.state)
      .eq('status', 'active');
    setUnassigned((data as BatchBeneficiary[]) || []);
    setAssignLoading(false);
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0 || !assignBatch) return;
    setAssignLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('beneficiaries')
      .update({ batch_id: assignBatch.id } as any)
      .in('id', ids);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Assigned', description: `${ids.length} beneficiaries added to batch.` });
      setAssignOpen(false);
      fetchBatches();
    }
    setAssignLoading(false);
  };

  const openRecordPayment = async (batch: LoanBatch) => {
    setPayBatch(batch);
    setPayMonth('');
    setPayAmount('');
    setPayRrr('');
    setPayDate(undefined);
    setPayReceipt('');
    setPayNotes('');
    setPayOpen(true);
    // Load batch members
    const { data } = await supabase
      .from('beneficiaries')
      .select('id, name, employee_id, loan_amount, monthly_emi, outstanding_balance, total_paid, status, state, bank_branch, batch_id, tenor_months, interest_rate, moratorium_months, disbursement_date, commencement_date, termination_date, nhf_number, loan_reference_number, department, default_count')
      .eq('batch_id', batch.id)
      .eq('status', 'active');
    const members = (data as BatchBeneficiary[]) || [];
    setBatchMembers(members);
    // All members included by default
    setPayIncludedIds(new Set(members.map(m => m.id)));
  };

  const includedMembers = useMemo(() => {
    return batchMembers.filter(b => payIncludedIds.has(b.id));
  }, [batchMembers, payIncludedIds]);

  const expectedAmount = useMemo(() => {
    return includedMembers.reduce((sum, b) => sum + Number(b.monthly_emi), 0);
  }, [includedMembers]);

  const toggleMemberInclusion = useCallback((id: string) => {
    setPayIncludedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllMembers = useCallback((checked: boolean) => {
    if (checked) {
      setPayIncludedIds(new Set(batchMembers.map(m => m.id)));
    } else {
      setPayIncludedIds(new Set());
    }
  }, [batchMembers]);

  const handleRecordBatchPayment = async () => {
    if (!payBatch || !payDate) return;

    if (includedMembers.length === 0) {
      toast({ title: 'Validation Error', description: 'At least one member must be included.', variant: 'destructive' });
      return;
    }

    if (!payMonth) {
      toast({ title: 'Validation Error', description: 'Select repayment month.', variant: 'destructive' });
      return;
    }
    // Parse comma-separated RRRs
    const rrrList = payRrr.split(',').map(r => r.trim()).filter(Boolean);
    if (rrrList.length === 0) {
      toast({ title: 'Validation Error', description: 'At least one Remita RRR is required.', variant: 'destructive' });
      return;
    }
    if (rrrList.length > 2) {
      toast({ title: 'Validation Error', description: 'Maximum of 2 RRR numbers allowed.', variant: 'destructive' });
      return;
    }

    const actualAmount = Number(payAmount) || expectedAmount;
    if (actualAmount <= 0) {
      toast({ title: 'Validation Error', description: 'Invalid amount.', variant: 'destructive' });
      return;
    }

    // Check duplicate RRR in batch_repayments for each RRR
    for (const rrr of rrrList) {
      const { data: existingBatch } = await supabase
        .from('batch_repayments')
        .select('id')
        .eq('rrr_number', rrr)
        .maybeSingle();
      if (existingBatch) {
        toast({ title: 'Duplicate RRR', description: `RRR "${rrr}" has already been used for a batch repayment.`, variant: 'destructive' });
        return;
      }
    }
    // Also check the combined string for duplicates
    const combinedRrr = rrrList.join(', ');

    setSaving(true);

    // 1. Record batch repayment
    const { error: batchError } = await supabase.from('batch_repayments').insert({
      batch_id: payBatch.id,
      month_for: Number(payMonth),
      expected_amount: expectedAmount,
      actual_amount: actualAmount,
      rrr_number: combinedRrr,
      payment_date: format(payDate, 'yyyy-MM-dd'),
      receipt_url: payReceipt.trim() || '',
      notes: payNotes.trim(),
      recorded_by: user?.id || null,
    } as any);

    if (batchError) {
      toast({ title: 'Error', description: batchError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Record individual transactions only for INCLUDED members
    const finalAmount = actualAmount;
    const isPartial = finalAmount < expectedAmount;
    const ratio = isPartial ? finalAmount / expectedAmount : 1;
    const datePaid = format(payDate, 'yyyy-MM-dd');
    const monthFor = Number(payMonth);

    let successCount = 0;
    let errorCount = 0;

    for (const member of includedMembers) {
      const memberAmount = Math.round(Number(member.monthly_emi) * ratio * 100) / 100;

      // Insert individual transaction
      const { error: txError } = await supabase.from('transactions').insert({
        beneficiary_id: member.id,
        amount: memberAmount,
        rrr_number: combinedRrr,
        date_paid: datePaid,
        month_for: monthFor,
        recorded_by: user?.id || null,
        receipt_url: payReceipt.trim(),
        notes: `Batch ${payBatch.batch_code}: ${payNotes.trim()}`.trim(),
      });

      if (txError) {
        errorCount++;
        continue;
      }

      // Update beneficiary balance
      const newTotalPaid = Number(member.total_paid) + memberAmount;
      const newOutstanding = Math.max(0, Number(member.outstanding_balance) - memberAmount);

      await supabase.from('beneficiaries').update({
        total_paid: newTotalPaid,
        outstanding_balance: newOutstanding,
        status: newOutstanding <= 0 ? 'completed' : member.status,
      }).eq('id', member.id);

      successCount++;
    }

    const excludedCount = batchMembers.length - includedMembers.length;

    setSaving(false);
    setPayOpen(false);

    if (errorCount > 0) {
      toast({
        title: 'Partial Success',
        description: `${successCount} recorded, ${errorCount} failed. Check individual records.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Batch Repayment Recorded',
        description: `${successCount} beneficiaries updated${excludedCount > 0 ? `, ${excludedCount} excluded` : ''} with RRR ${combinedRrr}.`,
      });
    }
    fetchBatches();
  };

  const openHistory = async (batch: LoanBatch) => {
    setHistoryBatch(batch);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('batch_repayments')
      .select('*')
      .eq('batch_id', batch.id)
      .order('month_for', { ascending: true });
    setHistoryRecords((data as BatchRepaymentRecord[]) || []);
    setHistoryLoading(false);
    setSelectedHistoryIds(new Set());
  };

  const handleDeleteBatchRepayment = async (record: BatchRepaymentRecord) => {
    setDeletingRepaymentId(record.id);
    try {
      // 1. Find and reverse individual transactions with this RRR for batch members
      const { data: members } = await supabase
        .from('beneficiaries')
        .select('id')
        .eq('batch_id', record.batch_id);
      const memberIds = (members || []).map((m: any) => m.id);

      if (memberIds.length > 0) {
        const { data: txs } = await supabase
          .from('transactions')
          .select('id, beneficiary_id, amount')
          .eq('rrr_number', record.rrr_number)
          .in('beneficiary_id', memberIds);

        if (txs && txs.length > 0) {
          // Reverse balances
          for (const tx of txs) {
            const { data: ben } = await supabase
              .from('beneficiaries')
              .select('total_paid, outstanding_balance')
              .eq('id', tx.beneficiary_id)
              .single();
            if (ben) {
              await supabase.from('beneficiaries').update({
                total_paid: Math.max(0, Number(ben.total_paid) - Number(tx.amount)),
                outstanding_balance: Number(ben.outstanding_balance) + Number(tx.amount),
                status: 'active',
              }).eq('id', tx.beneficiary_id);
            }
          }
          // Delete transactions
          await supabase.from('transactions').delete().in('id', txs.map(t => t.id));
        }
      }

      // 2. Delete batch repayment record
      const { error } = await supabase.from('batch_repayments').delete().eq('id', record.id);
      if (error) throw error;

      setHistoryRecords(prev => prev.filter(r => r.id !== record.id));
      setSelectedHistoryIds(prev => { const n = new Set(prev); n.delete(record.id); return n; });
      toast({ title: 'Deleted', description: `Batch repayment for Month ${record.month_for} reversed and deleted.` });
      fetchBatches();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete.', variant: 'destructive' });
    } finally {
      setDeletingRepaymentId(null);
    }
  };

  const handleBulkDeleteBatchRepayments = async () => {
    if (selectedHistoryIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const toDelete = historyRecords.filter(r => selectedHistoryIds.has(r.id));
      for (const record of toDelete) {
        await handleDeleteBatchRepayment(record);
      }
      setSelectedHistoryIds(new Set());
      toast({ title: 'Bulk Delete Complete', description: `${toDelete.length} repayment record(s) reversed and deleted.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Bulk delete failed.', variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleHistorySelect = (id: string) => {
    setSelectedHistoryIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAllHistorySelect = () => {
    if (selectedHistoryIds.size === historyRecords.length) {
      setSelectedHistoryIds(new Set());
    } else {
      setSelectedHistoryIds(new Set(historyRecords.map(r => r.id)));
    }
  };

  const toggleHistoryExpand = (id: string) => {
    setExpandedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getTransactionsForBatchRepayment = (batchRepayment: BatchRepaymentRecord) => {
    const allTxs: any[] = [];
    Object.entries(detailTransactions).forEach(([benId, txs]) => {
      txs.forEach((tx: any) => {
        if (tx.rrr_number === batchRepayment.rrr_number && tx.month_for === batchRepayment.month_for) {
          const member = detailMembers.find(m => m.id === benId);
          allTxs.push({ ...tx, beneficiary_name: member?.name || 'Unknown' });
        }
      });
    });
    return allTxs;
  };

  const openEditTx = (tx: any, batchRepaymentId: string) => {
    setEditTx({
      id: tx.id,
      beneficiary_id: tx.beneficiary_id,
      beneficiary_name: tx.beneficiary_name,
      amount: Number(tx.amount),
      rrr_number: tx.rrr_number,
      month_for: tx.month_for,
      batch_repayment_id: batchRepaymentId,
    });
    setEditTxAmount(String(Number(tx.amount)));
    setEditTxOpen(true);
  };

  const handleEditTxSave = async () => {
    if (!editTx) return;
    const newAmount = parseFloat(editTxAmount);
    if (isNaN(newAmount) || newAmount < 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setEditTxSaving(true);
    try {
      const oldAmount = editTx.amount;
      const diff = newAmount - oldAmount;

      const { error: txErr } = await supabase.from('transactions').update({ amount: newAmount }).eq('id', editTx.id);
      if (txErr) throw txErr;

      const { data: ben } = await supabase.from('beneficiaries').select('total_paid, outstanding_balance').eq('id', editTx.beneficiary_id).single();
      if (ben) {
        await supabase.from('beneficiaries').update({
          total_paid: Math.max(0, Number(ben.total_paid) + diff),
          outstanding_balance: Math.max(0, Number(ben.outstanding_balance) - diff),
        }).eq('id', editTx.beneficiary_id);
      }

      const { data: batchRep } = await supabase.from('batch_repayments').select('actual_amount').eq('id', editTx.batch_repayment_id).single();
      if (batchRep) {
        await supabase.from('batch_repayments').update({
          actual_amount: Number(batchRep.actual_amount) + diff,
        }).eq('id', editTx.batch_repayment_id);
      }

      toast({ title: 'Updated', description: `${editTx.beneficiary_name}'s payment updated to ${formatCurrency(newAmount)}.` });
      setEditTxOpen(false);
      setEditTx(null);

      if (detailBatch) openDetail(detailBatch);
      fetchBatches();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update.', variant: 'destructive' });
    } finally {
      setEditTxSaving(false);
    }
  };

  const openEditBatchRep = (record: BatchRepaymentRecord) => {
    setEditBatchRep(record);
    setEditBatchRepAmount(String(Number(record.actual_amount)));
    setEditBatchRepRrr(record.rrr_number);
    setEditBatchRepDate(new Date(record.payment_date));
    setEditBatchRepReceipt(record.receipt_url || '');
    setEditBatchRepNotes(record.notes || '');
    setEditBatchRepOpen(true);
  };

  const handleEditBatchRepSave = async () => {
    if (!editBatchRep) return;
    const newAmount = parseFloat(editBatchRepAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    if (!editBatchRepRrr.trim()) {
      toast({ title: 'RRR is required', variant: 'destructive' });
      return;
    }
    if (!editBatchRepDate) {
      toast({ title: 'Payment date is required', variant: 'destructive' });
      return;
    }
    setEditBatchRepSaving(true);
    try {
      const oldAmount = Number(editBatchRep.actual_amount);
      const diff = newAmount - oldAmount;
      const newDateStr = format(editBatchRepDate, 'yyyy-MM-dd');
      const newRrr = editBatchRepRrr.trim();

      // Update batch repayment record
      const { error } = await supabase.from('batch_repayments').update({
        actual_amount: newAmount,
        rrr_number: newRrr,
        payment_date: newDateStr,
        receipt_url: editBatchRepReceipt.trim() || '',
        notes: editBatchRepNotes.trim(),
      }).eq('id', editBatchRep.id);
      if (error) throw error;

      // If amount changed, update individual transactions proportionally
      if (diff !== 0) {
        const { data: members } = await supabase
          .from('beneficiaries')
          .select('id')
          .eq('batch_id', editBatchRep.batch_id);
        const memberIds = (members || []).map((m: any) => m.id);

        if (memberIds.length > 0) {
          const { data: txs } = await supabase
            .from('transactions')
            .select('id, beneficiary_id, amount')
            .eq('rrr_number', editBatchRep.rrr_number)
            .eq('month_for', editBatchRep.month_for)
            .in('beneficiary_id', memberIds);

          if (txs && txs.length > 0) {
            const oldTxTotal = txs.reduce((s, t) => s + Number(t.amount), 0);
            for (const tx of txs) {
              const ratio = oldTxTotal > 0 ? Number(tx.amount) / oldTxTotal : 1 / txs.length;
              const txNewAmount = Math.round(newAmount * ratio * 100) / 100;
              const txDiff = txNewAmount - Number(tx.amount);

              await supabase.from('transactions').update({
                amount: txNewAmount,
                rrr_number: newRrr,
                date_paid: newDateStr,
                receipt_url: editBatchRepReceipt.trim() || '',
              }).eq('id', tx.id);

              // Update beneficiary balance
              const { data: ben } = await supabase.from('beneficiaries')
                .select('total_paid, outstanding_balance')
                .eq('id', tx.beneficiary_id).single();
              if (ben) {
                await supabase.from('beneficiaries').update({
                  total_paid: Math.max(0, Number(ben.total_paid) + txDiff),
                  outstanding_balance: Math.max(0, Number(ben.outstanding_balance) - txDiff),
                }).eq('id', tx.beneficiary_id);
              }
            }
          }
        }
      } else {
        // Amount didn't change but RRR/date/receipt might have — update transactions metadata
        const { data: members } = await supabase
          .from('beneficiaries')
          .select('id')
          .eq('batch_id', editBatchRep.batch_id);
        const memberIds = (members || []).map((m: any) => m.id);
        if (memberIds.length > 0) {
          await supabase.from('transactions').update({
            rrr_number: newRrr,
            date_paid: newDateStr,
            receipt_url: editBatchRepReceipt.trim() || '',
          }).eq('rrr_number', editBatchRep.rrr_number)
            .eq('month_for', editBatchRep.month_for)
            .in('beneficiary_id', memberIds);
        }
      }

      toast({ title: 'Updated', description: `Batch repayment for Month ${editBatchRep.month_for} updated.` });
      setEditBatchRepOpen(false);
      setEditBatchRep(null);
      if (detailBatch) openDetail(detailBatch);
      fetchBatches();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update.', variant: 'destructive' });
    } finally {
      setEditBatchRepSaving(false);
    }
  };

  const openDetail = async (batch: LoanBatch) => {
    setDetailBatch(batch);
    setDetailLoading(true);
    const [membersRes, histRes] = await Promise.all([
      supabase
        .from('beneficiaries')
        .select('id, name, employee_id, loan_amount, monthly_emi, outstanding_balance, total_paid, status, state, bank_branch, batch_id, tenor_months, interest_rate, moratorium_months, disbursement_date, commencement_date, termination_date, nhf_number, loan_reference_number, department, default_count')
        .eq('batch_id', batch.id),
      supabase
        .from('batch_repayments')
        .select('*')
        .eq('batch_id', batch.id)
        .order('month_for', { ascending: true }),
    ]);
    const members = (membersRes.data as BatchBeneficiary[]) || [];
    setDetailMembers(members);
    setDetailHistory((histRes.data as BatchRepaymentRecord[]) || []);

    // Fetch transactions for all members
    if (members.length > 0) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .in('beneficiary_id', members.map(m => m.id))
        .order('month_for', { ascending: true });
      const grouped: Record<string, any[]> = {};
      (txData || []).forEach((tx: any) => {
        if (!grouped[tx.beneficiary_id]) grouped[tx.beneficiary_id] = [];
        grouped[tx.beneficiary_id].push(tx);
      });
      setDetailTransactions(grouped);
    } else {
      setDetailTransactions({});
    }
    setDetailLoading(false);
  };

  const exportBatchReport = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = filtered.map(b => {
      const s = batchStats[b.id] || { count: 0, totalAmount: 0, monthlyDue: 0 };
      return {
        'Batch Code': b.batch_code,
        'Batch Name': b.name,
        'State': b.state,
        'Branch': b.bank_branch,
        'Total Beneficiaries': s.count,
        'Disbursed Amount (₦)': s.totalAmount,
        'Monthly Due (₦)': s.monthlyDue,
        'Status': b.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(summaryData);
    ws['!cols'] = [
      { wch: 18 }, { wch: 35 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Batch Summary');

    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbOut], { type: 'application/octet-stream' }), `Batch_Repayment_Report_${today}.xlsx`);
    toast({ title: 'Exported', description: 'Excel report downloaded.' });
  };

  // Detail view computed stats
  const batchTotalDisbursed = detailMembers.reduce((s, m) => s + Number(m.loan_amount), 0);
  const batchTotalPaid = detailMembers.reduce((s, m) => s + Number(m.total_paid), 0);
  const batchTotalOutstanding = detailMembers.reduce((s, m) => s + Number(m.outstanding_balance), 0);
  const batchMonthlyDue = detailMembers.reduce((s, m) => s + Number(m.monthly_emi), 0);
  const batchTotalExpected = detailMembers.reduce((s, m) => {
    const loan = calculateLoan({ principal: Number(m.loan_amount), annualRate: Number(m.interest_rate), tenorMonths: m.tenor_months, moratoriumMonths: m.moratorium_months, disbursementDate: new Date(m.disbursement_date) });
    return s + loan.totalPayment;
  }, 0);
  const batchRecoveryRate = batchTotalExpected > 0 ? Math.round((batchTotalPaid / batchTotalExpected) * 100) : 0;
  const batchActiveCount = detailMembers.filter(m => m.status === 'active').length;
  const batchCompletedCount = detailMembers.filter(m => m.status === 'completed').length;

  // Count members in arrears
  const today = stripTime(new Date());
  const membersInArrears = detailMembers.filter(m => {
    if (m.status === 'completed') return false;
    const txs = detailTransactions[m.id] || [];
    const paidMonths = new Set(txs.map((t: any) => t.month_for));
    const loan = calculateLoan({ principal: Number(m.loan_amount), annualRate: Number(m.interest_rate), tenorMonths: m.tenor_months, moratoriumMonths: m.moratorium_months, disbursementDate: new Date(m.disbursement_date) });
    return loan.schedule.some(entry => {
      const dueDay = stripTime(entry.dueDate);
      return dueDay < today && !paidMonths.has(entry.month);
    });
  }).length;

  // Detail view
  if (detailBatch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDetailBatch(null)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Batches
          </Button>
        </div>
        <div>
          <h1 className="text-3xl font-bold font-display">{detailBatch.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detailBatch.batch_code} • {detailBatch.state} {detailBatch.bank_branch && `• ${detailBatch.bank_branch}`}
            {' • Created: '}{formatDate(new Date(detailBatch.created_at))}
          </p>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Enhanced Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-card rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Package className="w-4 h-4" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="text-xl font-bold">{detailMembers.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{batchActiveCount} active, {batchCompletedCount} completed</p>
              </div>
              <div className="bg-card rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Banknote className="w-4 h-4" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Total Disbursed</p>
                <p className="text-xl font-bold">{formatCurrency(batchTotalDisbursed)}</p>
              </div>
              <div className="bg-card rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-success/10 text-success"><CalendarCheck className="w-4 h-4" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Total Repaid</p>
                <p className="text-xl font-bold text-success">{formatCurrency(batchTotalPaid)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{batchRecoveryRate}% recovery</p>
              </div>
              <div className="bg-card rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-1.5 rounded-lg ${batchTotalOutstanding > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}><TrendingDown className="w-4 h-4" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                <p className={`text-xl font-bold ${batchTotalOutstanding > 0 ? 'text-warning' : 'text-success'}`}>{formatCurrency(batchTotalOutstanding)}</p>
              </div>
              <div className="bg-card rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Clock className="w-4 h-4" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Monthly Due</p>
                <p className="text-xl font-bold">{formatCurrency(batchMonthlyDue)}</p>
              </div>
              <div className="bg-card rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-1.5 rounded-lg ${membersInArrears > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}><AlertTriangle className="w-4 h-4" /></div>
                </div>
                <p className="text-xs text-muted-foreground">Members in Arrears</p>
                <p className={`text-xl font-bold ${membersInArrears > 0 ? 'text-destructive' : 'text-success'}`}>{membersInArrears}</p>
              </div>
            </div>

            {/* Tabs for detailed info */}
            <Tabs defaultValue="members" className="space-y-4">
              <TabsList className="bg-secondary">
                <TabsTrigger value="members">Loan Register</TabsTrigger>
                <TabsTrigger value="history">Repayment History</TabsTrigger>
                <TabsTrigger value="schedule">Batch Amortization</TabsTrigger>
              </TabsList>

              {/* Members / Loan Register Tab */}
              <TabsContent value="members">
                <div className="bg-card rounded-xl shadow-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">NHF No.</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Ref</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly EMI</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Paid</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount in Arrears</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Months in Arrears</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment Date</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment Made</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {detailMembers.map(m => {
                          const mArrears = getOverdueAndArrears(m.commencement_date, m.tenor_months, Number(m.monthly_emi), Number(m.total_paid), Number(m.outstanding_balance), m.status);
                          const mTxs = (detailTransactions[m.id] || []).sort((a: any, b: any) => new Date(b.date_paid).getTime() - new Date(a.date_paid).getTime());
                          const mLastTx = mTxs[0] || null;
                          return (
                          <tr key={m.id} className="table-row-highlight cursor-pointer" onClick={() => navigate(`/beneficiary/${m.id}`)}>
                            <td className="px-4 py-3 font-medium text-primary hover:underline">{m.name}</td>
                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{m.nhf_number || '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{m.loan_reference_number || m.employee_id}</td>
                            <td className="px-4 py-3 text-muted-foreground">{formatTenor(m.tenor_months)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(Number(m.loan_amount))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(Number(m.monthly_emi))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(Number(m.total_paid))}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(m.outstanding_balance))}</td>
                            <td className={`px-4 py-3 text-right font-medium ${mArrears.arrearsAmount > 0 ? 'text-destructive' : ''}`}>{mArrears.arrearsAmount > 0 ? formatCurrency(mArrears.arrearsAmount) : '—'}</td>
                            <td className={`px-4 py-3 text-right font-medium ${mArrears.monthsInArrears > 0 ? 'text-destructive' : ''}`}>{mArrears.monthsInArrears > 0 ? mArrears.monthsInArrears : '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{mLastTx ? formatDate(new Date(mLastTx.date_paid)) : '—'}</td>
                            <td className="px-4 py-3 text-right">{mLastTx ? formatCurrency(Number(mLastTx.amount)) : '—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/beneficiary/${m.id}`); }}>
                                  <Eye className="w-3 h-3" /> View
                                </Button>
                                {(isAdmin || hasRole('loan_officer')) && mLastTx && (
                                  <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => {
                                    e.stopPropagation();
                                    // Find the batch_repayment that matches this transaction
                                    const matchingBatchRep = detailHistory.find(h => h.rrr_number === mLastTx.rrr_number && h.month_for === mLastTx.month_for);
                                    openEditTx({ ...mLastTx, beneficiary_name: m.name }, matchingBatchRep?.id || '');
                                  }}>
                                    <Pencil className="w-3 h-3" /> Edit
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                        {detailMembers.length === 0 && (
                          <tr><td colSpan={14} className="px-4 py-12 text-center text-muted-foreground">No members in this batch yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* Batch Repayment History Tab */}
              <TabsContent value="history">
                <div className="bg-card rounded-xl shadow-card overflow-hidden">
                  {detailHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No batch repayments recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/50">
                            <th className="px-2 py-3 w-8"></th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected (₦)</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actual (₦)</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variance (₦)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">RRR</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipt</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                            {(isAdmin || hasRole('loan_officer')) && (
                              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {detailHistory.map(r => {
                            const variance = Number(r.actual_amount) - Number(r.expected_amount);
                            const isExpanded = expandedHistoryIds.has(r.id);
                            const memberTxs = isExpanded ? getTransactionsForBatchRepayment(r) : [];
                            return (
                              <>
                              <tr key={r.id} className="table-row-highlight cursor-pointer" onClick={() => toggleHistoryExpand(r.id)}>
                                <td className="px-2 py-3 text-muted-foreground">
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </td>
                                <td className="px-4 py-3 font-medium">Month {r.month_for}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(Number(r.expected_amount))}</td>
                                <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(r.actual_amount))}</td>
                                <td className={`px-4 py-3 text-right font-medium ${variance < 0 ? 'text-destructive' : variance > 0 ? 'text-success' : ''}`}>
                                  {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs">{r.rrr_number}</td>
                                <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(r.payment_date))}</td>
                                <td className="px-4 py-3">
                                  {r.receipt_url ? (
                                    <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                      <ExternalLink className="w-3 h-3" /> View
                                    </a>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.notes || '—'}</td>
                                {(isAdmin || hasRole('loan_officer')) && (
                                  <td className="px-4 py-3 text-center">
                                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); openEditBatchRep(r); }}>
                                      <Pencil className="w-3 h-3" /> Edit
                                    </Button>
                                  </td>
                                )}
                              </tr>
                              {isExpanded && (
                                <tr key={`${r.id}-detail`}>
                                  <td colSpan={10} className="p-0">
                                    <div className="bg-muted/30 border-t border-b border-border">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-muted/50">
                                            <th className="px-6 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">EMI</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Paid</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variance</th>
                                            {(isAdmin || hasRole('loan_officer')) && (
                                              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                                            )}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                          {memberTxs.map((tx: any) => {
                                            const member = detailMembers.find(m => m.id === tx.beneficiary_id);
                                            const emi = member ? Number(member.monthly_emi) : 0;
                                            const txVariance = Number(tx.amount) - emi;
                                            return (
                                              <tr key={tx.id} className="table-row-highlight">
                                                <td className="px-6 py-2 font-medium text-sm">{tx.beneficiary_name}</td>
                                                <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(emi)}</td>
                                                <td className="px-4 py-2 text-right font-medium">{formatCurrency(Number(tx.amount))}</td>
                                                <td className={`px-4 py-2 text-right text-xs ${txVariance < 0 ? 'text-destructive' : txVariance > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                                  {txVariance >= 0 ? '+' : ''}{formatCurrency(txVariance)}
                                                </td>
                                                {(isAdmin || hasRole('loan_officer')) && (
                                                  <td className="px-4 py-2 text-center">
                                                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); openEditTx(tx, r.id); }}>
                                                      <Pencil className="w-3 h-3" /> Edit
                                                    </Button>
                                                  </td>
                                                )}
                                              </tr>
                                            );
                                          })}
                                          {memberTxs.length === 0 && (
                                            <tr><td colSpan={5} className="px-6 py-4 text-center text-muted-foreground text-xs">No individual transactions found for this batch payment.</td></tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              </>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
                            <td className="px-2 py-3"></td>
                            <td className="px-4 py-3">Totals</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(detailHistory.reduce((s, r) => s + Number(r.expected_amount), 0))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(detailHistory.reduce((s, r) => s + Number(r.actual_amount), 0))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(detailHistory.reduce((s, r) => s + Number(r.actual_amount) - Number(r.expected_amount), 0))}</td>
                            <td colSpan={5} className="px-4 py-3 text-muted-foreground text-xs">{detailHistory.length} payment(s) recorded</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Batch Amortization / Schedule Summary Tab */}
              <TabsContent value="schedule">
                <div className="bg-card rounded-xl shadow-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organisation</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disbursement</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commencement</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Termination</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Principal</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Interest</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Payment</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly EMI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {detailMembers.map(m => {
                          const loan = calculateLoan({ principal: Number(m.loan_amount), annualRate: Number(m.interest_rate), tenorMonths: m.tenor_months, moratoriumMonths: m.moratorium_months, disbursementDate: new Date(m.disbursement_date) });
                          return (
                            <tr key={m.id} className="table-row-highlight cursor-pointer" onClick={() => navigate(`/beneficiary/${m.id}`)}>
                              <td className="px-4 py-3 font-medium text-primary hover:underline">{m.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{m.department}</td>
                              <td className="px-4 py-3 text-muted-foreground">{formatTenor(m.tenor_months)}</td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(new Date(m.disbursement_date))}</td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(new Date(m.commencement_date))}</td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(new Date(m.termination_date))}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(Number(m.loan_amount))}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(loan.totalInterest)}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatCurrency(loan.totalPayment)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(loan.monthlyEMI)}</td>
                            </tr>
                          );
                        })}
                        {detailMembers.length === 0 && (
                          <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No members in this batch.</td></tr>
                        )}
                      </tbody>
                      {detailMembers.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
                            <td className="px-4 py-3">Totals ({detailMembers.length})</td>
                            <td colSpan={5}></td>
                            <td className="px-4 py-3 text-right">{formatCurrency(batchTotalDisbursed)}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {formatCurrency(detailMembers.reduce((s, m) => {
                                const l = calculateLoan({ principal: Number(m.loan_amount), annualRate: Number(m.interest_rate), tenorMonths: m.tenor_months, moratoriumMonths: m.moratorium_months, disbursementDate: new Date(m.disbursement_date) });
                                return s + l.totalInterest;
                              }, 0))}
                            </td>
                            <td className="px-4 py-3 text-right">{formatCurrency(batchTotalExpected)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(batchMonthlyDue)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Edit Batch Repayment Record Dialog */}
        <Dialog open={editBatchRepOpen} onOpenChange={setEditBatchRepOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Batch Repayment</DialogTitle>
              <DialogDescription>
                Update the batch repayment record for Month {editBatchRep?.month_for}.
              </DialogDescription>
            </DialogHeader>
            {editBatchRep && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Month</span><span className="font-medium">Month {editBatchRep.month_for}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Expected Amount</span><span className="font-medium">{formatCurrency(Number(editBatchRep.expected_amount))}</span></div>
                </div>
                <div className="space-y-2">
                  <Label>Actual Amount Paid (₦) *</Label>
                  <Input type="number" step="0.01" min="0" value={editBatchRepAmount} onChange={e => setEditBatchRepAmount(e.target.value)} placeholder="Enter amount" />
                  <p className="text-xs text-muted-foreground">Changing the amount will proportionally update all individual member transactions.</p>
                </div>
                <div className="space-y-2">
                  <Label>Remita Reference Number (RRR) *</Label>
                  <Input value={editBatchRepRrr} onChange={e => setEditBatchRepRrr(e.target.value)} placeholder="e.g. 3405-2458-5572" />
                  <p className="text-xs text-muted-foreground">Enter RRR in format XXXX-XXXX-XXXX.</p>
                </div>
                <div className="space-y-2">
                  <Label>Payment Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !editBatchRepDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editBatchRepDate ? format(editBatchRepDate, 'dd MMM yyyy') : 'Select payment date'}
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
                        selected={editBatchRepDate}
                        onSelect={setEditBatchRepDate}
                        disabled={(d) => d > new Date() || d < new Date('2016-01-01')}
                        captionLayout="dropdown-buttons"
                        fromYear={2016}
                        toYear={new Date().getFullYear()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Receipt URL</Label>
                  <Input value={editBatchRepReceipt} onChange={e => setEditBatchRepReceipt(e.target.value)} placeholder="https://remita.net/receipt/... (optional)" />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={editBatchRepNotes} onChange={e => setEditBatchRepNotes(e.target.value)} placeholder="Optional notes" rows={2} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditBatchRepOpen(false)} disabled={editBatchRepSaving}>Cancel</Button>
              <Button onClick={handleEditBatchRepSave} disabled={editBatchRepSaving}>
                {editBatchRepSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Individual Transaction Dialog */}
        <Dialog open={editTxOpen} onOpenChange={setEditTxOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Repayment</DialogTitle>
              <DialogDescription>
                Update the payment amount for {editTx?.beneficiary_name || 'this beneficiary'} (Month {editTx?.month_for}).
              </DialogDescription>
            </DialogHeader>
            {editTx && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Beneficiary</span><span className="font-medium">{editTx.beneficiary_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Month</span><span>Month {editTx.month_for}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">RRR</span><span className="font-mono text-xs">{editTx.rrr_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Current Amount</span><span className="font-medium">{formatCurrency(editTx.amount)}</span></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editTxAmount">New Amount (₦)</Label>
                  <Input
                    id="editTxAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editTxAmount}
                    onChange={e => setEditTxAmount(e.target.value)}
                    placeholder="Enter new amount"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTxOpen(false)} disabled={editTxSaving}>Cancel</Button>
              <Button onClick={handleEditTxSave} disabled={editTxSaving}>
                {editTxSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading batches...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display">Batch Repayment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage loan batches and record bulk repayments with a single Remita receipt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportBatchReport} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export to Excel
          </Button>
          {(isAdmin || hasRole('loan_officer')) && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Create Batch
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search batches..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        {isAdmin && (
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Batch Dashboard Table */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Disbursed (₦)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiaries</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding (₦)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Repayment (₦)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount in Arrears (₦)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Months in Arrears</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Payment Made (₦)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(batch => {
                const s = batchStats[batch.id] || { count: 0, totalAmount: 0, monthlyDue: 0, outstanding: 0, tenorMonths: 0, arrearsAmount: 0, monthsInArrears: 0, lastPaymentDate: null, lastPaymentAmount: null };
                return (
                  <tr key={batch.id} className="table-row-highlight">
                    <td className="px-4 py-3 font-mono text-xs">{batch.batch_code}</td>
                    <td className="px-4 py-3 font-medium">
                      <button onClick={() => openDetail(batch)} className="text-left hover:underline text-primary">
                        {batch.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{batch.state || '—'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.totalAmount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.tenorMonths > 0 ? formatTenor(s.tenorMonths) : '—'}</td>
                    <td className="px-4 py-3 text-right">{s.count}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.outstanding)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.monthlyDue)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${s.arrearsAmount > 0 ? 'text-destructive' : ''}`}>{s.arrearsAmount > 0 ? formatCurrency(s.arrearsAmount) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${s.monthsInArrears > 0 ? 'text-destructive' : ''}`}>{s.monthsInArrears > 0 ? s.monthsInArrears : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.lastPaymentDate ? formatDate(new Date(s.lastPaymentDate)) : '—'}</td>
                    <td className="px-4 py-3 text-right">{s.lastPaymentAmount != null ? formatCurrency(s.lastPaymentAmount) : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={batch.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <Button size="sm" onClick={() => openRecordPayment(batch)} className="gap-1 text-xs">
                          <Banknote className="w-3 h-3" /> Pay
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openAssign(batch)} className="text-xs">
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openHistory(batch)} className="text-xs">
                          <History className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-12 text-center text-muted-foreground">No batches found. Create your first batch to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Batch Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
            <DialogDescription>Group beneficiaries for bulk repayment processing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Batch Name *</Label>
              <Input value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="e.g. Lagos Civil Servants Q3 2025" />
            </div>
            <div>
              <Label>State *</Label>
              <Select value={batchState} onValueChange={setBatchState}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bank Branch (Optional)</Label>
              <Input value={batchBranch} onChange={e => setBatchBranch(e.target.value)} placeholder="e.g. Ikeja Branch" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBatch} disabled={creatingBatch}>
              {creatingBatch && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Beneficiaries Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Members to {assignBatch?.name}</DialogTitle>
            <DialogDescription>Select unassigned beneficiaries from {assignBatch?.state} to add to this batch.</DialogDescription>
          </DialogHeader>
          {assignLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No unassigned active beneficiaries found in {assignBatch?.state}.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (selectedIds.size === unassigned.length) setSelectedIds(new Set());
                    else setSelectedIds(new Set(unassigned.map(u => u.id)));
                  }}
                >
                  {selectedIds.size === unassigned.length ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto border rounded-lg divide-y divide-border">
                {unassigned.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => {
                        const next = new Set(selectedIds);
                        if (next.has(u.id)) next.delete(u.id);
                        else next.add(u.id);
                        setSelectedIds(next);
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.employee_id} • {formatCurrency(Number(u.monthly_emi))}/mo</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={selectedIds.size === 0 || assignLoading}>
              {assignLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add {selectedIds.size} Members
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Batch Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Record Batch Repayment</DialogTitle>
            <DialogDescription>One Remita receipt for all {batchMembers.length} members in {payBatch?.name}.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
          {payBatch && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-xs text-muted-foreground">Batch</p>
                  <p className="text-sm font-semibold">{payBatch.batch_code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Included Members</p>
                  <p className="text-sm font-semibold">{payIncludedIds.size} of {batchMembers.length}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Expected Monthly Repayment (included only)</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(expectedAmount)}</p>
                </div>
              </div>

              {/* Member inclusion checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Members</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={payIncludedIds.size === batchMembers.length}
                      onCheckedChange={(checked) => toggleAllMembers(!!checked)}
                    />
                    <span className="text-xs text-muted-foreground">Select All</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Untick members who did not pay. Only checked members will receive credit.</p>
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y divide-border">
                  {batchMembers.map(member => (
                    <label key={member.id} className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/30 cursor-pointer transition-colors">
                      <Checkbox
                        checked={payIncludedIds.has(member.id)}
                        onCheckedChange={() => toggleMemberInclusion(member.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.employee_id}</p>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{formatCurrency(Number(member.monthly_emi))}</span>
                    </label>
                  ))}
                </div>
                {batchMembers.length - payIncludedIds.size > 0 && (
                  <p className="text-xs text-warning mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {batchMembers.length - payIncludedIds.size} member(s) excluded — they will receive ₦0.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Repayment Month *</Label>
                  <Select value={payMonth} onValueChange={setPayMonth}>
                    <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => i + 1).map(m => (
                        <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Actual Amount Paid (₦)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder={`Default: ${formatCurrency(expectedAmount)}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to use expected amount. Enter different amount for partial payment.</p>
                </div>

                <div>
                  <Label>Remita Reference Number (RRR) *</Label>
                  <Input value={payRrr} onChange={e => setPayRrr(e.target.value)} placeholder="e.g. 3405-2458-5572 or 3405-2458-5572, 3405-2458-6789" />
                  <p className="text-xs text-muted-foreground mt-1">Enter RRR in format XXXX-XXXX-XXXX. For double/advance repayment, enter two RRRs separated by a comma.</p>
                </div>

                <div>
                  <Label>Payment Date (as on Remita receipt) *</Label>
                  <p className="text-xs text-muted-foreground mb-1">Enter the exact date shown on the Remita receipt — this is the official repayment date.</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !payDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {payDate ? format(payDate, 'dd MMM yyyy') : 'Select payment date'}
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
                        selected={payDate}
                        onSelect={setPayDate}
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
                  <Input value={payReceipt} onChange={e => setPayReceipt(e.target.value)} placeholder="https://remita.net/receipt/..." />
                </div>

                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. Partial payment due to deduction shortfall" rows={2} />
                </div>
              </div>
            </div>
          )}
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordBatchPayment} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Batch Repayment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Repayment History: {historyBatch?.name}</DialogTitle>
            <DialogDescription>All batch repayments recorded for {historyBatch?.batch_code}.</DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : historyRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No repayments recorded yet.</p>
          ) : (
            <>
              {(isAdmin || hasRole('loan_officer') || hasRole('manager')) && selectedHistoryIds.size > 0 && (
                <div className="flex items-center justify-between pb-2">
                  <span className="text-sm text-muted-foreground">{selectedHistoryIds.size} record(s) selected</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" disabled={bulkDeleting}>
                        {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                        Delete Selected ({selectedHistoryIds.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedHistoryIds.size} Batch Repayment(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will reverse all individual transactions for the selected records and restore each member's outstanding balance. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDeleteBatchRepayments} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete & Reverse All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    {(isAdmin || hasRole('loan_officer') || hasRole('manager')) && (
                      <th className="px-3 py-2 text-center">
                        <Checkbox
                          checked={selectedHistoryIds.size === historyRecords.length && historyRecords.length > 0}
                          onCheckedChange={toggleAllHistorySelect}
                        />
                      </th>
                    )}
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Month</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Expected</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Actual</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">RRR</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Receipt</th>
                    {(isAdmin || hasRole('loan_officer') || hasRole('manager')) && (
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyRecords.map(r => (
                    <tr key={r.id} className="table-row-highlight">
                      {(isAdmin || hasRole('loan_officer') || hasRole('manager')) && (
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={selectedHistoryIds.has(r.id)}
                            onCheckedChange={() => toggleHistorySelect(r.id)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2">Month {r.month_for}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(Number(r.expected_amount))}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(r.actual_amount))}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.rrr_number}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(new Date(r.payment_date))}</td>
                      <td className="px-3 py-2">
                        {r.receipt_url ? (
                          <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        ) : '—'}
                      </td>
                      {(isAdmin || hasRole('loan_officer') || hasRole('manager')) && (
                        <td className="px-3 py-2 text-center space-x-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setHistoryOpen(false); openEditBatchRep(r); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deletingRepaymentId === r.id}>
                                {deletingRepaymentId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Batch Repayment?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will reverse all individual transactions for Month {r.month_for} (RRR: {r.rrr_number}) and restore each member's outstanding balance. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteBatchRepayment(r)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete & Reverse
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

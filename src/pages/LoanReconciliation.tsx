import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  Loader2,
  ArrowLeftRight,
  Trash2,
  Save,
  History,
  Building2,
  CalendarDays,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CBNRow {
  rowIndex: number;
  remitaNumber: string;
  amount: number;
  receiptRef: string;
  rawData: Record<string, unknown>;
}

interface MatchResult {
  cbnRow: CBNRow;
  matchType: 'exact' | 'amount_mismatch' | 'unmatched';
  source?: 'individual' | 'batch';
  dbAmount?: number;
  dbReceiptUrl?: string;
  beneficiaryName?: string;
  batchName?: string;
  organisation?: string;
  beneficiaryId?: string;
  batchId?: string;
}

interface ReconciliationSession {
  id: string;
  organization: string;
  payment_month: number;
  payment_year: number;
  file_name: string;
  total_records: number;
  matched_count: number;
  mismatch_count: number;
  unmatched_count: number;
  total_cbn_amount: number;
  matched_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface ReconciliationMatch {
  id: string;
  session_id: string;
  rrr_number: string;
  beneficiary_name: string;
  batch_name: string;
  source: string;
  system_amount: number;
  cbn_amount: number;
  serial_number: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findColumn = (headers: string[], patterns: RegExp[]): string | null => {
  for (const h of headers) {
    for (const p of patterns) {
      if (p.test(h.toLowerCase().trim())) return h;
    }
  }
  return null;
};

const REMITA_PATTERNS = [/rrr/i, /remita/i, /retrieval/i, /reference/i, /ref/i];
const AMOUNT_PATTERNS = [/amount/i, /sum/i, /value/i, /paid/i, /credit/i];
const NAME_PATTERNS = [/name/i, /beneficiary/i, /customer/i, /payer/i, /subscriber/i];
const RECEIPT_PATTERNS = [/receipt/i, /url/i, /link/i, /proof/i];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (n: number) => '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2 });

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2015 }, (_, i) => currentYear - i);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoanReconciliation() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Reconcile state ──
  const [file, setFile] = useState<File | null>(null);
  const [cbnData, setCbnData] = useState<CBNRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [remitaCol, setRemitaCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [receiptCol, setReceiptCol] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Save dialog state ──
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveOrg, setSaveOrg] = useState('');
  const [saveMonth, setSaveMonth] = useState(String(new Date().getMonth() + 1));
  const [saveYear, setSaveYear] = useState(String(currentYear));
  const [saveNotes, setSaveNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── History state ──
  const [history, setHistory] = useState<ReconciliationSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [activeTab, setActiveTab] = useState('reconcile');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionMatches, setSessionMatches] = useState<Record<string, ReconciliationMatch[]>>({});
  const [matchesLoading, setMatchesLoading] = useState<string | null>(null);

  // ── Multi-delete state ──
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Edit session state ──
  const [editSession, setEditSession] = useState<ReconciliationSession | null>(null);
  const [editOrg, setEditOrg] = useState('');
  const [editMonth, setEditMonth] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ─── Parse Excel ──────────────────────────────────────────────────────────
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setReconciled(false);
    setResults([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (jsonData.length === 0) {
          toast({ title: 'Empty file', description: 'The Excel file has no data rows.', variant: 'destructive' });
          return;
        }

        const cols = Object.keys(jsonData[0]);
        setHeaders(cols);

        const autoRemita = findColumn(cols, REMITA_PATTERNS) || '';
        const autoAmount = findColumn(cols, AMOUNT_PATTERNS) || '';
        const autoName = findColumn(cols, NAME_PATTERNS) || '';
        const autoReceipt = findColumn(cols, RECEIPT_PATTERNS) || '';
        setRemitaCol(autoRemita);
        setAmountCol(autoAmount);
        setNameCol(autoName);
        setReceiptCol(autoReceipt);

        const rows: CBNRow[] = jsonData.map((row, i) => ({
          rowIndex: i + 1,
          remitaNumber: String(autoRemita ? row[autoRemita] ?? '' : '').trim(),
          amount: parseFloat(String(autoAmount ? row[autoAmount] ?? '0' : '0').replace(/,/g, '')) || 0,
          receiptRef: String(autoReceipt ? row[autoReceipt] ?? '' : '').trim(),
          rawData: row,
        }));

        setCbnData(rows);
        setParsed(true);
        toast({ title: 'File parsed', description: `${rows.length} rows loaded from ${f.name}` });
      } catch {
        toast({ title: 'Parse error', description: 'Could not read the Excel file.', variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(f);
  }, [toast]);

  const handleClear = useCallback(() => {
    setFile(null);
    setCbnData([]);
    setHeaders([]);
    setRemitaCol('');
    setAmountCol('');
    setNameCol('');
    setReceiptCol('');
    setResults([]);
    setParsed(false);
    setReconciled(false);
    setSearchTerm('');
  }, []);

  const remapData = useCallback(() => {
    if (!parsed || cbnData.length === 0) return;
    const remapped = cbnData.map((row) => ({
      ...row,
      remitaNumber: String(remitaCol ? row.rawData[remitaCol] ?? '' : '').trim(),
      amount: parseFloat(String(amountCol ? row.rawData[amountCol] ?? '0' : '0').replace(/,/g, '')) || 0,
      receiptRef: String(receiptCol ? row.rawData[receiptCol] ?? '' : '').trim(),
    }));
    setCbnData(remapped);
  }, [parsed, cbnData, remitaCol, amountCol, receiptCol]);

  // ─── Run Reconciliation ───────────────────────────────────────────────────
  const handleReconcile = async () => {
    if (cbnData.length === 0) return;
    setLoading(true);
    try {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('rrr_number, amount, receipt_url, beneficiary_id, beneficiaries(name, department)');

      const { data: batchRepayments } = await supabase
        .from('batch_repayments')
        .select('rrr_number, actual_amount, receipt_url, batch_id, loan_batches(name)');

      const txMap = new Map<string, { amount: number; receipt_url: string; name: string; names: string[]; beneficiaryId: string; organisation: string }>();
      (transactions || []).forEach((t: any) => {
        const rrr = (t.rrr_number || '').trim().toLowerCase();
        if (!rrr) return;
        const existing = txMap.get(rrr);
        const benefName = t.beneficiaries?.name || '';
        const dept = t.beneficiaries?.department || '';
        const benId = t.beneficiary_id || '';
        if (existing) {
          existing.amount += Number(t.amount);
          if (benefName && !existing.names.includes(benefName)) existing.names.push(benefName);
          existing.name = existing.names.join(', ');
          if (!existing.organisation && dept) existing.organisation = dept;
        } else {
          txMap.set(rrr, { amount: Number(t.amount), receipt_url: t.receipt_url || '', name: benefName, names: benefName ? [benefName] : [], beneficiaryId: benId, organisation: dept });
        }
      });

      const batchMap = new Map<string, { amount: number; receipt_url: string; batchName: string; batchId: string; organisation: string }>();
      (batchRepayments || []).forEach((b: any) => {
        const rrr = (b.rrr_number || '').trim().toLowerCase();
        if (!rrr) return;
        const existing = batchMap.get(rrr);
        const bName = b.loan_batches?.name || '';
        const bId = b.batch_id || '';
        if (existing) {
          existing.amount += Number(b.actual_amount);
          if (bName && !existing.batchName.includes(bName)) existing.batchName += ', ' + bName;
        } else {
          batchMap.set(rrr, { amount: Number(b.actual_amount), receipt_url: b.receipt_url || '', batchName: bName, batchId: bId, organisation: bName });
        }
      });

      const matchResults: MatchResult[] = cbnData.map((row) => {
        const rrr = row.remitaNumber.toLowerCase();
        if (txMap.has(rrr)) {
          const tx = txMap.get(rrr)!;
          return { cbnRow: row, matchType: Math.abs(tx.amount - row.amount) < 0.01 ? 'exact' : 'amount_mismatch', source: 'individual', dbAmount: tx.amount, dbReceiptUrl: tx.receipt_url, beneficiaryName: tx.name, beneficiaryId: tx.beneficiaryId, organisation: tx.organisation } as MatchResult;
        }
        if (batchMap.has(rrr)) {
          const b = batchMap.get(rrr)!;
          return { cbnRow: row, matchType: Math.abs(b.amount - row.amount) < 0.01 ? 'exact' : 'amount_mismatch', source: 'batch', dbAmount: b.amount, dbReceiptUrl: b.receipt_url, batchName: b.batchName, batchId: b.batchId, organisation: b.organisation } as MatchResult;
        }
        return { cbnRow: row, matchType: 'unmatched' } as MatchResult;
      });

      setResults(matchResults);
      setReconciled(true);

      const matched = matchResults.filter(r => r.matchType === 'exact').length;
      const mismatch = matchResults.filter(r => r.matchType === 'amount_mismatch').length;
      const unmatched = matchResults.filter(r => r.matchType === 'unmatched').length;

      toast({ title: 'Reconciliation Complete', description: `${matched} matched, ${mismatch} mismatches, ${unmatched} unmatched.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Reconciliation failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const matched = results.filter(r => r.matchType === 'exact');
    const mismatch = results.filter(r => r.matchType === 'amount_mismatch');
    const unmatched = results.filter(r => r.matchType === 'unmatched');
    const cbnTotal = results.reduce((s, r) => s + r.cbnRow.amount, 0);
    const matchedTotal = matched.reduce((s, r) => s + r.cbnRow.amount, 0);
    return { matched: matched.length, mismatch: mismatch.length, unmatched: unmatched.length, cbnTotal, matchedTotal };
  }, [results]);

  const isFullyMatched = reconciled && stats.unmatched === 0 && stats.mismatch === 0 && stats.matched > 0;
  const canSave = reconciled && stats.matched > 0;

  const filteredResults = useMemo(() => {
    if (!searchTerm) return results;
    const q = searchTerm.toLowerCase();
    return results.filter(r =>
      r.cbnRow.remitaNumber.toLowerCase().includes(q) ||
      r.beneficiaryName?.toLowerCase().includes(q) ||
      r.batchName?.toLowerCase().includes(q)
    );
  }, [results, searchTerm]);

  // ─── Export Results ───────────────────────────────────────────────────────
  const exportResults = () => {
    const exportData = results.map(r => ({
      'Row #': r.cbnRow.rowIndex,
      'CBN Remita Number': r.cbnRow.remitaNumber,
      'CBN Amount': r.cbnRow.amount,
      'CBN Receipt': r.cbnRow.receiptRef,
      'Status': r.matchType === 'exact' ? 'Matched' : r.matchType === 'amount_mismatch' ? 'Amount Mismatch' : 'Unmatched',
      'Source': r.source === 'individual' ? 'Loan Repayment' : r.source === 'batch' ? 'Batch Repayment' : '-',
      'System Amount': r.dbAmount ?? '-',
      'Variance': r.dbAmount != null ? (r.cbnRow.amount - r.dbAmount).toFixed(2) : '-',
      'Beneficiary / Batch': r.beneficiaryName || r.batchName || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation');
    XLSX.writeFile(wb, `Reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ─── Save to History ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!saveOrg.trim()) {
      toast({ title: 'Organization required', description: 'Please enter an organization name.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: sessionData, error } = await supabase
        .from('reconciliation_sessions')
        .insert({
          organization: saveOrg.trim(),
          payment_month: parseInt(saveMonth),
          payment_year: parseInt(saveYear),
          file_name: file?.name || '',
          total_records: results.length,
          matched_count: stats.matched,
          mismatch_count: stats.mismatch,
          unmatched_count: stats.unmatched,
          total_cbn_amount: stats.cbnTotal,
          matched_amount: stats.matchedTotal,
          notes: saveNotes.trim() || null,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Save individual matched rows for detail view
      const matchedRows = results.filter(r => r.matchType === 'exact');
      if (matchedRows.length > 0 && sessionData?.id) {
        const matchInserts = matchedRows.map(r => ({
          session_id: sessionData.id,
          rrr_number: r.cbnRow.remitaNumber,
          beneficiary_name: r.beneficiaryName || '',
          batch_name: r.batchName || '',
          source: r.source || '',
          system_amount: r.dbAmount ?? 0,
          cbn_amount: r.cbnRow.amount,
          serial_number: r.cbnRow.rowIndex,
        }));
        await supabase.from('reconciliation_matches').insert(matchInserts);
      }

      toast({ title: 'Saved!', description: `Reconciliation for ${saveOrg} – ${MONTHS[parseInt(saveMonth) - 1]} ${saveYear} has been recorded.` });
      setSaveOpen(false);
      setSaveOrg('');
      setSaveNotes('');
      fetchHistory();
      setActiveTab('history');
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Fetch Session Matches ────────────────────────────────────────────────
  const fetchSessionMatches = useCallback(async (sessionId: string) => {
    // Toggle collapse if already expanded
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    // If already fetched, just expand
    if (sessionMatches[sessionId]) {
      setExpandedSession(sessionId);
      return;
    }
    setMatchesLoading(sessionId);
    setExpandedSession(sessionId);
    try {
      const { data, error } = await supabase
        .from('reconciliation_matches')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setSessionMatches(prev => ({ ...prev, [sessionId]: (data || []) as ReconciliationMatch[] }));
    } catch (err: any) {
      toast({ title: 'Failed to load matches', description: err.message, variant: 'destructive' });
      setExpandedSession(null);
    } finally {
      setMatchesLoading(null);
    }
  }, [expandedSession, sessionMatches, toast]);

  // ─── Fetch History ────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('reconciliation_sessions')
        .select('*')
        .order('payment_year', { ascending: false })
        .order('payment_month', { ascending: false });

      if (error) throw error;
      setHistory((data || []) as ReconciliationSession[]);
    } catch (err: any) {
      toast({ title: 'Failed to load history', description: err.message, variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  // ─── History Filter ───────────────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    return history.filter(s => {
      if (filterOrg && !s.organization.toLowerCase().includes(filterOrg.toLowerCase())) return false;
      if (filterYear && String(s.payment_year) !== filterYear) return false;
      if (filterMonth && String(s.payment_month) !== filterMonth) return false;
      return true;
    });
  }, [history, filterOrg, filterYear, filterMonth]);

  // Group history by organization
  const groupedHistory = useMemo(() => {
    const groups: Record<string, ReconciliationSession[]> = {};
    filteredHistory.forEach(s => {
      if (!groups[s.organization]) groups[s.organization] = [];
      groups[s.organization].push(s);
    });
    return groups;
  }, [filteredHistory]);

  const orgNames = useMemo(() => [...new Set(history.map(s => s.organization))].sort(), [history]);

  // ─── Delete Sessions ──────────────────────────────────────────────────────
  const handleDeleteSelected = async () => {
    if (selectedSessions.size === 0) return;
    setDeleting(true);
    try {
      const ids = [...selectedSessions];
      // Delete matches first (child records)
      await supabase.from('reconciliation_matches').delete().in('session_id', ids);
      const { error } = await supabase.from('reconciliation_sessions').delete().in('id', ids);
      if (error) throw error;
      toast({ title: 'Deleted', description: `${ids.length} session${ids.length > 1 ? 's' : ''} deleted successfully.` });
      setSelectedSessions(new Set());
      setDeleteOpen(false);
      fetchHistory();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Open Edit Dialog ──────────────────────────────────────────────────────
  const openEdit = (s: ReconciliationSession) => {
    setEditSession(s);
    setEditOrg(s.organization);
    setEditMonth(String(s.payment_month));
    setEditYear(String(s.payment_year));
    setEditNotes(s.notes || '');
  };

  // ─── Save Edit ─────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editSession || !editOrg.trim()) return;
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from('reconciliation_sessions')
        .update({
          organization: editOrg.trim(),
          payment_month: parseInt(editMonth),
          payment_year: parseInt(editYear),
          notes: editNotes.trim() || null,
        })
        .eq('id', editSession.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Reconciliation session updated successfully.' });
      setEditSession(null);
      fetchHistory();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Export History ───────────────────────────────────────────────────────
  const exportHistory = () => {
    const data = filteredHistory.map(s => ({
      Organization: s.organization,
      Month: MONTHS[s.payment_month - 1],
      Year: s.payment_year,
      'File Name': s.file_name,
      'Total Records': s.total_records,
      Matched: s.matched_count,
      'Amount Mismatch': s.mismatch_count,
      Unmatched: s.unmatched_count,
      'Total CBN Amount': s.total_cbn_amount,
      'Matched Amount': s.matched_amount,
      Notes: s.notes || '',
      'Recorded At': new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation History');
    XLSX.writeFile(wb, `Reconciliation_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            Loan Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">Match CBN statement entries against Remita repayment records</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="reconcile" className="gap-2">
            <ArrowLeftRight className="w-4 h-4" /> Run Reconciliation
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" /> Reconciliation History
          </TabsTrigger>
        </TabsList>

        {/* ── Run Reconciliation Tab ── */}
        <TabsContent value="reconcile" className="space-y-6">
          {/* Upload & Column Mapping */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="w-4 h-4" /> Upload CBN Statement (Excel)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <label className="flex-1 cursor-pointer">
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">{file ? file.name : 'Click to select Excel file (.xlsx / .xls)'}</p>
                    <p className="text-xs text-muted-foreground mt-1">{parsed ? `${cbnData.length} rows loaded` : 'Supports .xlsx and .xls formats'}</p>
                  </div>
                  <Input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                </label>
                {file && (
                  <Button variant="outline" onClick={handleClear} className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear File
                  </Button>
                )}
              </div>

              {parsed && headers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                  {[
                    { label: 'RRR Column *', value: remitaCol, setter: setRemitaCol, remap: true },
                    { label: 'Amount Column *', value: amountCol, setter: setAmountCol, remap: true },
                    { label: 'Names Column', value: nameCol, setter: setNameCol, remap: false },
                    { label: 'Receipt Column', value: receiptCol, setter: setReceiptCol, remap: true },
                  ].map(({ label, value, setter, remap }) => (
                    <div key={label}>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
                      <select value={value} onChange={e => { setter(e.target.value); if (remap) setTimeout(remapData, 0); }}
                        className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">{label.includes('*') ? '-- Select --' : '-- None --'}</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {parsed && (
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleReconcile} disabled={loading || !remitaCol}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    {loading ? 'Reconciling...' : 'Run Reconciliation'}
                  </Button>
                  {reconciled && (
                    <Button variant="outline" onClick={exportResults}>
                      <Download className="w-4 h-4 mr-2" /> Export Results
                    </Button>
                  )}
                  {canSave && (
                    <Button
                      variant="default"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => setSaveOpen(true)}
                    >
                      <Save className="w-4 h-4 mr-2" /> Save to History
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleClear} className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear & Reset
                  </Button>
                </div>
              )}

              {reconciled && canSave && (
                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isFullyMatched ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  <CheckCircle2 className={`w-5 h-5 shrink-0 ${isFullyMatched ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <div className="flex-1 min-w-0">
                    {isFullyMatched
                      ? <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">All {stats.matched} records fully matched!</p>
                      : <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{stats.matched} matched, {stats.mismatch} mismatches, {stats.unmatched} unmatched</p>
                    }
                    <p className="text-xs text-muted-foreground">Click <strong>Save to History</strong> to record this reconciliation.</p>
                  </div>
                  {isFullyMatched && (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      onClick={() => setSaveOpen(true)}
                    >
                      <Save className="w-4 h-4 mr-2" /> Save Fully Matched to History
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {reconciled && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Total CBN Records</p>
                  <p className="text-2xl font-bold text-foreground">{results.length}</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Fully Matched</p>
                  <p className="text-2xl font-bold text-emerald-600">{stats.matched}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Amount Mismatch</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.mismatch}</p>
                </CardContent>
              </Card>
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Unmatched</p>
                  <p className="text-2xl font-bold text-destructive">{stats.unmatched}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Matched Value</p>
                  <p className="text-lg font-bold text-foreground">{fmt(stats.matchedTotal)}</p>
                  <p className="text-[10px] text-muted-foreground">of {fmt(stats.cbnTotal)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Results Table */}
          {reconciled && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <CardTitle className="text-base">Reconciliation Results</CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search by Remita or name..." value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="all">
                  <TabsList>
                    <TabsTrigger value="all">All ({results.length})</TabsTrigger>
                    <TabsTrigger value="matched">Matched ({stats.matched})</TabsTrigger>
                    <TabsTrigger value="mismatch">Mismatch ({stats.mismatch})</TabsTrigger>
                    <TabsTrigger value="unmatched">Unmatched ({stats.unmatched})</TabsTrigger>
                  </TabsList>

                  {['all', 'matched', 'mismatch', 'unmatched'].map(tab => (
                    <TabsContent key={tab} value={tab}>
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>Remita (RRR)</TableHead>
                              <TableHead className="text-right">CBN Amount</TableHead>
                              <TableHead className="text-right">System Amount</TableHead>
                              <TableHead className="text-right">Variance</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Batch / Organisation</TableHead>
                              <TableHead>Beneficiary</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredResults
                              .filter(r =>
                                tab === 'all' ||
                                (tab === 'matched' && r.matchType === 'exact') ||
                                (tab === 'mismatch' && r.matchType === 'amount_mismatch') ||
                                (tab === 'unmatched' && r.matchType === 'unmatched'))
                              .map((r, i) => (
                                <TableRow key={i} className={
                                  r.matchType === 'unmatched' ? 'bg-destructive/5' :
                                  r.matchType === 'amount_mismatch' ? 'bg-amber-500/5' : ''
                                }>
                                  <TableCell className="text-xs text-muted-foreground">{r.cbnRow.rowIndex}</TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {r.cbnRow.remitaNumber ? (
                                      r.matchType !== 'unmatched' ? (
                                        <button
                                          className="text-primary hover:underline font-mono cursor-pointer"
                                          onClick={() => {
                                            if (r.source === 'individual' && r.beneficiaryId) {
                                              navigate(`/beneficiary/${r.beneficiaryId}`);
                                            } else if (r.source === 'batch' && r.batchId) {
                                              navigate(`/batch-repayment?batch=${r.batchId}`);
                                            }
                                          }}
                                        >
                                          {r.cbnRow.remitaNumber}
                                        </button>
                                      ) : (
                                        r.cbnRow.remitaNumber
                                      )
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">{fmt(r.cbnRow.amount)}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{r.dbAmount != null ? fmt(r.dbAmount) : '-'}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {r.dbAmount != null ? (
                                      <span className={Math.abs(r.cbnRow.amount - r.dbAmount) > 0.01 ? 'text-destructive font-semibold' : 'text-emerald-600'}>
                                        {fmt(r.cbnRow.amount - r.dbAmount)}
                                      </span>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell>
                                    {r.source === 'individual' && <Badge variant="outline" className="text-xs">Loan Repayment</Badge>}
                                    {r.source === 'batch' && <Badge variant="secondary" className="text-xs">Batch</Badge>}
                                    {!r.source && <span className="text-xs text-muted-foreground">-</span>}
                                  </TableCell>
                                  <TableCell className="text-sm">{r.batchName || r.organisation || '-'}</TableCell>
                                  <TableCell className="text-sm">{r.beneficiaryName || '-'}</TableCell>
                                  <TableCell>
                                    {r.matchType === 'exact' && <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="w-3 h-3" /> Matched</Badge>}
                                    {r.matchType === 'amount_mismatch' && <Badge className="bg-amber-500 text-white gap-1"><XCircle className="w-3 h-3" /> Mismatch</Badge>}
                                    {r.matchType === 'unmatched' && <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Unmatched</Badge>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            {filteredResults.filter(r =>
                              tab === 'all' ||
                              (tab === 'matched' && r.matchType === 'exact') ||
                              (tab === 'mismatch' && r.matchType === 'amount_mismatch') ||
                              (tab === 'unmatched' && r.matchType === 'unmatched')).length === 0 && (
                              <TableRow>
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No records found</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="space-y-6">
          {/* Filters + Delete Selected */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="w-4 h-4" /> Reconciliation History
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {selectedSessions.size > 0 && (
                    <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Selected ({selectedSessions.size})
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={fetchHistory} disabled={historyLoading}>
                    {historyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
                  </Button>
                  {filteredHistory.length > 0 && (
                    <Button variant="outline" size="sm" onClick={exportHistory}>
                      <Download className="w-4 h-4 mr-2" /> Export History
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Filter by Organization</label>
                  <Select value={filterOrg || '__all__'} onValueChange={v => setFilterOrg(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Organizations" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Organizations</SelectItem>
                      {orgNames.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Filter by Year</label>
                  <Select value={filterYear || '__all__'} onValueChange={v => setFilterYear(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Years" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Years</SelectItem>
                      {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Filter by Month</label>
                  <Select value={filterMonth || '__all__'} onValueChange={v => setFilterMonth(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Months" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Months</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {historyLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(groupedHistory).length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <History className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground font-medium">No reconciliation records found</p>
                <p className="text-sm text-muted-foreground mt-1">Run a reconciliation and save it to see records here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedHistory).map(([org, sessions]) => {
                const totalMatched = sessions.reduce((s, r) => s + r.matched_count, 0);
                const totalRecords = sessions.reduce((s, r) => s + r.total_records, 0);
                const totalAmount = sessions.reduce((s, r) => s + r.matched_amount, 0);
                const allOrgSelected = sessions.every(s => selectedSessions.has(s.id));
                return (
                  <Card key={org}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Building2 className="w-5 h-5 text-primary" />
                          {org}
                        </CardTitle>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {totalMatched}/{totalRecords} records matched</span>
                          <span className="font-semibold text-foreground">{fmt(totalAmount)}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={allOrgSelected}
                                  onCheckedChange={checked => {
                                    setSelectedSessions(prev => {
                                      const next = new Set(prev);
                                      sessions.forEach(s => checked ? next.add(s.id) : next.delete(s.id));
                                      return next;
                                    });
                                  }}
                                />
                              </TableHead>
                              <TableHead className="w-32">Period</TableHead>
                              <TableHead className="text-right">Records</TableHead>
                              <TableHead className="text-right">Matched</TableHead>
                              <TableHead className="text-right">Mismatch</TableHead>
                              <TableHead className="text-right">Unmatched</TableHead>
                              <TableHead className="text-right">Matched Amount</TableHead>
                              <TableHead className="text-right">Total CBN Amount</TableHead>
                              <TableHead>File</TableHead>
                              <TableHead>Recorded</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-24 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessions
                              .sort((a, b) => b.payment_year - a.payment_year || b.payment_month - a.payment_month)
                              .map(s => {
                                const isFullMatch = s.unmatched_count === 0 && s.mismatch_count === 0;
                                const isExpanded = expandedSession === s.id;
                                const matches = sessionMatches[s.id] || [];
                                const isLoadingMatches = matchesLoading === s.id;
                                const isChecked = selectedSessions.has(s.id);
                                return (
                                  <React.Fragment key={s.id}>
                                    <TableRow className={isChecked ? 'bg-primary/5' : ''}>
                                      <TableCell>
                                        <Checkbox
                                          checked={isChecked}
                                          onCheckedChange={checked => {
                                            setSelectedSessions(prev => {
                                              const next = new Set(prev);
                                              checked ? next.add(s.id) : next.delete(s.id);
                                              return next;
                                            });
                                          }}
                                        />
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        <span className="flex items-center gap-1.5">
                                          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                                          {MONTHS[s.payment_month - 1].slice(0, 3)} {s.payment_year}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-right">{s.total_records}</TableCell>
                                      <TableCell className="text-right text-emerald-600 font-semibold">{s.matched_count}</TableCell>
                                      <TableCell className="text-right text-amber-600">{s.mismatch_count}</TableCell>
                                      <TableCell className="text-right text-destructive">{s.unmatched_count}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{fmt(s.matched_amount)}</TableCell>
                                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmt(s.total_cbn_amount)}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={s.file_name}>{s.file_name || '-'}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })}</TableCell>
                                      <TableCell>
                                        {isFullMatch
                                          ? <Badge className="bg-emerald-600 text-white gap-1 text-xs"><CheckCircle2 className="w-3 h-3" /> Full Match</Badge>
                                          : <Badge className="bg-amber-500 text-white gap-1 text-xs"><XCircle className="w-3 h-3" /> Partial</Badge>
                                        }
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center justify-center gap-1">
                                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit session" onClick={() => openEdit(s)}>
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" title={isExpanded ? 'Collapse' : 'View matched records'} onClick={() => fetchSessionMatches(s.id)} disabled={isLoadingMatches}>
                                            {isLoadingMatches ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {isExpanded && (
                                      <TableRow key={`${s.id}-detail`}>
                                        <TableCell colSpan={12} className="p-0 bg-muted/20 border-t-0">
                                          <div className="px-4 py-3">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                              Matched Records — {matches.length} entr{matches.length === 1 ? 'y' : 'ies'}
                                            </p>
                                            {isLoadingMatches ? (
                                              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Loading matched records...
                                              </div>
                                            ) : matches.length === 0 ? (
                                              <p className="text-xs text-muted-foreground italic py-2">No matched record details stored for this session.</p>
                                            ) : (
                                              <div className="overflow-x-auto rounded border border-border">
                                                <Table>
                                                  <TableHeader>
                                                    <TableRow className="bg-muted/40">
                                                      <TableHead className="text-xs h-8 py-1 w-12">Serial #</TableHead>
                                                      <TableHead className="text-xs h-8 py-1">RRR Number</TableHead>
                                                      <TableHead className="text-xs h-8 py-1">Beneficiary / Batch</TableHead>
                                                      <TableHead className="text-xs h-8 py-1">Source</TableHead>
                                                      <TableHead className="text-right text-xs h-8 py-1">System Amount</TableHead>
                                                      <TableHead className="text-right text-xs h-8 py-1">CBN Amount</TableHead>
                                                      <TableHead className="text-right text-xs h-8 py-1">Variance</TableHead>
                                                      <TableHead className="text-center text-xs h-8 py-1">Status</TableHead>
                                                    </TableRow>
                                                  </TableHeader>
                                                  <TableBody>
                                                    {matches
                                                      .slice()
                                                      .sort((a, b) => a.serial_number - b.serial_number)
                                                      .map(m => {
                                                        const variance = m.cbn_amount - m.system_amount;
                                                        return (
                                                          <TableRow key={m.id} className="hover:bg-emerald-500/5">
                                                            <TableCell className="text-xs py-2 font-mono font-semibold text-muted-foreground">
                                                              {m.serial_number > 0 ? m.serial_number : '—'}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs py-2">{m.rrr_number || '-'}</TableCell>
                                                            <TableCell className="text-xs py-2 font-medium">{m.beneficiary_name || m.batch_name || '-'}</TableCell>
                                                            <TableCell className="text-xs py-2">
                                                              {m.source === 'individual' ? <Badge variant="outline" className="text-xs">Loan Repayment</Badge>
                                                              : m.source === 'batch' ? <Badge variant="secondary" className="text-xs">Batch</Badge>
                                                              : <span className="text-muted-foreground">-</span>}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-xs py-2">{fmt(m.system_amount)}</TableCell>
                                                            <TableCell className="text-right font-mono text-xs py-2">{fmt(m.cbn_amount)}</TableCell>
                                                            <TableCell className={`text-right font-mono text-xs py-2 ${variance === 0 ? 'text-emerald-600' : variance > 0 ? 'text-amber-600' : 'text-destructive'}`}>
                                                              {variance === 0 ? '—' : (variance > 0 ? '+' : '') + fmt(variance)}
                                                            </TableCell>
                                                            <TableCell className="text-center py-2">
                                                              <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                                                                <CheckCircle2 className="w-3 h-3" /> Matched
                                                              </Badge>
                                                            </TableCell>
                                                          </TableRow>
                                                        );
                                                    })}
                                                  </TableBody>
                                                </Table>
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Save to History Dialog ── */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5 text-emerald-600" /> Save Reconciliation Record
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={`p-3 border rounded-lg text-sm ${isFullyMatched ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'}`}>
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              <strong>{stats.matched}</strong> matched — {fmt(stats.matchedTotal)}
              {!isFullyMatched && <span className="ml-1">({stats.mismatch} mismatches, {stats.unmatched} unmatched will also be recorded)</span>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="save-org">Organization / Batch Name *</Label>
              <Input id="save-org" placeholder="e.g. FMBN Lagos Batch 3" value={saveOrg} onChange={e => setSaveOrg(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payment Month *</Label>
                <Select value={saveMonth} onValueChange={setSaveMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payment Year *</Label>
                <Select value={saveYear} onValueChange={setSaveYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="save-notes">Notes (optional)</Label>
              <Textarea id="save-notes" placeholder="Any remarks about this reconciliation..." value={saveNotes} onChange={e => setSaveNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? 'Saving...' : 'Save Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Session Dialog ── */}
      <Dialog open={!!editSession} onOpenChange={open => { if (!open) setEditSession(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" /> Edit Reconciliation Session
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Organization / Batch Name *</Label>
              <Input placeholder="e.g. FMBN Lagos Batch 3" value={editOrg} onChange={e => setEditOrg(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payment Month *</Label>
                <Select value={editMonth} onValueChange={setEditMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payment Year *</Label>
                <Select value={editYear} onValueChange={setEditYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Any remarks..." value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSession(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editOrg.trim()}>
              {editSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSessions.size} Session{selectedSessions.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected reconciliation session{selectedSessions.size > 1 ? 's' : ''} and all their matched records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteSelected}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
        .select('rrr_number, amount, receipt_url, beneficiary_id, beneficiaries(name)');

      const { data: batchRepayments } = await supabase
        .from('batch_repayments')
        .select('rrr_number, actual_amount, receipt_url, batch_id, loan_batches(name)');

      const txMap = new Map<string, { amount: number; receipt_url: string; name: string }>();
      (transactions || []).forEach((t: any) => {
        const rrr = (t.rrr_number || '').trim().toLowerCase();
        if (rrr) txMap.set(rrr, { amount: Number(t.amount), receipt_url: t.receipt_url || '', name: t.beneficiaries?.name || '' });
      });

      const batchMap = new Map<string, { amount: number; receipt_url: string; batchName: string }>();
      (batchRepayments || []).forEach((b: any) => {
        const rrr = (b.rrr_number || '').trim().toLowerCase();
        if (rrr) batchMap.set(rrr, { amount: Number(b.actual_amount), receipt_url: b.receipt_url || '', batchName: b.loan_batches?.name || '' });
      });

      const matchResults: MatchResult[] = cbnData.map((row) => {
        const rrr = row.remitaNumber.toLowerCase();
        if (txMap.has(rrr)) {
          const tx = txMap.get(rrr)!;
          return { cbnRow: row, matchType: Math.abs(tx.amount - row.amount) < 0.01 ? 'exact' : 'amount_mismatch', source: 'individual', dbAmount: tx.amount, dbReceiptUrl: tx.receipt_url, beneficiaryName: tx.name } as MatchResult;
        }
        if (batchMap.has(rrr)) {
          const b = batchMap.get(rrr)!;
          return { cbnRow: row, matchType: Math.abs(b.amount - row.amount) < 0.01 ? 'exact' : 'amount_mismatch', source: 'batch', dbAmount: b.amount, dbReceiptUrl: b.receipt_url, batchName: b.batchName } as MatchResult;
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
      const { error } = await supabase.from('reconciliation_sessions').insert({
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
      });

      if (error) throw error;

      toast({ title: 'Saved!', description: `Reconciliation for ${saveOrg} – ${MONTHS[parseInt(saveMonth) - 1]} ${saveYear} has been recorded.` });
      setSaveOpen(false);
      setSaveOrg('');
      setSaveNotes('');
      fetchHistory();
      // Switch to history tab so user can see the saved record
      setActiveTab('history');
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
      'Recorded At': new Date(s.created_at).toLocaleDateString('en-NG'),
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
                  <Button
                    variant="default"
                    className={isFullyMatched ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                    onClick={() => setSaveOpen(true)}
                  >
                    <Save className="w-4 h-4 mr-2" /> Save to History
                  </Button>
                  <Button variant="outline" onClick={handleClear} className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear & Reset
                  </Button>
                </div>
              )}

              {reconciled && isFullyMatched && (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">All {stats.matched} records fully matched!</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">Click <strong>Save to History</strong> to record this reconciliation.</p>
                  </div>
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
                              <TableHead>Beneficiary / Batch</TableHead>
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
                                  <TableCell className="font-mono text-sm">{r.cbnRow.remitaNumber || '-'}</TableCell>
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
                                  <TableCell className="text-sm">{r.beneficiaryName || r.batchName || '-'}</TableCell>
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
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No records found</TableCell>
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
          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="w-4 h-4" /> Reconciliation History
                </CardTitle>
                <div className="flex flex-wrap gap-2">
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
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Organizations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Organizations</SelectItem>
                      {orgNames.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Filter by Year</label>
                  <Select value={filterYear || '__all__'} onValueChange={v => setFilterYear(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Years" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Years</SelectItem>
                      {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Filter by Month</label>
                  <Select value={filterMonth || '__all__'} onValueChange={v => setFilterMonth(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Months" />
                    </SelectTrigger>
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
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessions
                              .sort((a, b) => b.payment_year - a.payment_year || b.payment_month - a.payment_month)
                              .map(s => {
                                const isFullMatch = s.unmatched_count === 0 && s.mismatch_count === 0;
                                return (
                                  <TableRow key={s.id}>
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
                                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={s.file_name}>{s.file_name || '-'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                                    <TableCell>
                                      {isFullMatch
                                        ? <Badge className="bg-emerald-600 text-white gap-1 text-xs"><CheckCircle2 className="w-3 h-3" /> Full Match</Badge>
                                        : <Badge className="bg-amber-500 text-white gap-1 text-xs"><XCircle className="w-3 h-3" /> Partial</Badge>
                                      }
                                    </TableCell>
                                  </TableRow>
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
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              <strong>{stats.matched}</strong> records fully matched — {fmt(stats.matchedTotal)}
            </div>
            <div className="space-y-1">
              <Label htmlFor="save-org">Organization / Batch Name *</Label>
              <Input id="save-org" placeholder="e.g. FMBN Lagos Batch 3" value={saveOrg} onChange={e => setSaveOrg(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payment Month *</Label>
                <Select value={saveMonth} onValueChange={setSaveMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payment Year *</Label>
                <Select value={saveYear} onValueChange={setSaveYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
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
} from 'lucide-react';
import * as XLSX from 'xlsx';

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

// Try common column name patterns for Remita numbers
const findColumn = (headers: string[], patterns: RegExp[]): string | null => {
  for (const h of headers) {
    for (const p of patterns) {
      if (p.test(h.toLowerCase().trim())) return h;
    }
  }
  return null;
};

const REMITA_PATTERNS = [/remita/i, /rrr/i, /retrieval/i, /reference/i, /ref/i];
const AMOUNT_PATTERNS = [/amount/i, /sum/i, /value/i, /paid/i, /credit/i];
const RECEIPT_PATTERNS = [/receipt/i, /url/i, /link/i, /proof/i];

export default function LoanReconciliation() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [cbnData, setCbnData] = useState<CBNRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [remitaCol, setRemitaCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [receiptCol, setReceiptCol] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Parse Excel file
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

        // Auto-detect columns
        const autoRemita = findColumn(cols, REMITA_PATTERNS) || '';
        const autoAmount = findColumn(cols, AMOUNT_PATTERNS) || '';
        const autoReceipt = findColumn(cols, RECEIPT_PATTERNS) || '';
        setRemitaCol(autoRemita);
        setAmountCol(autoAmount);
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

  // Re-map columns when user changes selection
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

  // Run reconciliation
  const handleReconcile = async () => {
    if (cbnData.length === 0) return;
    setLoading(true);

    try {
      // Fetch all individual transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('rrr_number, amount, receipt_url, beneficiary_id, beneficiaries(name)');

      // Fetch all batch repayments
      const { data: batchRepayments } = await supabase
        .from('batch_repayments')
        .select('rrr_number, actual_amount, receipt_url, batch_id, loan_batches(name)');

      // Build lookup maps by RRR
      const txMap = new Map<string, { amount: number; receipt_url: string; name: string }>();
      (transactions || []).forEach((t: any) => {
        const rrr = (t.rrr_number || '').trim().toLowerCase();
        if (rrr) txMap.set(rrr, {
          amount: Number(t.amount),
          receipt_url: t.receipt_url || '',
          name: t.beneficiaries?.name || '',
        });
      });

      const batchMap = new Map<string, { amount: number; receipt_url: string; batchName: string }>();
      (batchRepayments || []).forEach((b: any) => {
        const rrr = (b.rrr_number || '').trim().toLowerCase();
        if (rrr) batchMap.set(rrr, {
          amount: Number(b.actual_amount),
          receipt_url: b.receipt_url || '',
          batchName: b.loan_batches?.name || '',
        });
      });

      // Match each CBN row
      const matchResults: MatchResult[] = cbnData.map((row) => {
        const rrr = row.remitaNumber.toLowerCase();

        // Check individual transactions first
        if (txMap.has(rrr)) {
          const tx = txMap.get(rrr)!;
          const amountMatch = Math.abs(tx.amount - row.amount) < 0.01;
          return {
            cbnRow: row,
            matchType: amountMatch ? 'exact' : 'amount_mismatch',
            source: 'individual',
            dbAmount: tx.amount,
            dbReceiptUrl: tx.receipt_url,
            beneficiaryName: tx.name,
          } as MatchResult;
        }

        // Check batch repayments
        if (batchMap.has(rrr)) {
          const b = batchMap.get(rrr)!;
          const amountMatch = Math.abs(b.amount - row.amount) < 0.01;
          return {
            cbnRow: row,
            matchType: amountMatch ? 'exact' : 'amount_mismatch',
            source: 'batch',
            dbAmount: b.amount,
            dbReceiptUrl: b.receipt_url,
            batchName: b.batchName,
          } as MatchResult;
        }

        return { cbnRow: row, matchType: 'unmatched' } as MatchResult;
      });

      setResults(matchResults);
      setReconciled(true);

      const matched = matchResults.filter(r => r.matchType === 'exact').length;
      const mismatch = matchResults.filter(r => r.matchType === 'amount_mismatch').length;
      const unmatched = matchResults.filter(r => r.matchType === 'unmatched').length;

      toast({
        title: 'Reconciliation Complete',
        description: `${matched} matched, ${mismatch} amount mismatches, ${unmatched} unmatched out of ${matchResults.length} records.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Reconciliation failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const matched = results.filter(r => r.matchType === 'exact');
    const mismatch = results.filter(r => r.matchType === 'amount_mismatch');
    const unmatched = results.filter(r => r.matchType === 'unmatched');
    const cbnTotal = results.reduce((s, r) => s + r.cbnRow.amount, 0);
    const matchedTotal = matched.reduce((s, r) => s + r.cbnRow.amount, 0);
    return { matched: matched.length, mismatch: mismatch.length, unmatched: unmatched.length, cbnTotal, matchedTotal };
  }, [results]);

  // Filtered results
  const filteredResults = useMemo(() => {
    if (!searchTerm) return results;
    const q = searchTerm.toLowerCase();
    return results.filter(r =>
      r.cbnRow.remitaNumber.toLowerCase().includes(q) ||
      r.beneficiaryName?.toLowerCase().includes(q) ||
      r.batchName?.toLowerCase().includes(q)
    );
  }, [results, searchTerm]);

  // Export results
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
      'Beneficiary/Batch': r.beneficiaryName || r.batchName || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation');
    XLSX.writeFile(wb, `Reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const fmt = (n: number) => '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2 });

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
          </div>

          {parsed && headers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Remita/RRR Column</label>
                <select value={remitaCol} onChange={e => { setRemitaCol(e.target.value); setTimeout(remapData, 0); }}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- Select --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Amount Column</label>
                <select value={amountCol} onChange={e => { setAmountCol(e.target.value); setTimeout(remapData, 0); }}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- Select --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Receipt Column (optional)</label>
                <select value={receiptCol} onChange={e => { setReceiptCol(e.target.value); setTimeout(remapData, 0); }}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- None --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          )}

          {parsed && (
            <div className="flex gap-3">
              <Button onClick={handleReconcile} disabled={loading || !remitaCol}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                {loading ? 'Reconciling...' : 'Run Reconciliation'}
              </Button>
              {reconciled && (
                <Button variant="outline" onClick={exportResults}>
                  <Download className="w-4 h-4 mr-2" /> Export Results
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
                          <TableHead>Beneficiary / Batch</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredResults
                          .filter(r => tab === 'all' ||
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
                              <TableCell className="text-right font-mono text-sm">
                                {r.dbAmount != null ? fmt(r.dbAmount) : '-'}
                              </TableCell>
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
                                {r.matchType === 'exact' && (
                                  <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="w-3 h-3" /> Matched</Badge>
                                )}
                                {r.matchType === 'amount_mismatch' && (
                                  <Badge className="bg-amber-500 text-white gap-1"><XCircle className="w-3 h-3" /> Mismatch</Badge>
                                )}
                                {r.matchType === 'unmatched' && (
                                  <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Unmatched</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        {filteredResults.filter(r => tab === 'all' ||
                          (tab === 'matched' && r.matchType === 'exact') ||
                          (tab === 'mismatch' && r.matchType === 'amount_mismatch') ||
                          (tab === 'unmatched' && r.matchType === 'unmatched')).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No records found
                            </TableCell>
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
    </div>
  );
}

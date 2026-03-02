import { useState, useCallback, useMemo } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download, Trash2, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/loanCalculations';
import * as XLSX from 'xlsx';
import { parseSpreadsheetDate } from '@/lib/spreadsheetDate';

interface MultiBatchUploadProps {
  onComplete: () => void;
}

interface ParsedRow {
  title: string;
  surname: string;
  firstName: string;
  otherName: string;
  organisation: string;
  nhfNumber: string;
  loanRefNo: string;
  remitaNumber: string;
  dateOnRemitaReceipt: string;
  amount: number;
  monthOfPayment: number;
  // matching
  beneficiaryId: string | null;
  beneficiaryName: string | null;
  batchCode: string | null;
  batchId: string | null;
  monthlyEmi: number;
  errors: string[];
  valid: boolean;
}

const EXPECTED_HEADERS = [
  'Title',
  'Surname',
  'First Name',
  'Other Name',
  'Organizations/Batch',
  'NHF Number',
  'Loan Reference Number',
  'Remita Number',
  'Date on Remita Receipt',
  'Amount',
  'Month of Payment',
];

function generateTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    EXPECTED_HEADERS,
    ['Mr', 'Adeyemi', 'John', 'Olu', 'BATCH-2025-001', 'NHF-00012345', 'HRL-2025-00001', 'RRR-123456789', '2025-06-15', 19332.80, 6],
    ['Mrs', 'Bello', 'Fatima', '', 'BATCH-2025-002', 'NHF-00067890', 'HRL-2025-00045', 'RRR-987654321', '2025-06-15', 15000.00, 6],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MultiBatchRepayments');
  ws['!cols'] = EXPECTED_HEADERS.map(() => ({ wch: 22 }));
  XLSX.writeFile(wb, 'Multi_Batch_Repayment_Upload_Template.xlsx');
}

export default function MultiBatchUpload({ onComplete }: MultiBatchUploadProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matching, setMatching] = useState(false);

  const stats = useMemo(() => {
    const valid = rows.filter(r => r.valid).length;
    const batchSet = new Set(rows.filter(r => r.batchId).map(r => r.batchId));
    return { total: rows.length, valid, invalid: rows.length - valid, batchCount: batchSet.size };
  }, [rows]);

  const totalAmount = useMemo(() => rows.filter(r => r.valid).reduce((s, r) => s + r.amount, 0), [rows]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: 'Invalid File', description: 'Please upload an Excel file (.xlsx or .xls)', variant: 'destructive' });
      return;
    }

    setFileName(file.name);
    setSubmitted(false);
    setMatching(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (jsonData.length === 0) {
          toast({ title: 'Empty File', description: 'The Excel file contains no data rows.', variant: 'destructive' });
          setMatching(false);
          return;
        }

        // Fetch ALL batches and ALL beneficiaries with batch assignments
        const [{ data: batches }, { data: beneficiaries }] = await Promise.all([
          supabase.from('loan_batches').select('id, batch_code, name, state'),
          supabase.from('beneficiaries')
            .select('id, name, surname, first_name, other_name, nhf_number, loan_reference_number, employee_id, monthly_emi, batch_id, status')
            .not('batch_id', 'is', null),
        ]);

        const batchList = batches || [];
        const beneficiaryList = beneficiaries || [];

        // Build batch lookup by code and name
        const batchByCode = new Map<string, typeof batchList[0]>();
        const batchByName = new Map<string, typeof batchList[0]>();
        batchList.forEach(b => {
          batchByCode.set(b.batch_code.toLowerCase(), b);
          batchByName.set(b.name.toLowerCase(), b);
        });

        const parsed: ParsedRow[] = jsonData.map((row: any) => {
          const errors: string[] = [];

          const title = String(row['Title'] || '').trim();
          const surname = String(row['Surname'] || '').trim();
          const firstName = String(row['First Name'] || '').trim();
          const otherName = String(row['Other Name'] || row['Other Names'] || '').trim();
          const organisation = String(row['Organizations/Batch'] || row['Organisation/Batch'] || row['Organizations'] || row['Organisations'] || '').trim();
          const nhfNumber = String(row['NHF Number'] || row['NHF number'] || '').trim();
          const loanRefNo = String(row['Loan Reference Number'] || row['Loan Ref No'] || '').trim();
          const remitaNumber = String(row['Remita Number'] || '').trim();
          const dateStr = parseSpreadsheetDate(row['Date on Remita Receipt']);
          const amountRaw = Number(row['Amount']);
          const monthRaw = Number(row['Month of Payment'] || row['Month of payment']);

          const fullName = [surname, firstName, otherName].filter(Boolean).join(' ');

          if (!surname && !firstName) errors.push('Name is required');
          if (!organisation) errors.push('Organizations/Batch is required');
          if (!remitaNumber) errors.push('Remita Number is required');
          if (!dateStr) errors.push('Date on Remita Receipt is invalid');
          if (!amountRaw || amountRaw <= 0) errors.push('Amount must be > 0');
          if (!monthRaw || monthRaw < 1) errors.push('Month of Payment must be >= 1');

          // Match batch by code or name
          let matchedBatch: typeof batchList[0] | null = null;
          if (organisation) {
            matchedBatch = batchByCode.get(organisation.toLowerCase()) ||
              batchByName.get(organisation.toLowerCase()) || null;
          }

          if (!matchedBatch) errors.push(`Batch "${organisation}" not found`);

          // Match beneficiary within the matched batch
          let matchedBen: typeof beneficiaryList[0] | null = null;
          if (matchedBatch) {
            const batchMembers = beneficiaryList.filter(b => b.batch_id === matchedBatch!.id);

            // Try loan ref
            if (loanRefNo) {
              matchedBen = batchMembers.find(m =>
                (m.loan_reference_number && m.loan_reference_number.toLowerCase() === loanRefNo.toLowerCase()) ||
                (m.employee_id && m.employee_id.toLowerCase() === loanRefNo.toLowerCase())
              ) || null;
            }
            // Try NHF number
            if (!matchedBen && nhfNumber) {
              matchedBen = batchMembers.find(m =>
                m.nhf_number && m.nhf_number.toLowerCase() === nhfNumber.toLowerCase()
              ) || null;
            }
            // Try name match
            if (!matchedBen && fullName) {
              matchedBen = batchMembers.find(m =>
                m.name && m.name.toLowerCase() === fullName.toLowerCase()
              ) || null;
              // Also try surname + first name
              if (!matchedBen) {
                matchedBen = batchMembers.find(m => {
                  const mSurname = (m.surname || '').toLowerCase();
                  const mFirst = (m.first_name || '').toLowerCase();
                  return mSurname && surname.toLowerCase() === mSurname && firstName.toLowerCase() === mFirst;
                }) || null;
              }
            }

            if (!matchedBen) errors.push('No matching beneficiary in batch');
          }

          return {
            title,
            surname,
            firstName,
            otherName,
            organisation,
            nhfNumber,
            loanRefNo,
            remitaNumber,
            dateOnRemitaReceipt: dateStr || '',
            amount: amountRaw || 0,
            monthOfPayment: monthRaw || 0,
            beneficiaryId: matchedBen?.id || null,
            beneficiaryName: matchedBen?.name || null,
            batchCode: matchedBatch?.batch_code || null,
            batchId: matchedBatch?.id || null,
            monthlyEmi: Number(matchedBen?.monthly_emi) || 0,
            errors,
            valid: errors.length === 0,
          };
        });

        setRows(parsed);
        const batchCount = new Set(parsed.filter(r => r.batchId).map(r => r.batchId)).size;
        toast({
          title: 'File Parsed',
          description: `${parsed.length} rows across ${batchCount} batch(es). ${parsed.filter(r => r.valid).length} matched & valid.`,
        });
      } catch {
        toast({ title: 'Parse Error', description: 'Could not read the Excel file.', variant: 'destructive' });
      } finally {
        setMatching(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, []);

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ title: 'No Valid Rows', description: 'Fix errors before submitting.', variant: 'destructive' });
      return;
    }

    setUploading(true);

    // Group by batch + RRR to create batch repayment records
    const grouped: Record<string, ParsedRow[]> = {};
    for (const row of validRows) {
      const key = `${row.batchId}::${row.remitaNumber}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const [compositeKey, groupRows] of Object.entries(grouped)) {
      const [batchId] = compositeKey.split('::');
      const rrr = groupRows[0].remitaNumber;
      const totalExpected = groupRows.reduce((s, r) => s + r.monthlyEmi, 0);
      const totalActual = groupRows.reduce((s, r) => s + r.amount, 0);
      const monthFor = groupRows[0].monthOfPayment;
      const paymentDate = groupRows[0].dateOnRemitaReceipt;

      // Check duplicate RRR
      const { data: existing } = await supabase
        .from('batch_repayments')
        .select('id')
        .eq('rrr_number', rrr)
        .maybeSingle();

      if (existing) {
        toast({ title: 'Duplicate RRR', description: `RRR "${rrr}" already used. Skipping group.`, variant: 'destructive' });
        errorCount += groupRows.length;
        continue;
      }

      // Detect overpayment and distribute variance pro-rata
      const variance = totalActual - totalExpected;
      const hasOverpayment = variance > 0.01 && totalExpected > 0;

      // Insert batch repayment record
      const { error: batchError } = await supabase.from('batch_repayments').insert({
        batch_id: batchId,
        month_for: monthFor,
        expected_amount: totalExpected,
        actual_amount: totalActual,
        rrr_number: rrr,
        payment_date: paymentDate,
        receipt_url: '',
        notes: hasOverpayment
          ? `Multi-batch Excel upload: ${fileName} | Overpayment of ₦${variance.toFixed(2)} distributed pro-rata`
          : `Multi-batch Excel upload: ${fileName}`,
        recorded_by: user?.id || null,
      } as any);

      if (batchError) {
        errorCount += groupRows.length;
        continue;
      }

      // Calculate pro-rata shares for overpayment
      const memberShares = groupRows.map(row => {
        if (hasOverpayment && totalExpected > 0) {
          const share = row.monthlyEmi / totalExpected;
          const bonus = Math.round(variance * share * 100) / 100;
          return { row, allocatedAmount: row.monthlyEmi + bonus };
        }
        return { row, allocatedAmount: row.amount };
      });

      // Insert individual transactions with distributed amounts
      for (const { row, allocatedAmount } of memberShares) {
        if (!row.beneficiaryId) continue;

        const { error: txError } = await supabase.from('transactions').insert({
          beneficiary_id: row.beneficiaryId,
          amount: allocatedAmount,
          rrr_number: rrr,
          date_paid: row.dateOnRemitaReceipt,
          month_for: row.monthOfPayment,
          recorded_by: user?.id || null,
          notes: hasOverpayment
            ? `Multi-batch upload (${row.batchCode}): ${fileName} (includes pro-rata overpayment share)`
            : `Multi-batch upload (${row.batchCode}): ${fileName}`,
        });

        if (txError) {
          errorCount++;
          continue;
        }
        successCount++;
      }

      if (hasOverpayment) {
        toast({
          title: 'Overpayment Distributed',
          description: `₦${variance.toFixed(2)} overpayment for RRR ${rrr} distributed pro-rata to ${groupRows.length} members.`,
        });
      }
    }

    setUploading(false);

    if (errorCount > 0 && successCount > 0) {
      toast({ title: 'Partial Success', description: `${successCount} recorded, ${errorCount} failed.`, variant: 'destructive' });
    } else if (errorCount > 0) {
      toast({ title: 'Upload Failed', description: `${errorCount} records failed.`, variant: 'destructive' });
    } else {
      toast({ title: 'Upload Complete', description: `${successCount} repayments recorded across ${stats.batchCount} batch(es).` });
    }

    setSubmitted(true);
    onComplete();
  };

  const handleClear = () => {
    setRows([]);
    setFileName('');
    setSubmitted(false);
  };

  return (
    <div className="space-y-4">
      {/* Upload & Template */}
      <div className="bg-card rounded-xl p-5 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <label className="flex-1 cursor-pointer">
            <div className="flex items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-6 hover:border-primary/50 hover:bg-secondary/30 transition-colors text-center">
              {matching ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-semibold text-sm">
                  {matching ? 'Parsing & matching across all batches…' : 'Click to upload multi-batch repayment Excel'}
                </p>
                <p className="text-xs text-muted-foreground">.xlsx or .xls format • One file for multiple batches</p>
              </div>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" disabled={matching} />
          </label>
          <Button variant="outline" size="sm" onClick={generateTemplate} className="shrink-0">
            <Download className="w-4 h-4 mr-2" /> Download Template
          </Button>
        </div>

        {fileName && (
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            <span className="font-medium">{fileName}</span>
            <Button variant="ghost" size="sm" onClick={handleClear}><Trash2 className="w-3 h-3" /></Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Expected columns:</p>
          <p>{EXPECTED_HEADERS.join(' • ')}</p>
          <p className="mt-1 text-primary/80">Tip: Use batch code (e.g. BATCH-2025-001) or batch name in the "Organizations/Batch" column.</p>
        </div>
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="bg-card rounded-xl p-3 shadow-card flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
          </div>
          <div className="bg-card rounded-xl p-3 shadow-card flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <div>
              <p className="text-xl font-bold text-green-600">{stats.valid}</p>
              <p className="text-xs text-muted-foreground">Matched</p>
            </div>
          </div>
          <div className="bg-card rounded-xl p-3 shadow-card flex items-center gap-3">
            <XCircle className="w-6 h-6 text-destructive" />
            <div>
              <p className="text-xl font-bold text-destructive">{stats.invalid}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>
          <div className="bg-card rounded-xl p-3 shadow-card flex items-center gap-3">
            <Package className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xl font-bold">{stats.batchCount}</p>
              <p className="text-xs text-muted-foreground">Batches</p>
            </div>
          </div>
          <div className="bg-card rounded-xl p-3 shadow-card flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xl font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-muted-foreground">Total Amount</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {rows.length > 0 && !submitted && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Matched To</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">NHF No.</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Ref</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remita No.</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'bg-destructive/5'}>
                    <td className="px-3 py-2 font-mono text-xs">{i + 1}</td>
                    <td className="px-3 py-2">
                      {row.valid
                        ? <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Matched</Badge>
                        : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>}
                    </td>
                    <td className="px-3 py-2 font-medium">{[row.title, row.surname, row.firstName, row.otherName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.batchCode ? (
                        <Badge variant="outline" className="text-primary border-primary/30">{row.batchCode}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{row.organisation || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-primary text-xs">{row.beneficiaryName || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.nhfNumber || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.loanRefNo || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.remitaNumber || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.dateOnRemitaReceipt || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.amount > 0 ? formatCurrency(row.amount) : '—'}</td>
                    <td className="px-3 py-2 text-center">{row.monthOfPayment > 0 ? row.monthOfPayment : '—'}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {row.errors.length > 0 && (
                        <div className="flex items-start gap-1 text-xs text-destructive">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{row.errors.join('; ')}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit */}
      {rows.length > 0 && !submitted && (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClear}>Clear</Button>
          <Button
            onClick={handleSubmit}
            disabled={uploading || stats.valid === 0}
            className="gradient-accent text-accent-foreground border-0 font-semibold"
          >
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</> : `Record ${stats.valid} Repayment${stats.valid !== 1 ? 's' : ''} across ${stats.batchCount} Batch(es)`}
          </Button>
        </div>
      )}

      {submitted && (
        <div className="bg-card rounded-xl p-6 text-center space-y-3 border-2 border-green-300 shadow-card">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
          <h3 className="text-lg font-bold font-display">Multi-Batch Upload Successful</h3>
          <p className="text-sm text-muted-foreground">{stats.valid} repayments recorded across {stats.batchCount} batch(es).</p>
          <Button variant="outline" onClick={handleClear}>Upload Another</Button>
        </div>
      )}
    </div>
  );
}

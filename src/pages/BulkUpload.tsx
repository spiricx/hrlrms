import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { calculateLoan, formatCurrency } from '@/lib/loanCalculations';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import * as XLSX from 'xlsx';

interface ParsedRow {
  title: string;
  surname: string;
  firstName: string;
  otherName: string;
  organisation: string;
  nhfNumber: string;
  loanReferenceNumber: string;
  state: string;
  branch: string;
  loanTenorMonths: number;
  loanAmount: number;
  disbursementDate: string;
  maturityDate: string;
  interestRate: number;
  // computed
  monthlyEMI: number;
  commencementDate: string;
  terminationDate: string;
  totalPayment: number;
  // validation
  errors: string[];
  valid: boolean;
}

const EXPECTED_HEADERS = [
  'Title',
  'Surname',
  'First Name',
  'Other Name',
  'Organisations',
  'NHF number',
  'Loan Reference Number',
  'State',
  'Branch',
  'Loan Tenor',
  'Loan Amount',
  'Date of Loan Disbursement',
  'Interest',
];

function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const d = new Date(date.y, date.m - 1, date.d);
      return d.toISOString().split('T')[0];
    }
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  return null;
}

function validateRow(row: any): ParsedRow {
  const errors: string[] = [];

  const title = String(row['Title'] || '').trim();
  const surname = String(row['Surname'] || '').trim();
  const firstName = String(row['First Name'] || '').trim();
  const otherName = String(row['Other Name'] || '').trim();
  const organisation = String(row['Organisations'] || '').trim();
  const nhfNumber = String(row['NHF number'] || '').trim();
  const loanRef = String(row['Loan Reference Number'] || '').trim();
  const state = String(row['State'] || '').trim();
  const branch = String(row['Branch'] || '').trim();

  const loanTenorRaw = Number(row['Loan Tenor']);
  const loanAmountRaw = Number(row['Loan Amount']);
  const interestRaw = Number(row['Interest']);

  const disbDateStr = parseExcelDate(row['Date of Loan Disbursement']);
  const matDateStr = parseExcelDate(row['Date of Loan Maturity']);

  if (!surname) errors.push('Surname is required');
  if (!firstName) errors.push('First Name is required');
  if (!organisation) errors.push('Organisation is required');
  if (!state) errors.push('State is required');
  else if (!NIGERIA_STATES.includes(state as any)) errors.push(`Invalid state: ${state}`);
  if (!branch) errors.push('Branch is required');
  if (!loanAmountRaw || loanAmountRaw <= 0) errors.push('Loan Amount must be > 0');

  let tenorMonths = 0;
  if (!loanTenorRaw || loanTenorRaw <= 0) {
    errors.push('Loan Tenor is required');
  } else {
    tenorMonths = loanTenorRaw <= 5 ? loanTenorRaw * 12 : (loanTenorRaw <= 60 ? loanTenorRaw : 0);
    if (tenorMonths <= 0 || tenorMonths > 60) errors.push('Tenor must be 1-5 years or 1-60 months');
  }

  const interestRate = interestRaw > 0 ? interestRaw : 6;
  if (!disbDateStr) errors.push('Disbursement Date is invalid');

  let monthlyEMI = 0, commencementDate = '', terminationDate = '', totalPayment = 0;

  if (errors.length === 0 && disbDateStr && tenorMonths > 0) {
    const loan = calculateLoan({
      principal: loanAmountRaw,
      annualRate: interestRate,
      tenorMonths,
      moratoriumMonths: 1,
      disbursementDate: new Date(disbDateStr),
    });
    monthlyEMI = loan.monthlyEMI;
    commencementDate = loan.commencementDate.toISOString().split('T')[0];
    terminationDate = loan.terminationDate.toISOString().split('T')[0];
    totalPayment = loan.totalPayment;
  }

  return {
    title,
    surname,
    firstName,
    otherName,
    organisation,
    nhfNumber,
    loanReferenceNumber: loanRef,
    state,
    branch,
    loanTenorMonths: tenorMonths,
    loanAmount: loanAmountRaw || 0,
    disbursementDate: disbDateStr || '',
    maturityDate: matDateStr || '',
    interestRate,
    monthlyEMI,
    commencementDate,
    terminationDate,
    totalPayment,
    errors,
    valid: errors.length === 0,
  };
}

function generateTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    EXPECTED_HEADERS,
    ['Mr', 'Adeyemi', 'John', 'Olu', 'Federal Ministry of Works', 'NHF-00012345', 'HRL-2025-00001', 'Lagos', 'Ikeja Branch', 3, 2500000, '2025-01-15', 6],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Loans');
  ws['!cols'] = EXPECTED_HEADERS.map(() => ({ wch: 22 }));
  XLSX.writeFile(wb, 'Bulk_Loan_Upload_Template.xlsx');
}

export default function BulkUpload() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const stats = useMemo(() => {
    const valid = rows.filter(r => r.valid).length;
    return { total: rows.length, valid, invalid: rows.length - valid };
  }, [rows]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: 'Invalid File', description: 'Please upload an Excel file (.xlsx or .xls)', variant: 'destructive' });
      return;
    }

    setFileName(file.name);
    setSubmitted(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (jsonData.length === 0) {
          toast({ title: 'Empty File', description: 'The Excel file contains no data rows.', variant: 'destructive' });
          return;
        }

        const parsed = jsonData.map(row => validateRow(row));
        setRows(parsed);
        toast({ title: 'File Parsed', description: `${parsed.length} rows found. ${parsed.filter(r => r.valid).length} valid.` });
      } catch {
        toast({ title: 'Parse Error', description: 'Could not read the Excel file. Please check the format.', variant: 'destructive' });
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

    const records = validRows.map(r => ({
      title: r.title,
      surname: r.surname,
      first_name: r.firstName,
      other_name: r.otherName,
      name: [r.surname, r.firstName, r.otherName].filter(Boolean).join(' '),
      employee_id: r.nhfNumber || `BULK-${Date.now()}`,
      department: r.organisation,
      loan_amount: r.loanAmount,
      tenor_months: r.loanTenorMonths,
      interest_rate: r.interestRate,
      moratorium_months: 1,
      disbursement_date: r.disbursementDate,
      commencement_date: r.commencementDate,
      termination_date: r.terminationDate,
      monthly_emi: r.monthlyEMI,
      outstanding_balance: r.totalPayment,
      bank_branch: r.branch,
      state: r.state,
      nhf_number: r.nhfNumber,
      loan_reference_number: r.loanReferenceNumber,
      created_by: user?.id ?? null,
    }));

    const { error } = await supabase.from('beneficiaries').insert(records);
    setUploading(false);

    if (error) {
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
      return;
    }

    setSubmitted(true);
    toast({ title: 'Bulk Upload Complete', description: `${validRows.length} loans created successfully.` });
  };

  const handleClear = () => {
    setRows([]);
    setFileName('');
    setSubmitted(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Link to="/beneficiaries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Beneficiaries
      </Link>

      <div>
        <h1 className="text-3xl font-bold font-display">Bulk Loan Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upload an Excel file to create multiple loan accounts at once</p>
      </div>

      {/* Upload & Template */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <label className="flex-1 cursor-pointer">
            <div className="flex items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 hover:border-primary/50 hover:bg-secondary/30 transition-colors text-center">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-semibold">Click to upload Excel file</p>
                <p className="text-xs text-muted-foreground">.xlsx or .xls format</p>
              </div>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>
          <Button variant="outline" onClick={generateTemplate} className="shrink-0">
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

        {/* Expected columns info */}
        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Expected columns:</p>
          <p>{EXPECTED_HEADERS.join(' • ')}</p>
        </div>
      </Card>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4 flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.valid}</p>
              <p className="text-xs text-muted-foreground">Valid</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold text-destructive">{stats.invalid}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </Card>
        </div>
      )}

      {/* Preview Table */}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Surname</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Other Name</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>NHF No.</TableHead>
                  <TableHead>Loan Ref</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Tenor</TableHead>
                  <TableHead>Disbursement</TableHead>
                  <TableHead className="text-right">Monthly EMI</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i} className={row.valid ? '' : 'bg-destructive/5'}>
                    <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                    <TableCell>
                      {row.valid
                        ? <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Valid</Badge>
                        : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>}
                    </TableCell>
                    <TableCell>{row.title || '—'}</TableCell>
                    <TableCell>{row.surname || '—'}</TableCell>
                    <TableCell>{row.firstName || '—'}</TableCell>
                    <TableCell>{row.otherName || '—'}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{row.organisation}</TableCell>
                    <TableCell className="font-mono text-xs">{row.nhfNumber || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.loanReferenceNumber || '—'}</TableCell>
                    <TableCell>{row.state}</TableCell>
                    <TableCell>{row.branch}</TableCell>
                    <TableCell className="text-right font-mono">{row.loanAmount > 0 ? formatCurrency(row.loanAmount) : '—'}</TableCell>
                    <TableCell>{row.loanTenorMonths > 0 ? `${row.loanTenorMonths}m` : '—'}</TableCell>
                    <TableCell>{row.disbursementDate || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{row.monthlyEMI > 0 ? formatCurrency(row.monthlyEMI) : '—'}</TableCell>
                    <TableCell className="max-w-[200px]">
                      {row.errors.length > 0 && (
                        <div className="flex items-start gap-1 text-xs text-destructive">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{row.errors.join('; ')}</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
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
            {uploading ? 'Uploading…' : `Create ${stats.valid} Loan${stats.valid !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {submitted && (
        <Card className="p-6 text-center space-y-3 border-2 border-green-300">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold font-display">Upload Successful</h2>
          <p className="text-sm text-muted-foreground">{stats.valid} loans have been created.</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleClear}>Upload Another</Button>
            <Link to="/beneficiaries"><Button>View Beneficiaries</Button></Link>
          </div>
        </Card>
      )}
    </div>
  );
}

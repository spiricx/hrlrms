import { useState, useCallback, useMemo } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { formatLocalDate } from '@/lib/loanCalculations';
import * as XLSX from 'xlsx';

interface ParsedStaffRow {
  surname: string;
  firstName: string;
  otherNames: string;
  gender: string;
  maritalStatus: string;
  phone: string;
  email: string;
  staffId: string;
  nhfNumber: string;
  state: string;
  branch: string;
  dateOfBirth: string;
  bvn: string;
  nin: string;
  errors: string[];
  valid: boolean;
}

const EXPECTED_HEADERS = [
  'Surname',
  'First Name',
  'Other Names',
  'Gender',
  'Marital Status',
  'Phone Number',
  'Email',
  'Staff ID',
  'NHF Number',
  'State',
  'Branch',
  'Date of Birth',
  'BVN',
  'NIN',
];

function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const d = new Date(date.y, date.m - 1, date.d);
      return formatLocalDate(d);
    }
  }
  if (typeof value === 'string') {
    // Try D/M/Y format first
    const dmy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const d = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
      if (!isNaN(d.getTime())) return formatLocalDate(d);
    }
    // Try YYYY-MM-DD
    const parts = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (parts) {
      return formatLocalDate(new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) return formatLocalDate(d);
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatLocalDate(value);
  }
  return null;
}

function validateRow(row: any): ParsedStaffRow {
  const errors: string[] = [];

  const surname = String(row['Surname'] || '').trim();
  const firstName = String(row['First Name'] || '').trim();
  const otherNames = String(row['Other Names'] || '').trim();
  const gender = String(row['Gender'] || '').trim();
  const maritalStatus = String(row['Marital Status'] || '').trim();
  const phone = String(row['Phone Number'] || '').trim();
  const email = String(row['Email'] || '').trim();
  const staffId = String(row['Staff ID'] || '').trim();
  const nhfNumber = String(row['NHF Number'] || '').trim();
  const state = String(row['State'] || '').trim();
  const branch = String(row['Branch'] || '').trim();
  const dobStr = parseExcelDate(row['Date of Birth']);
  const bvn = String(row['BVN'] || '').trim();
  const nin = String(row['NIN'] || '').trim();

  if (!surname) errors.push('Surname is required');
  if (!firstName) errors.push('First Name is required');
  if (!staffId) errors.push('Staff ID is required');
  if (!state) errors.push('State is required');
  else if (!NIGERIA_STATES.includes(state as any)) errors.push(`Invalid state: ${state}`);
  if (!branch) errors.push('Branch is required');
  if (bvn && bvn.length !== 11) errors.push('BVN must be 11 digits');
  if (nin && nin.length !== 11) errors.push('NIN must be 11 digits');

  return {
    surname,
    firstName,
    otherNames,
    gender,
    maritalStatus,
    phone,
    email,
    staffId,
    nhfNumber,
    state,
    branch,
    dateOfBirth: dobStr || '',
    bvn,
    nin,
    errors,
    valid: errors.length === 0,
  };
}

function generateTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    EXPECTED_HEADERS,
    ['Adeyemi', 'John', 'Olu', 'Male', 'Married', '08012345678', 'john@fmbn.gov.ng', 'STF-LAS-001', 'NHF-00012345', 'Lagos', 'Ikeja Branch', '15/01/1985', '12345678901', '98765432101'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Staff');
  ws['!cols'] = EXPECTED_HEADERS.map(() => ({ wch: 20 }));
  XLSX.writeFile(wb, 'Bulk_Staff_Upload_Template.xlsx');
}

export default function BulkStaffUpload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ParsedStaffRow[]>([]);
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
  }, [toast]);

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ title: 'No Valid Rows', description: 'Fix errors before submitting.', variant: 'destructive' });
      return;
    }

    setUploading(true);

    const records = validRows.map(r => ({
      surname: r.surname,
      first_name: r.firstName,
      other_names: r.otherNames,
      gender: r.gender,
      marital_status: r.maritalStatus,
      phone: r.phone,
      email: r.email,
      staff_id: r.staffId,
      nhf_number: r.nhfNumber,
      state: r.state,
      branch: r.branch,
      date_of_birth: r.dateOfBirth || null,
      bvn_number: r.bvn,
      nin_number: r.nin,
      status: 'Active',
      created_by: user?.id ?? null,
    }));

    const { error } = await supabase.from('staff_members').insert(records as any);
    setUploading(false);

    if (error) {
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
      return;
    }

    setSubmitted(true);
    toast({ title: 'Bulk Upload Complete', description: `${validRows.length} staff records created successfully.` });
  };

  const handleClear = () => {
    setRows([]);
    setFileName('');
    setSubmitted(false);
  };

  return (
    <div className="space-y-6">
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

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Expected columns:</p>
          <p>{EXPECTED_HEADERS.join(' • ')}</p>
          <p className="mt-1 italic">Date of Birth format: D/M/Y (e.g. 15/01/1985)</p>
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
                  <TableHead>Surname</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Other Names</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Marital Status</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>NHF No.</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Date of Birth</TableHead>
                  <TableHead>BVN</TableHead>
                  <TableHead>NIN</TableHead>
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
                    <TableCell>{row.surname || '—'}</TableCell>
                    <TableCell>{row.firstName || '—'}</TableCell>
                    <TableCell>{row.otherNames || '—'}</TableCell>
                    <TableCell>{row.gender || '—'}</TableCell>
                    <TableCell>{row.maritalStatus || '—'}</TableCell>
                    <TableCell>{row.phone || '—'}</TableCell>
                    <TableCell>{row.email || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.staffId || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.nhfNumber || '—'}</TableCell>
                    <TableCell>{row.state || '—'}</TableCell>
                    <TableCell>{row.branch || '—'}</TableCell>
                    <TableCell>{row.dateOfBirth || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.bvn || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.nin || '—'}</TableCell>
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
          >
            {uploading ? 'Uploading…' : `Create ${stats.valid} Staff Record${stats.valid !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {submitted && (
        <Card className="p-6 text-center space-y-3 border-2 border-green-300">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold font-display">Upload Successful</h2>
          <p className="text-sm text-muted-foreground">{stats.valid} staff records have been created.</p>
          <Button variant="outline" onClick={handleClear}>Upload Another</Button>
        </Card>
      )}
    </div>
  );
}

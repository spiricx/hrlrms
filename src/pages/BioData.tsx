import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Download, FileText, Printer, Eye, Pencil } from 'lucide-react';
import { formatCurrency, formatTenor } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/contexts/AuthContext';
import BioDataExportButtons from '@/components/biodata/BioDataExport';
import BioDataEditForm from '@/components/biodata/BioDataEditForm';

const columns = [
  'S/N', 'Title', 'Surname', 'First Name', 'Other Name', 'Gender', 'Marital Status', 'Date of Birth',
  'Address', 'Phone Number', 'Email', 'BVN', 'NIN', 'NHF Number',
  'Organization', 'Employer No.', 'Staff ID', 'Date of Employment',
  'State', 'Bank Branch', 'Loan Ref No.', 'Loan Amount', 'Tenor (Months)',
  'Monthly Repayment', 'Disbursement Date',
];


type Beneficiary = {
  id: string;
  name: string;
  title: string | null;
  surname: string | null;
  first_name: string | null;
  other_name: string | null;
  gender: string | null;
  marital_status: string | null;
  date_of_birth: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  bvn_number: string | null;
  nin_number: string | null;
  nhf_number: string | null;
  department: string;
  employer_number: string | null;
  employee_id: string;
  date_of_employment: string | null;
  state: string;
  bank_branch: string;
  loan_reference_number: string | null;
  loan_amount: number;
  tenor_months: number;
  monthly_emi: number;
  disbursement_date: string;
  interest_rate: number;
  commencement_date: string;
  termination_date: string;
  outstanding_balance: number;
  total_paid: number;
};

function getField(b: Beneficiary, label: string, value: string) {
  return { label, value };
}

function buildFields(b: Beneficiary) {
  return [
    { section: 'Personal Information', fields: [
      { label: 'Title', value: b.title || '' },
      { label: 'Surname', value: b.surname || b.name?.split(' ')[0] || '' },
      { label: 'First Name', value: b.first_name || b.name?.split(' ')[1] || '' },
      { label: 'Other Name', value: b.other_name || '' },
      { label: 'Gender', value: b.gender || '' },
      { label: 'Marital Status', value: b.marital_status || '' },
      { label: 'Date of Birth', value: b.date_of_birth ? format(new Date(b.date_of_birth), 'dd/MM/yyyy') : '' },
      { label: 'Address', value: b.address || '' },
      { label: 'Phone Number', value: b.phone_number || '' },
      { label: 'Email', value: b.email || '' },
    ]},
    { section: 'Identification', fields: [
      { label: 'BVN', value: b.bvn_number || '' },
      { label: 'NIN', value: b.nin_number || '' },
      { label: 'NHF Number', value: b.nhf_number || '' },
    ]},
    { section: 'Employment Details', fields: [
      { label: 'Organization', value: b.department || '' },
      { label: 'Employer Number', value: b.employer_number || '' },
      { label: 'Staff ID', value: b.employee_id || '' },
      { label: 'Date of Employment', value: b.date_of_employment ? format(new Date(b.date_of_employment), 'dd/MM/yyyy') : '' },
      { label: 'State', value: b.state || '' },
      { label: 'Bank Branch', value: b.bank_branch || '' },
    ]},
    { section: 'Loan Information', fields: [
      { label: 'Loan Reference No.', value: b.loan_reference_number || '' },
      { label: 'Loan Amount', value: formatCurrency(Number(b.loan_amount)) },
      { label: 'Interest Rate', value: `${b.interest_rate}% Annuity` },
      { label: 'Tenor', value: formatTenor(b.tenor_months) },
      { label: 'Monthly Repayment', value: formatCurrency(Number(b.monthly_emi)) },
      { label: 'Disbursement Date', value: b.disbursement_date ? format(new Date(b.disbursement_date), 'dd/MM/yyyy') : '' },
      { label: 'Commencement Date', value: b.commencement_date ? format(new Date(b.commencement_date), 'dd/MM/yyyy') : '' },
      { label: 'Termination Date', value: b.termination_date ? format(new Date(b.termination_date), 'dd/MM/yyyy') : '' },
      { label: 'Total Paid', value: formatCurrency(Number(b.total_paid)) },
      { label: 'Outstanding Balance', value: formatCurrency(Number(b.outstanding_balance)) },
    ]},
  ];
}

function exportIndividualPDF(b: Beneficiary) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fullName = `${b.surname || b.name?.split(' ')[0] || ''} ${b.first_name || b.name?.split(' ')[1] || ''} ${b.other_name || ''}`.trim();
  doc.setFontSize(18);
  doc.text('Loan Applicant Bio Data', 40, 40);
  doc.setFontSize(11);
  doc.text(fullName, 40, 62);
  doc.setFontSize(8);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 40, 78);

  const sections = buildFields(b);
  let y = 95;
  sections.forEach(s => {
    if (y > 720) { doc.addPage(); y = 40; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(s.section, 40, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Field', 'Value']],
      body: s.fields.map(f => [f.label, f.value]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 76, 117], fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  });

  doc.save(`Bio_Data_${fullName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

function exportIndividualExcel(b: Beneficiary) {
  const fullName = `${b.surname || b.name?.split(' ')[0] || ''} ${b.first_name || b.name?.split(' ')[1] || ''} ${b.other_name || ''}`.trim();
  const sections = buildFields(b);
  const rows: string[][] = [['Loan Applicant Bio Data'], [fullName], []];
  sections.forEach(s => {
    rows.push([s.section]);
    s.fields.forEach(f => rows.push([f.label, f.value]));
    rows.push([]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bio Data');
  XLSX.writeFile(wb, `Bio_Data_${fullName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}

function printIndividual(b: Beneficiary) {
  const fullName = `${b.surname || b.name?.split(' ')[0] || ''} ${b.first_name || b.name?.split(' ')[1] || ''} ${b.other_name || ''}`.trim();
  const sections = buildFields(b);
  const html = `
    <html><head><title>Bio Data - ${fullName}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}
      h1{font-size:20px;margin-bottom:4px} h2{font-size:14px;margin-top:20px;margin-bottom:6px;color:#0f4c75;border-bottom:1px solid #ccc;padding-bottom:3px}
      table{width:100%;border-collapse:collapse;margin-bottom:10px}
      td{padding:6px 10px;border:1px solid #ddd;font-size:12px}
      td:first-child{font-weight:bold;width:35%;background:#f5f7fa}
      .meta{font-size:10px;color:#666;margin-bottom:16px}
      @media print{body{padding:10px}}
    </style></head><body>
    <h1>Loan Applicant Bio Data</h1>
    <p style="font-size:14px;margin:0 0 2px">${fullName}</p>
    <p class="meta">Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
    ${sections.map(s => `<h2>${s.section}</h2><table>${s.fields.map(f => `<tr><td>${f.label}</td><td>${f.value}</td></tr>`).join('')}</table>`).join('')}
    </body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

export default function BioData() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Beneficiary | null>(null);
  const [editing, setEditing] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: staffName = '' } = useQuery({
    queryKey: ['profile-name', user?.id],
    queryFn: async () => {
      if (!user?.id) return '';
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).single();
      return data?.full_name || user.email || '';
    },
    enabled: !!user?.id,
  });

  const { data: beneficiaries = [], isLoading } = useQuery({
    queryKey: ['bio-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const filtered = beneficiaries.filter((b) => {
    const q = search.toLowerCase();
    return (
      b.name?.toLowerCase().includes(q) ||
      b.nhf_number?.toLowerCase().includes(q) ||
      b.employee_id?.toLowerCase().includes(q) ||
      b.phone_number?.toLowerCase().includes(q) ||
      b.state?.toLowerCase().includes(q) ||
      b.loan_reference_number?.toLowerCase().includes(q)
    );
  });

  const toRow = (b: typeof beneficiaries[0], i: number) => [
    i + 1,
    (b as any).title || '',
    b.surname || b.name?.split(' ')[0] || '',
    b.first_name || b.name?.split(' ')[1] || '',
    b.other_name || '',
    b.gender || '',
    b.marital_status || '',
    b.date_of_birth ? format(new Date(b.date_of_birth), 'dd/MM/yyyy') : '',
    b.address || '',
    b.phone_number || '',
    b.email || '',
    b.bvn_number || '',
    b.nin_number || '',
    b.nhf_number || '',
    b.department || '',
    b.employer_number || '',
    b.employee_id || '',
    b.date_of_employment ? format(new Date(b.date_of_employment), 'dd/MM/yyyy') : '',
    b.state || '',
    b.bank_branch || '',
    b.loan_reference_number || '',
    Number(b.loan_amount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }),
    formatTenor(b.tenor_months),
    Number(b.monthly_emi).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }),
    b.disbursement_date ? format(new Date(b.disbursement_date), 'dd/MM/yyyy') : '',
  ];

  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([columns, ...filtered.map(toRow)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bio Data');
    XLSX.writeFile(wb, `Loan_Applicant_Bio_Data_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
    doc.setFontSize(16);
    doc.text('Loan Applicant Bio Data', 40, 40);
    doc.setFontSize(9);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 40, 58);

    autoTable(doc, {
      head: [columns],
      body: filtered.map(toRow),
      startY: 70,
      styles: { fontSize: 6.5, cellPadding: 3 },
      headStyles: { fillColor: [15, 76, 117], fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    doc.save(`Loan_Applicant_Bio_Data_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display">Loan Applicant Bio Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comprehensive customer information for reference and future purposes
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, NHF, Staff ID, phone, state..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <BioDataExportButtons data={{ beneficiaries: filtered as any, staffName }} />
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {columns.map((c) => (
                  <th key={c} className="px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap text-xs">
                    {c}
                  </th>
                ))}
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap text-xs">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-muted-foreground">No records found.</td></tr>
              ) : (
                filtered.map((b, i) => (
                  <tr key={b.id} className="border-b table-row-highlight cursor-pointer" onClick={() => setSelected(b as any)}>
                    <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{(b as any).title || ''}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{b.surname || b.name?.split(' ')[0] || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.first_name || b.name?.split(' ')[1] || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.other_name || ''}</td>
                    <td className="px-3 py-2.5">{b.gender || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.marital_status || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.date_of_birth ? format(new Date(b.date_of_birth), 'dd/MM/yyyy') : ''}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate" title={b.address || ''}>{b.address || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.phone_number || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.email || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.bvn_number || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.nin_number || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{b.nhf_number || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.department || ''}</td>
                    <td className="px-3 py-2.5">{b.employer_number || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.employee_id || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.date_of_employment ? format(new Date(b.date_of_employment), 'dd/MM/yyyy') : ''}</td>
                    <td className="px-3 py-2.5">{b.state || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.bank_branch || ''}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{b.loan_reference_number || ''}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatCurrency(Number(b.loan_amount))}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatTenor(b.tenor_months)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatCurrency(Number(b.monthly_emi))}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{b.disbursement_date ? format(new Date(b.disbursement_date), 'dd/MM/yyyy') : ''}</td>
                    <td className="px-3 py-2.5">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(b as any); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t text-xs text-muted-foreground">
          Showing {filtered.length} of {beneficiaries.length} records
        </div>
      </div>

      {/* Individual Bio Data Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setEditing(false); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (() => {
            const fullName = `${selected.surname || selected.name?.split(' ')[0] || ''} ${selected.first_name || selected.name?.split(' ')[1] || ''} ${selected.other_name || ''}`.trim();
            const sections = buildFields(selected);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl">{fullName}</DialogTitle>
                  <p className="text-sm text-muted-foreground">Individual Loan Applicant Bio Data</p>
                </DialogHeader>

                {editing ? (
                  <BioDataEditForm
                    beneficiary={selected}
                    onSaved={() => {
                      setEditing(false);
                      setSelected(null);
                      queryClient.invalidateQueries({ queryKey: ['bio-data'] });
                    }}
                    onCancel={() => setEditing(false)}
                  />
                ) : (
                  <>
                    <div className="flex gap-2 mb-4">
                      <Button variant="default" size="sm" onClick={() => setEditing(true)}>
                        <Pencil className="w-4 h-4 mr-1.5" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportIndividualExcel(selected)}>
                        <Download className="w-4 h-4 mr-1.5" /> Excel
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportIndividualPDF(selected)}>
                        <FileText className="w-4 h-4 mr-1.5" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => printIndividual(selected)}>
                        <Printer className="w-4 h-4 mr-1.5" /> Print
                      </Button>
                    </div>

                    <div className="space-y-5">
                      {sections.map(s => (
                        <div key={s.section}>
                          <h3 className="text-sm font-semibold text-primary mb-2 border-b border-border pb-1">{s.section}</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            {s.fields.map(f => (
                              <div key={f.label} className="flex justify-between py-1.5 border-b border-border/40">
                                <span className="text-xs text-muted-foreground">{f.label}</span>
                                <span className="text-sm font-medium text-right">{f.value || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

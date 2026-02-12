import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const columns = [
  'S/N', 'Surname', 'First Name', 'Other Name', 'Gender', 'Marital Status', 'Date of Birth',
  'Address', 'Phone Number', 'Email', 'BVN', 'NIN', 'NHF Number',
  'Organization', 'Employer No.', 'Staff ID', 'Date of Employment',
  'State', 'Bank Branch', 'Loan Ref No.', 'Loan Amount', 'Tenor (Months)',
  'Monthly Repayment', 'Disbursement Date',
];

function formatTenor(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} Month${m !== 1 ? 's' : ''}`;
  if (m === 0) return `${y} Year${y !== 1 ? 's' : ''}`;
  return `${y} Year${y !== 1 ? 's' : ''} ${m} Month${m !== 1 ? 's' : ''}`;
}

export default function BioData() {
  const [search, setSearch] = useState('');

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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="w-4 h-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileText className="w-4 h-4 mr-1.5" /> PDF
          </Button>
        </div>
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
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">No records found.</td></tr>
              ) : (
                filtered.map((b, i) => (
                  <tr key={b.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
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
    </div>
  );
}

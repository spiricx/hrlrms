import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatTenor, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import fmbnLogo from '@/assets/fmbn_logo.png';

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
};

export interface BioDataReportData {
  beneficiaries: Beneficiary[];
  staffName: string;
}

const REPORT_TITLE = 'BIODATA OF HOME RENOVATION LOAN APPLICANTS';

const columns = [
  'S/N', 'Title', 'Surname', 'First Name', 'Other Name', 'Gender', 'Marital Status', 'Date of Birth',
  'Address', 'Phone Number', 'Email', 'BVN', 'NIN', 'NHF Number',
  'Organization', 'Employer No.', 'Staff ID', 'Date of Employment',
  'State', 'Bank Branch', 'Loan Ref No.', 'Loan Amount', 'Tenor (Months)',
  'Monthly Repayment', 'Disbursement Date',
];

function formatDateTime(d: Date): string {
  return `${format(d, 'dd MMM yyyy')} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function toRow(b: Beneficiary, i: number): (string | number)[] {
  return [
    i + 1,
    b.title || '',
    b.surname || b.name?.split(' ')[0] || '',
    b.first_name || b.name?.split(' ')[1] || '',
    b.other_name || '',
    b.gender || '',
    b.marital_status || '',
    b.date_of_birth ? format(new Date(b.date_of_birth), 'dd MMMM yyyy') : '',
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
}

async function getLogoBase64(): Promise<string> {
  try {
    const response = await fetch(fmbnLogo);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export function exportBioDataToExcel(data: BioDataReportData) {
  const now = new Date();
  const headerRows: (string | number)[][] = [
    ['FEDERAL MORTGAGE BANK OF NIGERIA'],
    [REPORT_TITLE],
    [],
    ['Date & Time of Report', formatDateTime(now)],
    ['Downloaded By', data.staffName],
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...headerRows, columns, ...data.beneficiaries.map(toRow)]);
  ws['!cols'] = columns.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bio Data');
  XLSX.writeFile(wb, `BioData_Home_Renovation_Loan_${format(now, 'yyyyMMdd')}.xlsx`);
  toast.success('Excel report downloaded');
}

export async function exportBioDataToPDF(data: BioDataReportData) {
  const now = new Date();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const logoBase64 = await getLogoBase64();
  let y = 20;
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', centerX - 20, y, 40, 40);
    y += 48;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FEDERAL MORTGAGE BANK OF NIGERIA', centerX, y, { align: 'center' });
  y += 16;
  doc.setFontSize(11);
  doc.text(REPORT_TITLE, centerX, y, { align: 'center' });
  y += 20;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date & Time of Report: ${formatDateTime(now)}`, 40, y);
  y += 12;
  doc.text(`Downloaded By: ${data.staffName}`, 40, y);
  y += 18;

  autoTable(doc, {
    head: [columns],
    body: data.beneficiaries.map(toRow),
    startY: y,
    styles: { fontSize: 6.5, cellPadding: 3 },
    headStyles: { fillColor: [15, 76, 117], fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save(`BioData_Home_Renovation_Loan_${format(now, 'yyyyMMdd')}.pdf`);
  toast.success('PDF report downloaded');
}

export function printBioDataReport(data: BioDataReportData) {
  const now = new Date();
  const rows = data.beneficiaries.map((b, i) => {
    const cells = toRow(b, i);
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }).join('');

  const html = `<html><head><title>${REPORT_TITLE}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;color:#1a1a1a}
      .header{text-align:center;margin-bottom:16px}
      .header img{width:50px;height:50px;margin-bottom:6px}
      h1{font-size:16px;margin:4px 0} h2{font-size:13px;margin:2px 0;font-weight:normal}
      .meta{font-size:10px;color:#555;margin:10px 0 16px;text-align:left}
      table{width:100%;border-collapse:collapse;font-size:8px}
      th{background:#0f4c75;color:#fff;padding:5px 4px;text-align:left;white-space:nowrap}
      td{padding:4px;border:1px solid #ddd} tr:nth-child(even){background:#f5f7fa}
      @media print{body{padding:8px}}
    </style></head><body>
    <div class="header">
      <img src="${fmbnLogo}" alt="FMBN Logo"/>
      <h1>FEDERAL MORTGAGE BANK OF NIGERIA</h1>
      <h2>${REPORT_TITLE}</h2>
    </div>
    <div class="meta">
      <div>Date & Time of Report: ${formatDateTime(now)}</div>
      <div>Downloaded By: ${data.staffName}</div>
    </div>
    <table><thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
  toast.success('Print dialog opened');
}

interface BioDataExportButtonsProps {
  data: BioDataReportData;
}

export default function BioDataExportButtons({ data }: BioDataExportButtonsProps) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportBioDataToExcel(data)}>
        <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportBioDataToPDF(data)}>
        <FileText className="w-4 h-4 mr-1.5" /> PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => printBioDataReport(data)}>
        <Printer className="w-4 h-4 mr-1.5" /> Print
      </Button>
    </div>
  );
}

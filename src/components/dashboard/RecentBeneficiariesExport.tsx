import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatTenor } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import { NG_DATE } from '@/lib/dateFormat';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface RecentBenExportRow {
  name: string;
  organization: string;
  loanRefNo: string;
  nhfNo: string;
  gender: string;
  state: string;
  branch: string;
  tenor: number;
  loanAmount: number;
  monthlyRepayment: number;
  outstanding: number;
  totalPaid: number;
  lastPmtAmt: number;
  lastPmtDate: string;
  ageOfArrears: string;
  monthsArrears: number;
  arrearsAmt: number;
  status: string;
}

interface Props {
  records: RecentBenExportRow[];
  staffName: string;
}

const BANK_NAME = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const TITLE = 'Recent Beneficiaries Report';
const HEADERS = [
  'S/N', 'Beneficiary', 'Organization', 'Loan Ref No', 'NHF No', 'Gender',
  'State', 'Branch', 'Tenor', 'Loan Amount (₦)', 'Monthly Repayment (₦)',
  'Outstanding (₦)', 'Total Paid (₦)', 'Last Pmt Amt (₦)', 'Last Pmt Date',
  'Age of Arrears', 'Mths Arrears', 'Arrears Amt (₦)', 'Status',
];

function fmtNow() {
  const d = new Date();
  return `${format(d, NG_DATE)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function toRow(r: RecentBenExportRow, i: number): (string | number)[] {
  return [
    i + 1, r.name, r.organization, r.loanRefNo, r.nhfNo, r.gender,
    r.state, r.branch, formatTenor(r.tenor), r.loanAmount, r.monthlyRepayment,
    r.outstanding, r.totalPaid, r.lastPmtAmt, r.lastPmtDate,
    r.ageOfArrears, r.monthsArrears, r.arrearsAmt, r.status,
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
  } catch { return ''; }
}

export function exportRecentBenExcel(records: RecentBenExportRow[], staffName: string) {
  const wb = XLSX.utils.book_new();
  const rows = [
    [BANK_NAME], [TITLE],
    [`Generated: ${fmtNow()} | By: ${staffName}`], [],
    HEADERS,
    ...records.map((r, i) => toRow(r, i)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((_, i) => ({ wch: i === 0 ? 6 : i >= 9 ? 18 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Recent Beneficiaries');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'Recent_Beneficiaries_Report.xlsx');
  toast.success('Excel exported');
}

export async function exportRecentBenPDF(records: RecentBenExportRow[], staffName: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const logo = await getLogoBase64();

  if (logo) doc.addImage(logo, 'PNG', 14, 8, 24, 24);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 100, 0);
  doc.text(BANK_NAME, logo ? 42 : 14, 18);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(TITLE, logo ? 42 : 14, 26);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${fmtNow()} | By: ${staffName}`, 14, 36);

  autoTable(doc, {
    startY: 40,
    head: [HEADERS],
    body: records.map((r, i) => toRow(r, i)),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save('Recent_Beneficiaries_Report.pdf');
  toast.success('PDF exported');
}

export function printRecentBen(records: RecentBenExportRow[], staffName: string) {
  const html = `<html><head><title>${TITLE}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:20px;font-size:11px}
      .header{text-align:center;margin-bottom:16px}
      .header img{height:80px;margin-bottom:8px}
      .header h1{font-size:22px;margin:0;color:#006400;font-weight:bold}
      .header h2{font-size:16px;margin:4px 0;font-weight:bold}
      .meta{font-size:10px;color:#666;margin-bottom:12px;text-align:center}
      table{width:100%;border-collapse:collapse;font-size:9px}
      th{background:#006400;color:#fff;padding:5px 4px;text-align:left}
      td{padding:4px;border-bottom:1px solid #ddd}
      tr:nth-child(even){background:#f9f9f9}
      .text-right{text-align:right}
      .text-center{text-align:center}
      @media print{@page{size:A3 landscape;margin:10mm}}
    </style></head><body>
    <div class="header">
      <img src="${fmbnLogo}" /><h1>${BANK_NAME}</h1><h2>${TITLE}</h2>
    </div>
    <div class="meta">Generated: ${fmtNow()} | By: ${staffName}</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${records.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.name}</td><td>${r.organization}</td><td>${r.loanRefNo}</td>
      <td>${r.nhfNo}</td><td>${r.gender}</td><td>${r.state}</td><td>${r.branch}</td>
      <td class="text-center">${formatTenor(r.tenor)}</td>
      <td class="text-right">${formatCurrency(r.loanAmount)}</td>
      <td class="text-right">${formatCurrency(r.monthlyRepayment)}</td>
      <td class="text-right">${formatCurrency(r.outstanding)}</td>
      <td class="text-right">${formatCurrency(r.totalPaid)}</td>
      <td class="text-right">${formatCurrency(r.lastPmtAmt)}</td>
      <td>${r.lastPmtDate}</td>
      <td>${r.ageOfArrears}</td>
      <td class="text-center">${r.monthsArrears}</td>
      <td class="text-right">${formatCurrency(r.arrearsAmt)}</td>
      <td>${r.status}</td>
    </tr>`).join('')}
    </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  toast.success('Print dialog opened');
}

export default function RecentBeneficiariesExport({ records, staffName }: Props) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => exportRecentBenPDF(records, staffName)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportRecentBenExcel(records, staffName)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => printRecentBen(records, staffName)}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
    </div>
  );
}

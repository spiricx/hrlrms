import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import { NG_DATE } from '@/lib/dateFormat';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface LoanHistoryExportRow {
  name: string;
  loanRef: string;
  stateBranch: string;
  organization: string;
  loanOfficer: string;
  created: string;
  loanAmount: number;
  totalRepaid: number;
  balance: number;
  health: string;
  daysOverdue: string;
  lastPayment: string;
}

interface Props {
  records: LoanHistoryExportRow[];
  staffName: string;
}

const BANK_NAME = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const TITLE = 'Loan History Report';
const HEADERS = [
  'S/N', 'Beneficiary', 'Loan Ref', 'State / Branch', 'Organization',
  'Loan Officer', 'Created', 'Loan Amount (₦)', 'Total Repaid (₦)',
  'Balance (₦)', 'Health', 'Days Overdue', 'Last Payment',
];

function fmtNow() {
  const d = new Date();
  return `${format(d, NG_DATE)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function toRow(r: LoanHistoryExportRow, i: number): (string | number)[] {
  return [
    i + 1, r.name, r.loanRef, r.stateBranch, r.organization,
    r.loanOfficer, r.created, r.loanAmount, r.totalRepaid,
    r.balance, r.health, r.daysOverdue, r.lastPayment,
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

export function exportLoanHistoryExcel(records: LoanHistoryExportRow[], staffName: string) {
  const wb = XLSX.utils.book_new();
  const rows = [
    [BANK_NAME], [TITLE],
    [`Generated: ${fmtNow()} | By: ${staffName}`], [],
    HEADERS,
    ...records.map((r, i) => toRow(r, i)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((_, i) => ({ wch: i === 0 ? 6 : i >= 7 ? 18 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Loan History');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'Loan_History_Report.xlsx');
  toast.success('Excel exported');
}

export async function exportLoanHistoryPDF(records: LoanHistoryExportRow[], staffName: string) {
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

  doc.save('Loan_History_Report.pdf');
  toast.success('PDF exported');
}

export function printLoanHistory(records: LoanHistoryExportRow[], staffName: string) {
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
      @media print{@page{size:A3 landscape;margin:10mm}}
    </style></head><body>
    <div class="header">
      <img src="${fmbnLogo}" /><h1>${BANK_NAME}</h1><h2>${TITLE}</h2>
    </div>
    <div class="meta">Generated: ${fmtNow()} | By: ${staffName}</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${records.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.name}</td><td>${r.loanRef}</td><td>${r.stateBranch}</td>
      <td>${r.organization}</td><td>${r.loanOfficer}</td><td>${r.created}</td>
      <td class="text-right">${formatCurrency(r.loanAmount)}</td>
      <td class="text-right">${formatCurrency(r.totalRepaid)}</td>
      <td class="text-right">${formatCurrency(r.balance)}</td>
      <td>${r.health}</td><td>${r.daysOverdue}</td><td>${r.lastPayment}</td>
    </tr>`).join('')}
    </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  toast.success('Print dialog opened');
}

export default function LoanHistoryExport({ records, staffName }: Props) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => exportLoanHistoryPDF(records, staffName)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportLoanHistoryExcel(records, staffName)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => printLoanHistory(records, staffName)}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
    </div>
  );
}

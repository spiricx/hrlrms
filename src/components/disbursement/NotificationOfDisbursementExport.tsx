import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import { NG_DATE } from '@/lib/dateFormat';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface NodRecord {
  surname: string;
  firstName: string;
  otherName: string;
  organization: string;
  loanBatch: string;
  nhfNumber: string;
  loanRefNo: string;
  amountDisbursed: number;
  monthlyRepayment: number;
  tenor: number;
  disbursementDate: string;
  terminationDate: string;
}

interface Props {
  records: NodRecord[];
  batchName: string;
  organization: string;
  staffName: string;
}

const BANK_NAME = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const TITLE = 'Notification of Disbursement';
const HEADERS = [
  'S/N', 'Surname', 'First Name', 'Other Name', 'Organization', 'Loan Batch',
  'NHF Number', 'Loan Ref No', 'Amount Disbursed (₦)', 'Monthly Repayment (₦)',
  'Tenor', 'Date of Disbursement', 'Loan Termination Date',
];

function fmtDate(d: string) {
  try { return format(new Date(d), NG_DATE); } catch { return d; }
}

function toRow(r: NodRecord, i: number): (string | number)[] {
  return [
    i + 1, r.surname, r.firstName, r.otherName, r.organization, r.loanBatch,
    r.nhfNumber, r.loanRefNo, r.amountDisbursed, r.monthlyRepayment,
    r.tenor, fmtDate(r.disbursementDate), fmtDate(r.terminationDate),
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

function fmtNow() {
  const d = new Date();
  return `${format(d, NG_DATE)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

// Excel
export function exportNodExcel(records: NodRecord[], batchName: string, organization: string, staffName: string) {
  const wb = XLSX.utils.book_new();
  const rows = [
    [BANK_NAME],
    [TITLE],
    [`Organization: ${organization} | Batch: ${batchName}`],
    [`Generated: ${fmtNow()} | By: ${staffName}`],
    [],
    HEADERS,
    ...records.map((r, i) => toRow(r, i)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((_, i) => ({ wch: i === 0 ? 6 : i >= 8 ? 20 : 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Notification');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `Notification_of_Disbursement_${batchName.replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel exported');
}

// PDF
export async function exportNodPDF(records: NodRecord[], batchName: string, organization: string, staffName: string) {
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
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(`Organization: ${organization}  |  Batch: ${batchName}`, 14, 36);
  doc.setFontSize(9);
  doc.text(`Generated: ${fmtNow()} | By: ${staffName}`, 14, 42);

  autoTable(doc, {
    startY: 46,
    head: [HEADERS],
    body: records.map((r, i) => toRow(r, i)),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`Notification_of_Disbursement_${batchName.replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF exported');
}

// Print
export function printNod(records: NodRecord[], batchName: string, organization: string, staffName: string) {
  const html = `<html><head><title>${TITLE}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:20px;font-size:12px}
      .header{text-align:center;margin-bottom:16px}
      .header img{height:80px;margin-bottom:8px}
      .header h1{font-size:22px;margin:0;color:#006400;font-weight:bold}
      .header h2{font-size:16px;margin:4px 0;font-weight:bold}
      .header h3{font-size:13px;margin:4px 0;font-weight:normal}
      .meta{font-size:10px;color:#666;margin-bottom:12px;text-align:center}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#006400;color:#fff;padding:5px 4px;text-align:left}
      td{padding:4px;border-bottom:1px solid #ddd}
      tr:nth-child(even){background:#f9f9f9}
      .text-right{text-align:right}
      .text-center{text-align:center}
      @media print{@page{size:A3 landscape;margin:10mm}}
    </style></head><body>
    <div class="header">
      <img src="${fmbnLogo}" /><h1>${BANK_NAME}</h1><h2>${TITLE}</h2>
      <h3>Organization: ${organization} | Batch: ${batchName}</h3>
    </div>
    <div class="meta">Generated: ${fmtNow()} | By: ${staffName}</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${records.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.surname}</td><td>${r.firstName}</td><td>${r.otherName}</td>
      <td>${r.organization}</td><td>${r.loanBatch}</td><td>${r.nhfNumber}</td><td>${r.loanRefNo}</td>
      <td class="text-right">${formatCurrency(r.amountDisbursed)}</td>
      <td class="text-right">${formatCurrency(r.monthlyRepayment)}</td>
      <td class="text-center">${r.tenor}</td>
      <td>${fmtDate(r.disbursementDate)}</td><td>${fmtDate(r.terminationDate)}</td>
    </tr>`).join('')}
    </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  toast.success('Print dialog opened');
}

export default function NotificationOfDisbursementExport({ records, batchName, organization, staffName }: Props) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => exportNodPDF(records, batchName, organization, staffName)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportNodExcel(records, batchName, organization, staffName)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => printNod(records, batchName, organization, staffName)}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
    </div>
  );
}

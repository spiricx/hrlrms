import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/loanCalculations';
import { format } from 'date-fns';
import { NG_DATE } from '@/lib/dateFormat';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface DisbursementSummary {
  batchId: string;
  batchName: string;
  organization: string;
  tenor: number;
  beneficiaryCount: number;
  disbursementMonth: string;
  disbursementYear: number;
  totalDisbursed: number;
  outstandingBalance: number;
  totalRepaid: number;
  monthlyRepayment: number;
  ageOfArrears: number;
  monthsInArrears: number;
  amtInArrears: number;
  lastPaymentDate: string | null;
  defaults: number;
  nplRatio: number;
  status: string;
}

interface Props {
  records: DisbursementSummary[];
  staffName: string;
  filters: { state: string; branch: string };
}

const BANK_NAME = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const TITLE = 'Disbursement Record';
const HEADERS = [
  'S/N', 'Organization', 'Loan Batch', 'Tenor', 'Beneficiaries', 'Month & Year',
  'Total Disbursed (₦)', 'Outstanding (₦)', 'Total Repaid (₦)', 'Monthly Repayment (₦)',
  'Age of Arrears (Days)', 'Mths Arrears', 'Amt in Arrears (₦)', 'Last Payment', 'Defaults', 'NPL Ratio', 'Status',
];

function fmtDate(d: string | null) {
  if (!d) return 'N/A';
  try { return format(new Date(d), NG_DATE); } catch { return d; }
}

function fmtNow() {
  const d = new Date();
  return `${format(d, NG_DATE)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function getFilterSummary(f: Props['filters']): string {
  const parts: string[] = [];
  if (f.state !== 'all') parts.push(f.state);
  if (f.branch !== 'all') parts.push(f.branch);
  return parts.length > 0 ? parts.join(' | ') : 'All Records';
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

function tenorInYears(months: number): string {
  const years = months / 12;
  return years % 1 === 0 ? `${years} Year${years !== 1 ? 's' : ''}` : `${years.toFixed(1)} Years`;
}

function toRow(r: DisbursementSummary, i: number): (string | number)[] {
  return [
    i + 1, r.organization, r.batchName, tenorInYears(r.tenor), r.beneficiaryCount,
    `${r.disbursementMonth} ${r.disbursementYear}`,
    r.totalDisbursed, r.outstandingBalance, r.totalRepaid, r.monthlyRepayment,
    r.ageOfArrears, r.monthsInArrears, r.amtInArrears, fmtDate(r.lastPaymentDate),
    r.defaults, r.nplRatio > 0 ? `${r.nplRatio}%` : '—', r.status,
  ];
}

// Excel
export function exportDisbursementRecordExcel(records: DisbursementSummary[], staffName: string, filters: Props['filters']) {
  const wb = XLSX.utils.book_new();
  const rows = [
    [BANK_NAME],
    [TITLE],
    [`Generated: ${fmtNow()} | By: ${staffName} | Filter: ${getFilterSummary(filters)}`],
    [],
    HEADERS,
    ...records.map((r, i) => toRow(r, i)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((_, i) => ({ wch: i === 1 ? 28 : i === 2 ? 24 : 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Disbursement Record');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `Disbursement_Record_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success('Excel exported');
}

// PDF
export async function exportDisbursementRecordPDF(records: DisbursementSummary[], staffName: string, filters: Props['filters']) {
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
  doc.text(`Generated: ${fmtNow()} | By: ${staffName} | Filter: ${getFilterSummary(filters)}`, 14, 36);

  autoTable(doc, {
    startY: 40,
    head: [HEADERS],
    body: records.map((r, i) => toRow(r, i)),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell(data: any) {
      if (data.section === 'body') {
        if ([10, 11, 12].includes(data.column.index)) {
          data.cell.styles.textColor = [200, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 8) {
          data.cell.styles.textColor = [0, 128, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`Disbursement_Record_${new Date().toISOString().slice(0, 10)}.pdf`);
  toast.success('PDF exported');
}

// Print
export function printDisbursementRecord(records: DisbursementSummary[], staffName: string, filters: Props['filters']) {
  const html = `<html><head><title>${TITLE}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:20px;font-size:11px}
      .header{text-align:center;margin-bottom:16px}
      .header img{height:80px;margin-bottom:8px}
      .header h1{font-size:22px;margin:0;color:#006400;font-weight:bold}
      .header h2{font-size:16px;margin:4px 0;font-weight:bold}
      .meta{font-size:10px;color:#666;margin-bottom:12px;text-align:center}
      table{width:100%;border-collapse:collapse;font-size:9px}
      th{background:#006400;color:#fff;padding:4px 3px;text-align:left;font-size:8px}
      td{padding:3px;border-bottom:1px solid #ddd}
      tr:nth-child(even){background:#f9f9f9}
      .text-right{text-align:right}
      .text-center{text-align:center}
      .text-red{color:#c00;font-weight:bold}
      .text-green{color:#008000;font-weight:bold}
      @media print{@page{size:A3 landscape;margin:10mm}}
    </style></head><body>
    <div class="header">
      <img src="${fmbnLogo}" /><h1>${BANK_NAME}</h1><h2>${TITLE}</h2>
    </div>
    <div class="meta">Generated: ${fmtNow()} | By: ${staffName} | Filter: ${getFilterSummary(filters)}</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${records.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.organization}</td><td>${r.batchName}</td><td class="text-center">${r.tenor}</td>
      <td class="text-center">${r.beneficiaryCount}</td><td>${r.disbursementMonth} ${r.disbursementYear}</td>
      <td class="text-right">${formatCurrency(r.totalDisbursed)}</td><td class="text-right">${formatCurrency(r.outstandingBalance)}</td>
      <td class="text-right text-green">${formatCurrency(r.totalRepaid)}</td><td class="text-right">${formatCurrency(r.monthlyRepayment)}</td>
      <td class="text-center text-red">${r.ageOfArrears > 0 ? r.ageOfArrears + ' days' : '—'}</td>
      <td class="text-center text-red">${r.monthsInArrears > 0 ? r.monthsInArrears : '—'}</td>
      <td class="text-right text-red">${r.amtInArrears > 0 ? formatCurrency(r.amtInArrears) : '—'}</td>
      <td>${fmtDate(r.lastPaymentDate)}</td><td class="text-center">${r.defaults}</td>
      <td class="text-center">${r.nplRatio > 0 ? r.nplRatio + '%' : '—'}</td><td>${r.status}</td>
    </tr>`).join('')}
    </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  toast.success('Print dialog opened');
}

export default function DisbursementRecordExport({ records, staffName, filters }: Props) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => exportDisbursementRecordPDF(records, staffName, filters)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportDisbursementRecordExcel(records, staffName, filters)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => printDisbursementRecord(records, staffName, filters)}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
    </div>
  );
}

import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface BatchDefaultRecord {
  batchName: string;
  batchCode: string;
  state: string;
  branch: string;
  totalBeneficiaries: number;
  defaultCount: number;
  totalLoanAmount: number;
  totalOutstanding: number;
  totalPaid: number;
  totalArrearsAmount: number;
  avgMonthsInArrears: number;
  avgAgeOfArrears: number;
  status: string;
}

interface Props {
  records: BatchDefaultRecord[];
  staffName: string;
  filters: { state: string; branch: string };
}

const REPORT_TITLE = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const REPORT_SUBTITLE = 'Report on Batch Loan Defaults';
const HEADERS = [
  'S/N', 'Batch Name', 'Batch Code', 'State', 'Branch', 'Beneficiaries',
  'Defaults', 'Total Loan Amt (₦)', 'Outstanding (₦)', 'Total Paid (₦)',
  'Arrears Amount (₦)', 'Avg Mths Arrears', 'Status',
];

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function getFilterSummary(filters: Props['filters']): string {
  const parts: string[] = [];
  if (filters.state !== 'all') parts.push(filters.state);
  if (filters.branch !== 'all') parts.push(filters.branch);
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

function toRow(r: BatchDefaultRecord, i: number): (string | number)[] {
  return [
    i + 1, r.batchName, r.batchCode, r.state, r.branch, r.totalBeneficiaries,
    r.defaultCount, r.totalLoanAmount, r.totalOutstanding, r.totalPaid,
    r.totalArrearsAmount, r.avgMonthsInArrears, r.status,
  ];
}

export function exportBatchDefaultsExcel(records: BatchDefaultRecord[], staffName: string, filters: Props['filters']) {
  const wb = XLSX.utils.book_new();
  const rows = [
    [REPORT_TITLE],
    [REPORT_SUBTITLE],
    [`Generated: ${formatDateTime(new Date())} | By: ${staffName} | Filter: ${getFilterSummary(filters)}`],
    [],
    HEADERS,
    ...records.map((r, i) => toRow(r, i)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((_, i) => ({ wch: i === 1 ? 30 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Batch Defaults');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `Batch_Defaults_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success('Excel exported successfully');
}

export async function exportBatchDefaultsPDF(records: BatchDefaultRecord[], staffName: string, filters: Props['filters']) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const logoBase64 = await getLogoBase64();

  if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 8, 24, 24);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(REPORT_TITLE, logoBase64 ? 42 : 14, 18);
  doc.setFontSize(13); doc.setFont('helvetica', 'normal');
  doc.text(REPORT_SUBTITLE, logoBase64 ? 42 : 14, 26);
  doc.setFontSize(9);
  doc.text(`Generated: ${formatDateTime(new Date())} | By: ${staffName} | Filter: ${getFilterSummary(filters)}`, 14, 38);

  autoTable(doc, {
    startY: 42,
    head: [HEADERS],
    body: records.map((r, i) => toRow(r, i)),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell(data: any) {
      if (data.section === 'body') {
        if ([6, 10, 11].includes(data.column.index)) {
          data.cell.styles.textColor = [200, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 9) {
          data.cell.styles.textColor = [0, 128, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`Batch_Defaults_${new Date().toISOString().slice(0, 10)}.pdf`);
  toast.success('PDF exported successfully');
}

export function printBatchDefaults(records: BatchDefaultRecord[], staffName: string, filters: Props['filters']) {
  const html = `
    <html><head><title>Batch Loan Defaults</title>
    <style>
      body{font-family:Arial,sans-serif;margin:20px;font-size:11px}
      .header{text-align:center;margin-bottom:16px}
      .header img{height:80px;margin-bottom:8px}
      .header h1{font-size:22px;margin:0}
      .header h2{font-size:15px;margin:4px 0;font-weight:normal}
      .meta{font-size:10px;color:#666;margin-bottom:12px;text-align:center}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#006400;color:#fff;padding:5px;text-align:left}
      td{padding:4px;border-bottom:1px solid #ddd}
      tr:nth-child(even){background:#f9f9f9}
      .text-right{text-align:right}
      .text-center{text-align:center}
      .text-red{color:#c00;font-weight:bold}
      .text-green{color:#008000;font-weight:bold}
      @media print{@page{size:A3 landscape;margin:10mm}}
    </style></head><body>
    <div class="header">
      <img src="${fmbnLogo}" /><h1>${REPORT_TITLE}</h1><h2>${REPORT_SUBTITLE}</h2>
    </div>
    <div class="meta">Generated: ${formatDateTime(new Date())} | By: ${staffName} | Filter: ${getFilterSummary(filters)}</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${records.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.batchName}</td><td>${r.batchCode}</td><td>${r.state}</td><td>${r.branch}</td>
      <td class="text-center">${r.totalBeneficiaries}</td><td class="text-center text-red">${r.defaultCount}</td>
      <td class="text-right">${formatCurrency(r.totalLoanAmount)}</td><td class="text-right">${formatCurrency(r.totalOutstanding)}</td>
      <td class="text-right text-green">${formatCurrency(r.totalPaid)}</td>
      <td class="text-right text-red">${formatCurrency(r.totalArrearsAmount)}</td>
      <td class="text-center text-red">${r.avgMonthsInArrears}</td><td>${r.status}</td>
    </tr>`).join('')}
    </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  toast.success('Print dialog opened');
}

export default function BatchDefaultsExport({ records, staffName, filters }: Props) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => exportBatchDefaultsPDF(records, staffName, filters)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportBatchDefaultsExcel(records, staffName, filters)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => printBatchDefaults(records, staffName, filters)}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
    </div>
  );
}

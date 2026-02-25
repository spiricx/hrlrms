import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface BatchRow {
  batchName: string;
  state: string;
  branch: string;
  totalLoans: number;
  maxTenor: number;
  totalDisbursed: number;
  totalOutstanding: number;
  totalRepaid: number;
  totalMonthsInArrears: number;
  worstDpd: number;
  totalArrearsAmount: number;
  lastPaymentDate: string | null;
  nplAmount: number;
  nplCount: number;
  par30: number;
  par90: number;
  activeAmount: number;
}

export interface NplBatchReportData {
  rows: BatchRow[];
  staffName: string;
  filters: { state: string; dateFrom?: string; dateTo?: string };
}

const REPORT_TITLE = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const REPORT_SUBTITLE = 'Report on NPL Status of Home Renovation Loan';

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function formatLastPayment(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
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

function getFilterSummary(filters: NplBatchReportData['filters']): string {
  const parts: string[] = [];
  if (filters.dateFrom) parts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`To: ${filters.dateTo}`);
  if (filters.state !== 'all') parts.push(filters.state);
  return parts.length > 0 ? parts.join(' | ') : 'All Records';
}

const HEADERS = [
  'S/N', 'Batch Name', 'State', 'Branch', 'Active Loans', 'Loan Tenor',
  'Total Disbursed (₦)', 'Outstanding (₦)', 'Total Repayment Made So Far (₦)',
  'Months in Arrears', 'Age in Arrears', 'Arrears in Amount (₦)', 'DPD',
  'Last Payment Date', 'NPL Amount (₦)', 'NPL Count', 'NPL Ratio', 'PAR 30+ (₦)', 'PAR 90+ (₦)',
];

function buildRow(r: BatchRow, idx: number): (string | number)[] {
  const ratio = r.activeAmount > 0 ? ((r.nplAmount / r.activeAmount) * 100).toFixed(1) + '%' : '0.0%';
  const age = r.worstDpd > 0 ? `${Math.floor(r.worstDpd / 30)}m ${r.worstDpd % 30}d` : '—';
  return [
    idx + 1, r.batchName, r.state || '—', r.branch || '—', r.totalLoans,
    `${r.maxTenor} months`, r.totalDisbursed, r.totalOutstanding, r.totalRepaid,
    r.totalMonthsInArrears, age, r.totalArrearsAmount, r.worstDpd,
    formatLastPayment(r.lastPaymentDate), r.nplAmount, r.nplCount, ratio, r.par30, r.par90,
  ];
}

export function exportBatchToExcel(data: NplBatchReportData) {
  const wb = XLSX.utils.book_new();
  const now = new Date();
  const rows = [
    [REPORT_TITLE], [REPORT_SUBTITLE], [],
    ['Date & Time of Report', formatDateTime(now)],
    ['Reported By', data.staffName],
    ['Filter Applied', getFilterSummary(data.filters)],
    [],
    HEADERS,
    ...data.rows.map((r, i) => buildRow(r, i)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'NPL by Batch');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `FMBN_NPL_Batch_Report_${formatDate(now).replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel batch report exported');
}

export async function exportBatchToPDF(data: NplBatchReportData) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const logoBase64 = await getLogoBase64();
  if (logoBase64) doc.addImage(logoBase64, 'PNG', centerX - 10, 8, 20, 20);
  let y = logoBase64 ? 32 : 14;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(REPORT_TITLE, centerX, y, { align: 'center' }); y += 8;
  doc.setFontSize(12);
  doc.text(REPORT_SUBTITLE, centerX, y, { align: 'center' }); y += 10;

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Date & Time of Report: ${formatDateTime(now)}`, 14, y); y += 6;
  doc.text(`Reported By: ${data.staffName}`, 14, y); y += 6;
  doc.text(`Filter: ${getFilterSummary(data.filters)}`, 14, y); y += 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('NPL Ratio by Loan Batch', 14, y); y += 2;

  autoTable(doc, {
    startY: y,
    head: [HEADERS],
    body: data.rows.map((r, i) => {
      const row = buildRow(r, i);
      return [
        row[0], row[1], row[2], row[3], row[4], row[5],
        formatCurrency(row[6] as number), formatCurrency(row[7] as number), formatCurrency(row[8] as number),
        row[9], row[10], formatCurrency(row[11] as number), row[12],
        row[13], formatCurrency(row[14] as number), row[15], row[16],
        formatCurrency(row[17] as number), formatCurrency(row[18] as number),
      ];
    }),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold', fontSize: 7 },
    margin: { left: 6, right: 6 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(`Generated: ${formatDateTime(now)} | Page ${i} of ${pageCount}`, centerX, pageH - 8, { align: 'center' });
  }

  doc.save(`FMBN_NPL_Batch_Report_${formatDate(now).replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF batch report exported');
}

export function printBatchReport(data: NplBatchReportData) {
  const now = new Date();
  const logoUrl = new URL(fmbnLogo, window.location.origin).href;

  const tableRows = data.rows.map((r, idx) => {
    const ratio = r.activeAmount > 0 ? ((r.nplAmount / r.activeAmount) * 100).toFixed(1) : '0.0';
    const age = r.worstDpd > 0 ? `${Math.floor(r.worstDpd / 30)}m ${r.worstDpd % 30}d` : '—';
    return `<tr>
      <td class="center">${idx + 1}</td><td>${r.batchName}</td><td>${r.state || '—'}</td><td>${r.branch || '—'}</td>
      <td class="right">${r.totalLoans}</td><td class="right">${r.maxTenor} months</td>
      <td class="right">${formatCurrency(r.totalDisbursed)}</td><td class="right">${formatCurrency(r.totalOutstanding)}</td>
      <td class="right">${formatCurrency(r.totalRepaid)}</td><td class="right">${r.totalMonthsInArrears}</td>
      <td class="right">${age}</td><td class="right npl-red">${formatCurrency(r.totalArrearsAmount)}</td>
      <td class="right ${r.worstDpd >= 90 ? 'npl-red' : ''}">${r.worstDpd}</td>
      <td>${formatLastPayment(r.lastPaymentDate)}</td>
      <td class="right npl-red">${formatCurrency(r.nplAmount)}</td><td class="right">${r.nplCount}</td>
      <td class="right">${ratio}%</td><td class="right">${formatCurrency(r.par30)}</td><td class="right">${formatCurrency(r.par90)}</td>
    </tr>`;
  }).join('');

  const html = `<html><head><title>NPL Batch Report - FMBN</title>
    <style>
      body{font-family:Arial,sans-serif;margin:30px;font-size:12px;color:#222}
      .header{text-align:center;margin-bottom:16px}.header img{width:70px;height:70px;margin-bottom:8px}
      h1{font-size:18px;margin:0;font-weight:bold}h2{font-size:14px;margin:4px 0 16px;font-weight:bold;color:#006040}
      .meta{margin-bottom:20px}.meta p{margin:3px 0}.label{font-weight:bold}
      table{width:100%;border-collapse:collapse;margin:12px 0 20px}
      th{background:#006040;color:white;padding:8px;text-align:left;font-size:9px}
      td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:9px}
      tr:nth-child(even){background:#f5f5f5}
      .footer{text-align:center;margin-top:30px;font-size:9px;color:#999;border-top:1px solid #ddd;padding-top:8px}
      .npl-red{color:#cc0000;font-weight:bold}.right{text-align:right}.center{text-align:center}
      @media print{body{margin:10mm}}
    </style></head><body>
    <div class="header"><img src="${logoUrl}" alt="FMBN Logo" /><br/><h1>${REPORT_TITLE}</h1><h2>${REPORT_SUBTITLE}</h2></div>
    <div class="meta">
      <p><span class="label">Date & Time of Report:</span> ${formatDateTime(now)}</p>
      <p><span class="label">Reported By:</span> ${data.staffName}</p>
      <p><span class="label">Filter:</span> ${getFilterSummary(data.filters)}</p>
    </div>
    <div style="font-size:14px;font-weight:bold;margin-bottom:4px">NPL Ratio by Loan Batch</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h.replace(/ \(₦\)/g, '')}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody></table>
    <div class="footer">Generated: ${formatDateTime(now)}</div>
    </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
  toast.success('Print view opened');
}

interface NplBatchExportButtonsProps {
  data: NplBatchReportData;
}

export default function NplBatchExportButtons({ data }: NplBatchExportButtonsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportBatchToPDF(data)}>
        <FileText className="w-4 h-4" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportBatchToExcel(data)}>
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => printBatchReport(data)}>
        <Printer className="w-4 h-4" /> Print
      </Button>
    </div>
  );
}

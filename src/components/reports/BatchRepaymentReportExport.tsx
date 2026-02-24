import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface BatchRepaymentRecord {
  batchName: string;
  batchCode: string;
  state: string;
  branch: string;
  rrrNumber: string;
  paymentDate: string;
  monthFor: number;
  expectedAmount: number;
  actualAmount: number;
  variance: number;
  notes: string;
  batchStatus: string;
}

export interface BatchRepaymentReportData {
  records: BatchRepaymentRecord[];
  filters: {
    fromDate: string;
    toDate: string;
    state: string;
    branch: string;
    batch: string;
  };
  staffName: string;
  totalRecords: number;
  uniqueBatches: number;
  totalExpected: number;
  totalActual: number;
  variance: number;
  stateBreakdown: { state: string; count: number; amount: number }[];
  branchBreakdown: { branch: string; count: number; amount: number }[];
  batchBreakdown: { id: string; name: string; count: number; amount: number }[];
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function getFilterSummary(filters: BatchRepaymentReportData['filters']): string {
  const parts: string[] = [];
  if (filters.fromDate) parts.push(`From: ${filters.fromDate}`);
  if (filters.toDate) parts.push(`To: ${filters.toDate}`);
  if (filters.state !== 'all') parts.push(filters.state);
  if (filters.branch !== 'all') parts.push(filters.branch);
  if (filters.batch !== 'all') parts.push(`Batch: ${filters.batch}`);
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
  } catch {
    return '';
  }
}

export function exportBatchReportToExcel(data: BatchRepaymentReportData) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  // Summary sheet
  const summaryRows = [
    ['FEDERAL MORTGAGE BANK OF NIGERIA'],
    ['BATCH LOAN REPAYMENT REPORT'],
    [],
    ['Date & Time of Report', formatDateTime(now)],
    ['Reported By', data.staffName],
    ['Filter Applied', getFilterSummary(data.filters)],
    [],
    ['SUMMARY'],
    ['Total Repayment Records', data.totalRecords],
    ['Unique Batches', data.uniqueBatches],
    ['Total Expected Amount', data.totalExpected],
    ['Total Actual Amount', data.totalActual],
    ['Variance (Actual − Expected)', data.variance],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 35 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Detail sheet
  const detailHeaders = ['S/N', 'Batch Name', 'Batch Code', 'State', 'Branch', 'RRR Number', 'Payment Date', 'Month', 'Expected Amount (₦)', 'Actual Amount (₦)', 'Variance (₦)', 'Notes', 'Batch Status'];
  const detailRows = data.records.map((r, i) => [
    i + 1, r.batchName, r.batchCode, r.state, r.branch, r.rrrNumber, r.paymentDate, r.monthFor, r.expectedAmount, r.actualAmount, r.variance, r.notes, r.batchStatus,
  ]);
  const detailWs = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  detailWs['!cols'] = detailHeaders.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, detailWs, 'Batch Repayment Details');

  // By State
  if (data.stateBreakdown.length > 0) {
    const rows = [['State', 'No. of Transactions', 'Total Amount (₦)'], ...data.stateBreakdown.map(s => [s.state, s.count, s.amount])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'By State');
  }

  // By Branch
  if (data.branchBreakdown.length > 0) {
    const rows = [['Branch', 'No. of Transactions', 'Total Amount (₦)'], ...data.branchBreakdown.map(b => [b.branch, b.count, b.amount])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'By Branch');
  }

  // By Batch
  if (data.batchBreakdown.length > 0) {
    const rows = [['Batch Name', 'No. of Transactions', 'Total Amount (₦)'], ...data.batchBreakdown.map(b => [b.name, b.count, b.amount])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'By Batch');
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  saveAs(blob, `FMBN_Batch_Repayment_Report_${formatDate(now).replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel report exported successfully');
}

export async function exportBatchReportToPDF(data: BatchRepaymentReportData) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const logoBase64 = await getLogoBase64();
  if (logoBase64) doc.addImage(logoBase64, 'PNG', centerX - 10, 6, 20, 20);

  let y = logoBase64 ? 30 : 12;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FEDERAL MORTGAGE BANK OF NIGERIA', centerX, y, { align: 'center' });
  y += 8;
  doc.setFontSize(13);
  doc.text('BATCH LOAN REPAYMENT REPORT', centerX, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date & Time of Report: ${formatDateTime(now)}`, 14, y);
  y += 6;
  doc.text(`Reported By: ${data.staffName}`, 14, y);
  y += 6;
  doc.text(`Filter: ${getFilterSummary(data.filters)}`, 14, y);
  y += 10;

  // Summary table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Batch Repayment Summary', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Repayment Records', String(data.totalRecords)],
      ['Unique Batches', String(data.uniqueBatches)],
      ['Total Expected Amount', formatCurrency(data.totalExpected)],
      ['Total Actual Amount', formatCurrency(data.totalActual)],
      ['Variance (Actual − Expected)', formatCurrency(data.variance)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // By State
  if (data.stateBreakdown.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Breakdown by State', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['State', 'Transactions', 'Amount Collected (₦)']],
      body: data.stateBreakdown.map(s => [s.state, String(s.count), formatCurrency(s.amount)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // By Branch
  if (data.branchBreakdown.length > 0) {
    if (y > 160) { doc.addPage(); y = 14; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Breakdown by Branch', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Branch', 'Transactions', 'Amount Collected (₦)']],
      body: data.branchBreakdown.map(b => [b.branch, String(b.count), formatCurrency(b.amount)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // By Batch
  if (data.batchBreakdown.length > 0) {
    if (y > 160) { doc.addPage(); y = 14; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Breakdown by Batch', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Batch Name', 'Transactions', 'Amount Collected (₦)']],
      body: data.batchBreakdown.map(b => [b.name, String(b.count), formatCurrency(b.amount)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Detail table on new page
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Detailed Batch Repayment Records', 14, 14);

  autoTable(doc, {
    startY: 18,
    head: [['S/N', 'Batch Name', 'Batch Code', 'State', 'Branch', 'RRR', 'Payment Date', 'Month', 'Expected', 'Actual', 'Variance', 'Notes', 'Status']],
    body: data.records.map((r, i) => [
      i + 1, r.batchName, r.batchCode, r.state, r.branch, r.rrrNumber, r.paymentDate, r.monthFor,
      formatCurrency(r.expectedAmount), formatCurrency(r.actualAmount), formatCurrency(r.variance), r.notes || '—', r.batchStatus,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold', fontSize: 7 },
    margin: { left: 6, right: 6 },
  });

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(`Generated: ${formatDateTime(now)} | Page ${i} of ${pageCount}`, centerX, pageH - 6, { align: 'center' });
  }

  doc.save(`FMBN_Batch_Repayment_Report_${formatDate(now).replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF report exported successfully');
}

export function printBatchReport(data: BatchRepaymentReportData) {
  const now = new Date();
  const logoUrl = new URL(fmbnLogo, window.location.origin).href;

  const breakdownTable = (title: string, headers: string[], rows: string[][]) => rows.length === 0 ? '' : `
    <div class="section-title">${title}</div>
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;

  const html = `
    <html>
    <head>
      <title>Batch Loan Repayment Report - FMBN</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; font-size: 11px; color: #222; }
        .header { text-align: center; margin-bottom: 16px; }
        .header img { width: 70px; height: 70px; margin-bottom: 8px; }
        h1 { font-size: 18px; margin: 0; font-weight: bold; }
        h2 { font-size: 14px; margin: 4px 0 16px; font-weight: bold; color: #006040; }
        .meta { margin-bottom: 20px; }
        .meta p { margin: 3px 0; }
        .label { font-weight: bold; }
        .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
        .summary-item { padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
        .summary-item .val { font-size: 16px; font-weight: bold; color: #006040; }
        .summary-item .lbl { font-size: 10px; color: #666; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; }
        th { background: #006040; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
        td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 10px; }
        tr:nth-child(even) { background: #f5f5f5; }
        .section-title { font-size: 13px; font-weight: bold; margin-top: 18px; margin-bottom: 4px; color: #006040; }
        .footer { text-align: center; margin-top: 30px; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
        .negative { color: red; font-weight: bold; }
        @media print { body { margin: 12mm; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="FMBN Logo" /><br/>
        <h1>FEDERAL MORTGAGE BANK OF NIGERIA</h1>
        <h2>BATCH LOAN REPAYMENT REPORT</h2>
      </div>
      <div class="meta">
        <p><span class="label">Date & Time of Report:</span> ${formatDateTime(now)}</p>
        <p><span class="label">Reported By:</span> ${data.staffName}</p>
        <p><span class="label">Filter:</span> ${getFilterSummary(data.filters)}</p>
      </div>

      <div class="summary-grid">
        <div class="summary-item"><div class="lbl">Total Records</div><div class="val">${data.totalRecords.toLocaleString()}</div></div>
        <div class="summary-item"><div class="lbl">Unique Batches</div><div class="val">${data.uniqueBatches.toLocaleString()}</div></div>
        <div class="summary-item"><div class="lbl">Total Collected</div><div class="val">${formatCurrency(data.totalActual)}</div></div>
        <div class="summary-item"><div class="lbl">Variance (Actual − Expected)</div><div class="val${data.variance < 0 ? ' negative' : ''}">${formatCurrency(data.variance)}</div></div>
      </div>

      ${breakdownTable('Breakdown by State', ['State', 'Transactions', 'Amount Collected'],
        data.stateBreakdown.map(s => [s.state || '—', String(s.count), formatCurrency(s.amount)]))}

      ${breakdownTable('Breakdown by Branch', ['Branch', 'Transactions', 'Amount Collected'],
        data.branchBreakdown.map(b => [b.branch || '—', String(b.count), formatCurrency(b.amount)]))}

      ${breakdownTable('Breakdown by Batch', ['Batch Name', 'Transactions', 'Amount Collected'],
        data.batchBreakdown.map(b => [b.name, String(b.count), formatCurrency(b.amount)]))}

      <div class="section-title">Detailed Batch Repayment Records</div>
      <table>
        <thead><tr><th>S/N</th><th>Batch Name</th><th>Batch Code</th><th>State</th><th>Branch</th><th>RRR</th><th>Payment Date</th><th>Month</th><th>Expected</th><th>Actual</th><th>Variance</th><th>Notes</th><th>Status</th></tr></thead>
        <tbody>
          ${data.records.map((r, i) => `<tr>
            <td>${i + 1}</td><td>${r.batchName}</td><td>${r.batchCode}</td>
            <td>${r.state || '—'}</td><td>${r.branch || '—'}</td><td>${r.rrrNumber}</td>
            <td>${r.paymentDate}</td><td>${r.monthFor}</td>
            <td>${formatCurrency(r.expectedAmount)}</td><td>${formatCurrency(r.actualAmount)}</td>
            <td class="${r.variance < 0 ? 'negative' : ''}">${formatCurrency(r.variance)}</td>
            <td>${r.notes || '—'}</td><td>${r.batchStatus}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="footer">Generated: ${formatDateTime(now)}</div>
    </body>
    </html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
  toast.success('Print view opened');
}

interface ExportButtonsProps {
  data: BatchRepaymentReportData;
}

export default function BatchRepaymentReportExportButtons({ data }: ExportButtonsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportBatchReportToPDF(data)}>
        <FileText className="w-4 h-4" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportBatchReportToExcel(data)}>
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => printBatchReport(data)}>
        <Printer className="w-4 h-4" /> Print
      </Button>
    </div>
  );
}

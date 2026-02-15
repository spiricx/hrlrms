import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

interface ReportData {
  totalFacilities: number;
  computedActive: number;
  computedDefaulted: number;
  completedCount: number;
  totalDisbursed: number;
  totalCollected: number;
  totalOutstanding: number;
  recoveryRate: string;
  deptChartData: { department: string; amount: number }[];
  filters: {
    month: string;
    year: string;
    state: string;
    branch: string;
    organisation: string;
  };
  staffName: string;
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
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

function getFilterSummary(filters: ReportData['filters']): string {
  const parts: string[] = [];
  if (filters.month !== 'all') {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    parts.push(MONTHS[Number(filters.month)]);
  }
  if (filters.year !== 'all') parts.push(filters.year);
  if (filters.state !== 'all') parts.push(filters.state);
  if (filters.branch !== 'all') parts.push(filters.branch);
  if (filters.organisation !== 'all') parts.push(filters.organisation);
  return parts.length > 0 ? parts.join(' | ') : 'All Records';
}

export function exportReportsToExcel(data: ReportData) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  const summaryRows = [
    ['FEDERAL MORTGAGE BANK OF NIGERIA'],
    ["Management's Report and Analytics on Home Renovation Loan"],
    [],
    ['Date & Time of Report', formatDateTime(now)],
    ['Reported By', data.staffName],
    ['Filter Applied', getFilterSummary(data.filters)],
    [],
    ['PORTFOLIO SUMMARY'],
    ['Total Loan Facilities', data.totalFacilities],
    ['Active Loans', data.computedActive],
    ['Defaulted Loans', data.computedDefaulted],
    ['Completed Loans', data.completedCount],
    [],
    ['Total Disbursed', data.totalDisbursed],
    ['Total Collected', data.totalCollected],
    ['Outstanding Balance', data.totalOutstanding],
    ['Recovery Rate', data.recoveryRate],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Organisation breakdown
  if (data.deptChartData.length > 0) {
    const deptRows = [['Organisation', 'Loan Amount (₦M)'], ...data.deptChartData.map(d => [d.department, d.amount])];
    const deptWs = XLSX.utils.aoa_to_sheet(deptRows);
    deptWs['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, deptWs, 'By Organisation');
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  saveAs(blob, `FMBN_Management_Report_${formatDate(now).replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel report exported successfully');
}

export async function exportReportsToPDF(data: ReportData) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // Logo
  const logoBase64 = await getLogoBase64();
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', centerX - 10, 8, 20, 20);
  }

  let y = logoBase64 ? 32 : 14;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FEDERAL MORTGAGE BANK OF NIGERIA', centerX, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.text("Management's Report and Analytics on Home Renovation Loan", centerX, y, { align: 'center' });
  y += 10;

  // Date & Staff
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date & Time of Report: ${formatDateTime(now)}`, 14, y);
  y += 6;
  doc.text(`Reported By: ${data.staffName}`, 14, y);
  y += 6;
  doc.text(`Filter: ${getFilterSummary(data.filters)}`, 14, y);
  y += 10;

  // Loan Status Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Loan Status Distribution', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Loan Facilities', String(data.totalFacilities)],
      ['Active Loans', String(data.computedActive)],
      ['Defaulted Loans', String(data.computedDefaulted)],
      ['Completed Loans', String(data.completedCount)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Portfolio Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Portfolio Summary', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Disbursed', formatCurrency(data.totalDisbursed)],
      ['Total Collected', formatCurrency(data.totalCollected)],
      ['Outstanding Balance', formatCurrency(data.totalOutstanding)],
      ['Recovery Rate', data.recoveryRate],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Organisation breakdown
  if (data.deptChartData.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Loans by Organisation (₦M)', 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Organisation', 'Amount (₦M)']],
      body: data.deptChartData.map(d => [d.department, `₦${d.amount}M`]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generated: ${formatDateTime(now)} | Page ${i} of ${pageCount}`, centerX, 290, { align: 'center' });
  }

  doc.save(`FMBN_Management_Report_${formatDate(now).replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF report exported successfully');
}

export function printReports(data: ReportData) {
  const now = new Date();
  const logoUrl = new URL(fmbnLogo, window.location.origin).href;

  const html = `
    <html>
    <head>
      <title>Management Report - FMBN</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; font-size: 12px; color: #222; }
        .header { text-align: center; margin-bottom: 16px; }
        .header img { width: 70px; height: 70px; margin-bottom: 8px; }
        h1 { font-size: 18px; margin: 0; font-weight: bold; }
        h2 { font-size: 14px; margin: 4px 0 16px; font-weight: bold; color: #006040; }
        .meta { margin-bottom: 20px; }
        .meta p { margin: 3px 0; }
        .label { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
        th { background: #006040; color: white; padding: 8px; text-align: left; font-size: 11px; }
        td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
        tr:nth-child(even) { background: #f5f5f5; }
        .section-title { font-size: 14px; font-weight: bold; margin-top: 20px; margin-bottom: 4px; }
        .footer { text-align: center; margin-top: 30px; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
        @media print { body { margin: 15mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="FMBN Logo" /><br/>
        <h1>FEDERAL MORTGAGE BANK OF NIGERIA</h1>
        <h2>Management's Report and Analytics on Home Renovation Loan</h2>
      </div>
      <div class="meta">
        <p><span class="label">Date & Time of Report:</span> ${formatDateTime(now)}</p>
        <p><span class="label">Reported By:</span> ${data.staffName}</p>
        <p><span class="label">Filter:</span> ${getFilterSummary(data.filters)}</p>
      </div>

      <div class="section-title">Loan Status Distribution</div>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Total Loan Facilities</td><td>${data.totalFacilities}</td></tr>
          <tr><td>Active Loans</td><td>${data.computedActive}</td></tr>
          <tr><td>Defaulted Loans</td><td>${data.computedDefaulted}</td></tr>
          <tr><td>Completed Loans</td><td>${data.completedCount}</td></tr>
        </tbody>
      </table>

      <div class="section-title">Portfolio Summary</div>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Total Disbursed</td><td>${formatCurrency(data.totalDisbursed)}</td></tr>
          <tr><td>Total Collected</td><td>${formatCurrency(data.totalCollected)}</td></tr>
          <tr><td>Outstanding Balance</td><td>${formatCurrency(data.totalOutstanding)}</td></tr>
          <tr><td>Recovery Rate</td><td>${data.recoveryRate}</td></tr>
        </tbody>
      </table>

      ${data.deptChartData.length > 0 ? `
        <div class="section-title">Loans by Organisation (₦M)</div>
        <table>
          <thead><tr><th>Organisation</th><th>Amount (₦M)</th></tr></thead>
          <tbody>
            ${data.deptChartData.map(d => `<tr><td>${d.department}</td><td>₦${d.amount}M</td></tr>`).join('')}
          </tbody>
        </table>
      ` : ''}

      <div class="footer">Generated: ${formatDateTime(now)}</div>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
  toast.success('Print view opened');
}

interface ReportsExportButtonsProps {
  data: ReportData;
}

export default function ReportsExportButtons({ data }: ReportsExportButtonsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportReportsToPDF(data)}>
        <FileText className="w-4 h-4" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportReportsToExcel(data)}>
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => printReports(data)}>
        <Printer className="w-4 h-4" /> Print
      </Button>
    </div>
  );
}

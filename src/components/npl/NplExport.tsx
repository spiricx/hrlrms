import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

interface StateRow {
  state: string;
  totalLoans: number;
  activeAmount: number;
  nplAmount: number;
  nplCount: number;
  par30: number;
  par90: number;
}

interface NplAccount {
  id: string;
  name: string;
  employeeId: string;
  state: string;
  branch: string;
  organization: string;
  loanAmount: number;
  tenorMonths: number;
  monthlyEmi: number;
  totalPaid: number;
  outstandingBalance: number;
  dpd: number;
  lastPaymentDate: string | null;
  amountInArrears: number;
  monthsInArrears: number;
}

export interface NplReportData {
  totalActiveAmount: number;
  totalNplAmount: number;
  nplRatio: number;
  nplCount: number;
  par30Amount: number;
  par90Amount: number;
  stateData: StateRow[];
  accountsList: NplAccount[];
  staffName: string;
  filters: {
    state: string;
    dateFrom?: string;
    dateTo?: string;
    par: string;
  };
}

const REPORT_TITLE = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const REPORT_SUBTITLE = "Report on NPL Status of Home Renovation Loan";

const DETAIL_HEADERS = [
  'S/N', 'Beneficiary Names', 'Organizations', 'Branch/State', 'No. of Beneficiaries',
  'Total Disbursed (₦)', 'Loan Tenor', 'Expected Monthly Repayment (₦)', 'Actual Amount Paid (₦)',
  'Closing Balance (₦)', 'Months in Arrears', 'DPD', 'Arrears in Amount (₦)',
  'Last Payment Date', 'Total Repayment Made so Far (₦)', 'NPL Ratio'
];

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
  } catch {
    return '';
  }
}

function getFilterSummary(filters: NplReportData['filters']): string {
  const parts: string[] = [];
  if (filters.dateFrom) parts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`To: ${filters.dateTo}`);
  if (filters.state !== 'all') parts.push(filters.state);
  if (filters.par !== 'par90') parts.push(filters.par.toUpperCase().replace('PAR', 'PAR '));
  return parts.length > 0 ? parts.join(' | ') : 'All Records';
}

function buildAccountRow(a: NplAccount, idx: number, totalActiveAmount: number): (string | number)[] {
  const individualNplRatio = totalActiveAmount > 0 ? ((a.outstandingBalance / totalActiveAmount) * 100) : 0;
  return [
    idx + 1,
    a.name,
    a.organization || '—',
    `${a.branch} / ${a.state}`,
    1,
    a.loanAmount,
    `${a.tenorMonths} months`,
    a.monthlyEmi,
    a.totalPaid,
    a.outstandingBalance,
    a.monthsInArrears,
    a.amountInArrears,
    a.dpd,
    formatLastPayment(a.lastPaymentDate),
    a.totalPaid,
    `${individualNplRatio.toFixed(2)}%`,
  ];
}

export function exportNplToExcel(data: NplReportData) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  // Summary sheet
  const summaryRows = [
    [REPORT_TITLE],
    [REPORT_SUBTITLE],
    [],
    ['Date & Time of Report', formatDateTime(now)],
    ['Reported By', data.staffName],
    ['Filter Applied', getFilterSummary(data.filters)],
    [],
    ['NPL PORTFOLIO SUMMARY'],
    ['Total Active Portfolio', data.totalActiveAmount],
    ['Total NPL Amount', data.totalNplAmount],
    ['NPL Ratio', `${data.nplRatio.toFixed(1)}%`],
    ['NPL Accounts', data.nplCount],
    ['PAR 30+ Amount', data.par30Amount],
    ['PAR 90+ Amount', data.par90Amount],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // By State sheet
  if (data.stateData.length > 0) {
    const stateRows = [
      ['State', 'Active Loans', 'Active Amount (₦)', 'NPL Amount (₦)', 'NPL Count', 'NPL Ratio (%)', 'PAR 30+ (₦)', 'PAR 90+ (₦)'],
      ...data.stateData.map(r => {
        const ratio = r.activeAmount > 0 ? ((r.nplAmount / r.activeAmount) * 100).toFixed(1) + '%' : '0.0%';
        return [r.state, r.totalLoans, r.activeAmount, r.nplAmount, r.nplCount, ratio, r.par30, r.par90];
      }),
    ];
    const wsState = XLSX.utils.aoa_to_sheet(stateRows);
    wsState['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsState, 'By State');
  }

  // Detailed Accounts sheet
  if (data.accountsList.length > 0) {
    const detailRows = [
      DETAIL_HEADERS,
      ...data.accountsList.map((a, idx) => buildAccountRow(a, idx, data.totalActiveAmount)),
    ];
    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!cols'] = DETAIL_HEADERS.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, wsDetail, 'NPL Accounts');
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  saveAs(blob, `FMBN_NPL_Report_${formatDate(now).replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel NPL report exported successfully');
}

export async function exportNplToPDF(data: NplReportData) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const logoBase64 = await getLogoBase64();
  if (logoBase64) doc.addImage(logoBase64, 'PNG', centerX - 10, 8, 20, 20);

  let y = logoBase64 ? 32 : 14;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(REPORT_TITLE, centerX, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.text(REPORT_SUBTITLE, centerX, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date & Time of Report: ${formatDateTime(now)}`, 14, y);
  y += 6;
  doc.text(`Reported By: ${data.staffName}`, 14, y);
  y += 6;
  doc.text(`Filter: ${getFilterSummary(data.filters)}`, 14, y);
  y += 10;

  // NPL Summary table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('NPL Portfolio Summary', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Active Portfolio', formatCurrency(data.totalActiveAmount)],
      ['Total NPL Amount', formatCurrency(data.totalNplAmount)],
      ['NPL Ratio', `${data.nplRatio.toFixed(1)}%`],
      ['NPL Accounts', String(data.nplCount)],
      ['PAR 30+ Amount', formatCurrency(data.par30Amount)],
      ['PAR 90+ Amount', formatCurrency(data.par90Amount)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // State breakdown
  if (data.stateData.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('NPL by State', 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['State', 'Active Loans', 'Active Amount', 'NPL Amount', 'NPL Count', 'NPL Ratio', 'PAR 30+', 'PAR 90+']],
      body: data.stateData.map(r => {
        const ratio = r.activeAmount > 0 ? ((r.nplAmount / r.activeAmount) * 100).toFixed(1) + '%' : '0.0%';
        return [r.state, String(r.totalLoans), formatCurrency(r.activeAmount), formatCurrency(r.nplAmount), String(r.nplCount), ratio, formatCurrency(r.par30), formatCurrency(r.par90)];
      }),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Detailed accounts (new page)
  if (data.accountsList.length > 0) {
    doc.addPage();

    // Add logo and title on detail page too
    if (logoBase64) doc.addImage(logoBase64, 'PNG', centerX - 10, 8, 20, 20);
    let dy = logoBase64 ? 32 : 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(REPORT_TITLE, centerX, dy, { align: 'center' });
    dy += 7;
    doc.setFontSize(11);
    doc.text(REPORT_SUBTITLE, centerX, dy, { align: 'center' });
    dy += 8;
    doc.setFontSize(12);
    doc.text('NPL Accounts', 14, dy);
    dy += 2;

    autoTable(doc, {
      startY: dy,
      head: [DETAIL_HEADERS],
      body: data.accountsList.map((a, idx) => {
        const row = buildAccountRow(a, idx, data.totalActiveAmount);
        // Format currency columns for PDF
        return [
          row[0], row[1], row[2], row[3], row[4],
          formatCurrency(row[5] as number), row[6], formatCurrency(row[7] as number),
          formatCurrency(row[8] as number), formatCurrency(row[9] as number),
          row[10], formatCurrency(row[11] as number), row[12],
          row[13], formatCurrency(row[14] as number), row[15],
        ];
      }),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold', fontSize: 7 },
      margin: { left: 6, right: 6 },
    });
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(`Generated: ${formatDateTime(now)} | Page ${i} of ${pageCount}`, centerX, pageH - 8, { align: 'center' });
  }

  doc.save(`FMBN_NPL_Report_${formatDate(now).replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF NPL report exported successfully');
}

export function printNplReport(data: NplReportData) {
  const now = new Date();
  const logoUrl = new URL(fmbnLogo, window.location.origin).href;

  const accountRows = data.accountsList.map((a, idx) => {
    const individualNplRatio = data.totalActiveAmount > 0 ? ((a.outstandingBalance / data.totalActiveAmount) * 100) : 0;
    return `<tr>
      <td class="center">${idx + 1}</td>
      <td>${a.name}</td>
      <td>${a.organization || '—'}</td>
      <td>${a.branch} / ${a.state}</td>
      <td class="right">1</td>
      <td class="right">${formatCurrency(a.loanAmount)}</td>
      <td class="right">${a.tenorMonths} months</td>
      <td class="right">${formatCurrency(a.monthlyEmi)}</td>
      <td class="right">${formatCurrency(a.totalPaid)}</td>
      <td class="right">${formatCurrency(a.outstandingBalance)}</td>
      <td class="right">${a.monthsInArrears}</td>
      <td class="right npl-red">${formatCurrency(a.amountInArrears)}</td>
      <td class="right ${a.dpd >= 90 ? 'npl-red' : ''}">${a.dpd}</td>
      <td>${formatLastPayment(a.lastPaymentDate)}</td>
      <td class="right">${formatCurrency(a.totalPaid)}</td>
      <td class="right">${individualNplRatio.toFixed(2)}%</td>
    </tr>`;
  }).join('');

  const html = `
    <html>
    <head>
      <title>NPL Status Report - FMBN</title>
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
        th { background: #006040; color: white; padding: 8px; text-align: left; font-size: 10px; }
        td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10px; }
        tr:nth-child(even) { background: #f5f5f5; }
        .section-title { font-size: 14px; font-weight: bold; margin-top: 20px; margin-bottom: 4px; }
        .footer { text-align: center; margin-top: 30px; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
        .npl-red { color: #cc0000; font-weight: bold; }
        .right { text-align: right; }
        .center { text-align: center; }
        @media print { body { margin: 10mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="FMBN Logo" /><br/>
        <h1>${REPORT_TITLE}</h1>
        <h2>${REPORT_SUBTITLE}</h2>
      </div>
      <div class="meta">
        <p><span class="label">Date & Time of Report:</span> ${formatDateTime(now)}</p>
        <p><span class="label">Reported By:</span> ${data.staffName}</p>
        <p><span class="label">Filter:</span> ${getFilterSummary(data.filters)}</p>
      </div>

      <div class="section-title">NPL Portfolio Summary</div>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Total Active Portfolio</td><td>${formatCurrency(data.totalActiveAmount)}</td></tr>
          <tr><td>Total NPL Amount</td><td class="npl-red">${formatCurrency(data.totalNplAmount)}</td></tr>
          <tr><td>NPL Ratio</td><td class="npl-red">${data.nplRatio.toFixed(1)}%</td></tr>
          <tr><td>NPL Accounts</td><td>${data.nplCount}</td></tr>
          <tr><td>PAR 30+ Amount</td><td>${formatCurrency(data.par30Amount)}</td></tr>
          <tr><td>PAR 90+ Amount</td><td>${formatCurrency(data.par90Amount)}</td></tr>
        </tbody>
      </table>

      ${data.stateData.length > 0 ? `
        <div class="section-title">NPL by State</div>
        <table>
          <thead><tr><th>State</th><th>Active Loans</th><th>Active Amount</th><th>NPL Amount</th><th>NPL Count</th><th>NPL Ratio</th><th>PAR 30+</th><th>PAR 90+</th></tr></thead>
          <tbody>
            ${data.stateData.map(r => {
              const ratio = r.activeAmount > 0 ? ((r.nplAmount / r.activeAmount) * 100).toFixed(1) : '0.0';
              return `<tr><td>${r.state}</td><td>${r.totalLoans}</td><td>${formatCurrency(r.activeAmount)}</td><td class="npl-red">${formatCurrency(r.nplAmount)}</td><td>${r.nplCount}</td><td>${ratio}%</td><td>${formatCurrency(r.par30)}</td><td>${formatCurrency(r.par90)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : ''}

      ${data.accountsList.length > 0 ? `
        <div class="section-title">NPL Accounts</div>
        <table>
          <thead><tr>${DETAIL_HEADERS.map(h => `<th>${h.replace(/ \(₦\)/g, '')}</th>`).join('')}</tr></thead>
          <tbody>${accountRows}</tbody>
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

interface NplExportButtonsProps {
  data: NplReportData;
}

export default function NplExportButtons({ data }: NplExportButtonsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportNplToPDF(data)}>
        <FileText className="w-4 h-4" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportNplToExcel(data)}>
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => printNplReport(data)}>
        <Printer className="w-4 h-4" /> Print
      </Button>
    </div>
  );
}

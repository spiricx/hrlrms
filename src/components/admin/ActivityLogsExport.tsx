import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';
import { format } from 'date-fns';
import { NG_DATETIME } from '@/lib/dateFormat';

interface ActivityLog {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  action: string;
  state: string;
  bank_branch: string;
  user_agent: string;
  created_at: string;
}

interface ExportData {
  logs: ActivityLog[];
  staffName: string;
  totalLogins: number;
  totalLogouts: number;
  activeToday: number;
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function getBrowserInfo(ua: string) {
  if (!ua) return '—';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  return 'Other';
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

export function exportActivityLogsToExcel(data: ExportData) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  const summaryRows = [
    ['FEDERAL MORTGAGE BANK OF NIGERIA'],
    ['Activity Report Log'],
    [],
    ['Date & Time of Report', formatDateTime(now)],
    ['Reported By', data.staffName],
    [],
    ['SUMMARY'],
    ['Active Today', data.activeToday],
    ['Total Logins (Recent)', data.totalLogins],
    ['Total Logouts (Recent)', data.totalLogouts],
    ['Total Log Entries', data.logs.length],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const detailRows = [
    ['Date & Time', 'Action', 'Staff Name', 'Email', 'State', 'Branch', 'Browser'],
    ...data.logs.map(log => [
      format(new Date(log.created_at), NG_DATETIME),
      log.action.toUpperCase(),
      log.full_name || '—',
      log.email,
      log.state || '—',
      log.bank_branch || '—',
      getBrowserInfo(log.user_agent),
    ]),
  ];
  const detailWs = XLSX.utils.aoa_to_sheet(detailRows);
  detailWs['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, detailWs, 'Activity Logs');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  saveAs(blob, `FMBN_Activity_Report_${formatDate(now).replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel report exported successfully');
}

export async function exportActivityLogsToPDF(data: ExportData) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const logoBase64 = await getLogoBase64();
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', centerX - 10, 8, 20, 20);
  }

  let y = logoBase64 ? 32 : 14;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FEDERAL MORTGAGE BANK OF NIGERIA', centerX, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.text('Activity Report Log', centerX, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date & Time of Report: ${formatDateTime(now)}`, 14, y);
  y += 6;
  doc.text(`Reported By: ${data.staffName}`, 14, y);
  y += 10;

  // Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Summary', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Active Today', String(data.activeToday)],
      ['Total Logins (Recent)', String(data.totalLogins)],
      ['Total Logouts (Recent)', String(data.totalLogouts)],
      ['Total Log Entries', String(data.logs.length)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Detail table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Activity Log Details', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Date & Time', 'Action', 'Staff Name', 'Email', 'State', 'Branch', 'Browser']],
    body: data.logs.map(log => [
      format(new Date(log.created_at), NG_DATETIME),
      log.action.toUpperCase(),
      log.full_name || '—',
      log.email,
      log.state || '—',
      log.bank_branch || '—',
      getBrowserInfo(log.user_agent),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 100, 60], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(`Generated: ${formatDateTime(now)} | Page ${i} of ${pageCount}`, centerX, pageHeight - 10, { align: 'center' });
  }

  doc.save(`FMBN_Activity_Report_${formatDate(now).replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF report exported successfully');
}

export function printActivityLogs(data: ExportData) {
  const now = new Date();
  const logoUrl = new URL(fmbnLogo, window.location.origin).href;

  const html = `
    <html>
    <head>
      <title>Activity Report Log - FMBN</title>
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
        .login { color: #16a34a; font-weight: bold; }
        .logout { color: #dc2626; font-weight: bold; }
        @media print { body { margin: 15mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="FMBN Logo" /><br/>
        <h1>FEDERAL MORTGAGE BANK OF NIGERIA</h1>
        <h2>Activity Report Log</h2>
      </div>
      <div class="meta">
        <p><span class="label">Date & Time of Report:</span> ${formatDateTime(now)}</p>
        <p><span class="label">Reported By:</span> ${data.staffName}</p>
      </div>

      <div class="section-title">Summary</div>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Active Today</td><td>${data.activeToday}</td></tr>
          <tr><td>Total Logins (Recent)</td><td>${data.totalLogins}</td></tr>
          <tr><td>Total Logouts (Recent)</td><td>${data.totalLogouts}</td></tr>
          <tr><td>Total Log Entries</td><td>${data.logs.length}</td></tr>
        </tbody>
      </table>

      <div class="section-title">Activity Log Details</div>
      <table>
        <thead><tr><th>Date & Time</th><th>Action</th><th>Staff Name</th><th>Email</th><th>State</th><th>Branch</th><th>Browser</th></tr></thead>
        <tbody>
          ${data.logs.map(log => `
            <tr>
              <td>${format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss')}</td>
              <td class="${log.action === 'login' ? 'login' : 'logout'}">${log.action.toUpperCase()}</td>
              <td>${log.full_name || '—'}</td>
              <td>${log.email}</td>
              <td>${log.state || '—'}</td>
              <td>${log.bank_branch || '—'}</td>
              <td>${getBrowserInfo(log.user_agent)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

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

interface ActivityLogsExportButtonsProps {
  data: ExportData;
}

export default function ActivityLogsExportButtons({ data }: ActivityLogsExportButtonsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportActivityLogsToPDF(data)}>
        <FileText className="w-4 h-4" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => exportActivityLogsToExcel(data)}>
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => printActivityLogs(data)}>
        <Printer className="w-4 h-4" /> Print
      </Button>
    </div>
  );
}

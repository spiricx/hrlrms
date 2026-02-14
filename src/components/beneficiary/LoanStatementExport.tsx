import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatTenor } from '@/lib/loanCalculations';
import type { ScheduleEntry } from '@/lib/loanCalculations';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

interface CreatorProfile {
  full_name: string;
  state: string;
  bank_branch: string;
}

interface LoanStatementExportProps {
  beneficiary: Beneficiary;
  schedule: ScheduleEntry[];
  transactions: Transaction[];
  totalExpected: number;
  monthlyEMI: number;
  totalInterest: number;
  commencementDate: Date;
  terminationDate: Date;
  creatorProfile?: CreatorProfile | null;
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function buildStatementData(
  beneficiary: Beneficiary,
  schedule: ScheduleEntry[],
  transactions: Transaction[]
) {
  const txnsByMonth = new Map<number, Transaction[]>();
  transactions.forEach((t) => {
    const arr = txnsByMonth.get(t.month_for) || [];
    arr.push(t);
    txnsByMonth.set(t.month_for, arr);
  });

  return schedule.map((entry) => {
    const monthTxns = txnsByMonth.get(entry.month) || [];
    const paidAmount = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
    const latestTxn = monthTxns.length > 0 ? monthTxns[monthTxns.length - 1] : null;

    return {
      month: entry.month,
      dueDate: formatDate(entry.dueDate),
      openingBalance: entry.openingBalance,
      expectedEMI: entry.emi,
      principal: entry.principal,
      interest: entry.interest,
      amountPaid: paidAmount,
      closingBalance: entry.closingBalance,
      paymentDate: latestTxn ? formatDate(new Date(latestTxn.date_paid)) : '—',
      rrr: latestTxn?.rrr_number || '—',
      status: paidAmount >= entry.emi ? 'Paid' : paidAmount > 0 ? 'Partial' : entry.dueDate < new Date() ? 'Overdue' : 'Upcoming',
    };
  });
}

function getCreatorLine(cp?: CreatorProfile | null): string {
  if (!cp) return '—';
  return `${cp.full_name || 'Unknown'} — ${cp.state || '—'}, ${cp.bank_branch || '—'}`;
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

export function exportToExcel(
  beneficiary: Beneficiary,
  schedule: ScheduleEntry[],
  transactions: Transaction[],
  props: Pick<LoanStatementExportProps, 'totalExpected' | 'monthlyEMI' | 'totalInterest' | 'commencementDate' | 'terminationDate' | 'creatorProfile'>
) {
  const wb = XLSX.utils.book_new();
  const data = buildStatementData(beneficiary, schedule, transactions);
  const now = new Date();

  const summaryData = [
    ['HOME RENOVATION LOAN STATEMENT OF ACCOUNT'],
    ['FEDERAL MORTGAGE BANK OF NIGERIA'],
    [],
    ['Beneficiary Name', beneficiary.name],
    ['Loan Reference Number', beneficiary.employee_id],
    ['NHF Number', beneficiary.nhf_number || 'Not Set'],
    ['Organization', beneficiary.department],
    ['State', beneficiary.state || '—'],
    ['Branch', beneficiary.bank_branch || '—'],
    [],
    ['Loan Amount', Number(beneficiary.loan_amount)],
    ['Interest Rate', `${beneficiary.interest_rate}% Annuity`],
    ['Tenor', formatTenor(beneficiary.tenor_months)],
    ['Monthly Repayment', props.monthlyEMI],
    ['Total Interest', props.totalInterest],
    ['Total Expected Payment', props.totalExpected],
    ['Total Paid', Number(beneficiary.total_paid)],
    ['Outstanding Balance', Number(beneficiary.outstanding_balance)],
    [],
    ['Commencement Date', formatDate(props.commencementDate)],
    ['Termination Date', formatDate(props.terminationDate)],
    ['Status', beneficiary.status],
    [],
    ['Loan Created By', getCreatorLine(props.creatorProfile)],
    ['Originating State', props.creatorProfile?.state || beneficiary.state || '—'],
    ['Originating Branch', props.creatorProfile?.bank_branch || beneficiary.bank_branch || '—'],
    ['Loan Creation Date', formatDate(new Date(beneficiary.created_at))],
    ['Date & Time Printed', formatDateTime(now)],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs['!cols'] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const scheduleHeader = ['Month', 'Due Date', 'Opening Bal.', 'Principal', 'Interest', 'EMI', 'Amount Paid', 'Closing Bal.', 'Payment Date', 'RRR', 'Status'];
  const scheduleRows = data.map((r) => [
    r.month, r.dueDate, r.openingBalance, r.principal, r.interest, r.expectedEMI, r.amountPaid, r.closingBalance, r.paymentDate, r.rrr, r.status,
  ]);
  const scheduleWs = XLSX.utils.aoa_to_sheet([scheduleHeader, ...scheduleRows]);
  scheduleWs['!cols'] = scheduleHeader.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, scheduleWs, 'Statement');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  saveAs(blob, `Loan_Statement_${beneficiary.employee_id}_${beneficiary.name.replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel statement exported successfully');
}

export async function exportToPDF(
  beneficiary: Beneficiary,
  schedule: ScheduleEntry[],
  transactions: Transaction[],
  props: Pick<LoanStatementExportProps, 'totalExpected' | 'monthlyEMI' | 'totalInterest' | 'commencementDate' | 'terminationDate' | 'creatorProfile'>
) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const data = buildStatementData(beneficiary, schedule, transactions);
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // Logo centered at top
  const logoBase64 = await getLogoBase64();
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', centerX - 8, 4, 16, 16);
  }

  // Bold Title
  const titleY = logoBase64 ? 24 : 14;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('HOME RENOVATION LOAN STATEMENT OF ACCOUNT', centerX, titleY, { align: 'center' });
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('FEDERAL MORTGAGE BANK OF NIGERIA', centerX, titleY + 7, { align: 'center' });

  // Left column info
  const infoY = titleY + 15;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Beneficiary: ${beneficiary.name}`, 14, infoY);
  doc.text(`Loan Ref: ${beneficiary.employee_id}`, 14, infoY + 5);
  doc.text(`NHF Number: ${beneficiary.nhf_number || 'Not Set'}`, 14, infoY + 10);
  doc.text(`Total Paid: ${formatCurrency(Number(beneficiary.total_paid))}`, 14, infoY + 15);

  // Right column info
  doc.setFont('helvetica', 'normal');
  doc.text(`Organization: ${beneficiary.department}`, 150, infoY);
  doc.text(`Loan Amount: ${formatCurrency(Number(beneficiary.loan_amount))}`, 150, infoY + 5);
  doc.text(`Monthly Repayment: ${formatCurrency(props.monthlyEMI)}`, 150, infoY + 10);
  doc.text(`Outstanding: ${formatCurrency(Number(beneficiary.outstanding_balance))}`, 150, infoY + 15);

  // Creator / Origin info line
  const originY = infoY + 22;
  doc.setFont('helvetica', 'bold');
  doc.text(`Loan Created By: ${getCreatorLine(props.creatorProfile)}`, 14, originY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Loan Creation Date: ${formatDate(new Date(beneficiary.created_at))}`, 14, originY + 5);
  doc.text(`Originating State & Branch: ${props.creatorProfile?.state || beneficiary.state || '—'}, ${props.creatorProfile?.bank_branch || beneficiary.bank_branch || '—'}`, 150, originY);
  doc.text(`Date & Time Printed: ${formatDateTime(now)}`, 150, originY + 5);

  // Table
  autoTable(doc, {
    startY: originY + 10,
    head: [['#', 'Due Date', 'Opening', 'Principal', 'Interest', 'EMI', 'Paid', 'Closing', 'Pay Date', 'RRR', 'Status']],
    body: data.map((r) => [
      r.month,
      r.dueDate,
      formatCurrency(r.openingBalance),
      formatCurrency(r.principal),
      formatCurrency(r.interest),
      formatCurrency(r.expectedEMI),
      r.amountPaid > 0 ? formatCurrency(r.amountPaid) : '—',
      formatCurrency(r.closingBalance),
      r.paymentDate,
      r.rrr,
      r.status,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [0, 100, 60], fontSize: 7, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 10, right: 10 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generated: ${formatDateTime(now)} | Page ${i} of ${pageCount}`, centerX, 200, { align: 'center' });
  }

  doc.save(`Loan_Statement_${beneficiary.employee_id}_${beneficiary.name.replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF statement exported successfully');
}

export function printStatement(
  beneficiary: Beneficiary,
  schedule: ScheduleEntry[],
  transactions: Transaction[],
  props: Pick<LoanStatementExportProps, 'totalExpected' | 'monthlyEMI' | 'totalInterest' | 'commencementDate' | 'terminationDate' | 'creatorProfile'>
) {
  const data = buildStatementData(beneficiary, schedule, transactions);
  const creatorLine = getCreatorLine(props.creatorProfile);
  const originState = props.creatorProfile?.state || beneficiary.state || '—';
  const originBranch = props.creatorProfile?.bank_branch || beneficiary.bank_branch || '—';
  const now = new Date();
  const dateTimePrinted = formatDateTime(now);

  // Resolve logo URL for print
  const logoUrl = new URL(fmbnLogo, window.location.origin).href;

  const html = `
    <html>
    <head>
      <title>Loan Statement - ${beneficiary.name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; font-size: 11px; }
        .header { text-align: center; margin-bottom: 12px; }
        .header img { width: 60px; height: 60px; margin-bottom: 6px; }
        h1 { font-size: 20px; text-align: center; margin-bottom: 4px; font-weight: bold; }
        h2 { font-size: 14px; text-align: center; font-weight: bold; color: #006040; margin-top: 0; margin-bottom: 12px; }
        .info { display: flex; justify-content: space-between; margin: 16px 0; }
        .info-col { }
        .info-row { margin: 3px 0; }
        .label { font-weight: bold; }
        .origin-section { border-top: 1px solid #ccc; padding-top: 8px; margin: 12px 0; display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #006040; color: white; padding: 6px 4px; text-align: left; font-size: 10px; }
        td { padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px; }
        tr:nth-child(even) { background: #f9f9f9; }
        .text-right { text-align: right; }
        .overdue { color: #dc2626; font-weight: bold; }
        .paid { color: #16a34a; }
        .footer { text-align: center; margin-top: 20px; font-size: 9px; color: #999; }
        @media print { body { margin: 10mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="FMBN Logo" />
      </div>
      <h1>HOME RENOVATION LOAN STATEMENT OF ACCOUNT</h1>
      <h2>FEDERAL MORTGAGE BANK OF NIGERIA</h2>
      <div class="info">
        <div class="info-col">
          <div class="info-row"><span class="label">Beneficiary:</span> ${beneficiary.name}</div>
          <div class="info-row"><span class="label">Loan Reference:</span> ${beneficiary.employee_id}</div>
          <div class="info-row"><span class="label">NHF Number:</span> ${beneficiary.nhf_number || 'Not Set'}</div>
          <div class="info-row"><span class="label">Organization:</span> ${beneficiary.department}</div>
        </div>
        <div class="info-col">
          <div class="info-row"><span class="label">Loan Amount:</span> ${formatCurrency(Number(beneficiary.loan_amount))}</div>
          <div class="info-row"><span class="label">Monthly Repayment:</span> ${formatCurrency(props.monthlyEMI)}</div>
          <div class="info-row"><span class="label">Total Paid:</span> ${formatCurrency(Number(beneficiary.total_paid))}</div>
          <div class="info-row"><span class="label">Outstanding:</span> ${formatCurrency(Number(beneficiary.outstanding_balance))}</div>
        </div>
      </div>
      <div class="origin-section">
        <div class="info-col">
          <div class="info-row"><span class="label">Loan Created By:</span> ${creatorLine}</div>
          <div class="info-row"><span class="label">Loan Creation Date:</span> ${formatDate(new Date(beneficiary.created_at))}</div>
        </div>
        <div class="info-col">
          <div class="info-row"><span class="label">Originating State & Branch:</span> ${originState}, ${originBranch}</div>
          <div class="info-row"><span class="label">Date & Time Printed:</span> ${dateTimePrinted}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Due Date</th><th class="text-right">Opening</th><th class="text-right">Principal</th>
            <th class="text-right">Interest</th><th class="text-right">EMI</th><th class="text-right">Paid</th>
            <th class="text-right">Closing</th><th>Pay Date</th><th>RRR</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((r) => `
            <tr>
              <td>${r.month}</td>
              <td>${r.dueDate}</td>
              <td class="text-right">${formatCurrency(r.openingBalance)}</td>
              <td class="text-right">${formatCurrency(r.principal)}</td>
              <td class="text-right">${formatCurrency(r.interest)}</td>
              <td class="text-right">${formatCurrency(r.expectedEMI)}</td>
              <td class="text-right ${r.status === 'Paid' ? 'paid' : r.status === 'Overdue' ? 'overdue' : ''}">${r.amountPaid > 0 ? formatCurrency(r.amountPaid) : '—'}</td>
              <td class="text-right">${formatCurrency(r.closingBalance)}</td>
              <td>${r.paymentDate}</td>
              <td>${r.rrr}</td>
              <td class="${r.status === 'Overdue' ? 'overdue' : r.status === 'Paid' ? 'paid' : ''}">${r.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="footer">Generated: ${dateTimePrinted}</div>
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

interface ExportButtonsProps extends LoanStatementExportProps {}

export default function LoanStatementExportButtons({
  beneficiary,
  schedule,
  transactions,
  totalExpected,
  monthlyEMI,
  totalInterest,
  commencementDate,
  terminationDate,
  creatorProfile,
}: ExportButtonsProps) {
  const exportProps = { totalExpected, monthlyEMI, totalInterest, commencementDate, terminationDate, creatorProfile };

  return (
    <div className="bg-card rounded-xl shadow-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold">Loan Statement of Account</h3>
          <p className="text-xs text-muted-foreground">Download or print the complete loan statement</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exportToPDF(beneficiary, schedule, transactions, exportProps)}
          >
            <FileText className="w-4 h-4" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exportToExcel(beneficiary, schedule, transactions, exportProps)}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => printStatement(beneficiary, schedule, transactions, exportProps)}
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}

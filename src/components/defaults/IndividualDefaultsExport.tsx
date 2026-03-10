import { FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import fmbnLogo from '@/assets/fmbn_logo.png';

export interface IndividualDefaultRecord {
  name: string;
  organization: string;
  loanRefNo: string;
  nhfNo: string;
  state: string;
  branch: string;
  tenor: number;
  loanAmount: number;
  monthlyRepayment: number;
  outstanding: number;
  totalPaid: number;
  lastPmtAmt: number;
  lastPmtDate: string | null;
  ageOfArrears: number;
  monthsInArrears: number;
  amtInArrears: number;
  status: string;
}

interface Props {
  records: IndividualDefaultRecord[];
  staffName: string;
  filters: { state: string; branch: string };
}

const REPORT_TITLE = 'FEDERAL MORTGAGE BANK OF NIGERIA';
const REPORT_SUBTITLE = 'Report on Individual Loan Defaults';
const HEADERS = [
  'S/N', 'Beneficiary', 'Organization', 'Loan Ref No', 'NHF No', 'State', 'Branch',
  'Tenor', 'Loan Amount (₦)', 'Monthly Repayment (₦)', 'Outstanding (₦)', 'Total Paid (₦)',
  'Last Pmt Amt (₦)', 'Last Pmt Date', 'Age of Arrears (Days)', 'Mths Arrears', 'Amt in Arrears (₦)', 'Status',
];

function formatDateTime(d: Date): string {
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function formatLastPmt(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return formatDate(new Date(dateStr));
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

function toRow(r: IndividualDefaultRecord, i: number): (string | number)[] {
  return [
    i + 1, r.name, r.organization, r.loanRefNo, r.nhfNo, r.state, r.branch,
    r.tenor, r.loanAmount, r.monthlyRepayment, r.outstanding, r.totalPaid,
    r.lastPmtAmt, formatLastPmt(r.lastPmtDate), r.ageOfArrears, r.monthsInArrears, r.amtInArrears, r.status,
  ];
}

export function exportIndividualDefaultsExcel(records: IndividualDefaultRecord[], staffName: string, filters: Props['filters']) {
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
  ws['!cols'] = HEADERS.map((_, i) => ({ wch: i === 1 ? 28 : i === 2 ? 24 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Individual Defaults');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `Individual_Defaults_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success('Excel exported successfully');
}

export async function exportIndividualDefaultsPDF(records: IndividualDefaultRecord[], staffName: string, filters: Props['filters']) {
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
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell(data: any) {
      if (data.section === 'body') {
        // Color arrears columns red
        if ([14, 15, 16].includes(data.column.index)) {
          data.cell.styles.textColor = [200, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
        // Color total paid green
        if (data.column.index === 11) {
          data.cell.styles.textColor = [0, 128, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`Individual_Defaults_${new Date().toISOString().slice(0, 10)}.pdf`);
  toast.success('PDF exported successfully');
}

export function printIndividualDefaults(records: IndividualDefaultRecord[], staffName: string, filters: Props['filters']) {
  const html = `
    <html><head><title>Individual Loan Defaults</title>
    <style>
      body{font-family:Arial,sans-serif;margin:20px;font-size:11px}
      .header{text-align:center;margin-bottom:16px}
      .header img{height:80px;margin-bottom:8px}
      .header h1{font-size:22px;margin:0}
      .header h2{font-size:15px;margin:4px 0;font-weight:normal}
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
      <img src="${fmbnLogo}" /><h1>${REPORT_TITLE}</h1><h2>${REPORT_SUBTITLE}</h2>
    </div>
    <div class="meta">Generated: ${formatDateTime(new Date())} | By: ${staffName} | Filter: ${getFilterSummary(filters)}</div>
    <table><thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${records.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.name}</td><td>${r.organization}</td><td>${r.loanRefNo}</td>
      <td>${r.nhfNo}</td><td>${r.state}</td><td>${r.branch}</td><td class="text-center">${r.tenor}</td>
      <td class="text-right">${formatCurrency(r.loanAmount)}</td><td class="text-right">${formatCurrency(r.monthlyRepayment)}</td>
      <td class="text-right">${formatCurrency(r.outstanding)}</td><td class="text-right text-green">${formatCurrency(r.totalPaid)}</td>
      <td class="text-right">${r.lastPmtAmt ? formatCurrency(r.lastPmtAmt) : '—'}</td><td>${formatLastPmt(r.lastPmtDate)}</td>
      <td class="text-center text-red">${r.ageOfArrears} days</td><td class="text-center text-red">${r.monthsInArrears}</td>
      <td class="text-right text-red">${formatCurrency(r.amtInArrears)}</td><td>${r.status}</td>
    </tr>`).join('')}
    </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  toast.success('Print dialog opened');
}

export default function IndividualDefaultsExport({ records, staffName, filters }: Props) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => exportIndividualDefaultsPDF(records, staffName, filters)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportIndividualDefaultsExcel(records, staffName, filters)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => printIndividualDefaults(records, staffName, filters)}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
    </div>
  );
}

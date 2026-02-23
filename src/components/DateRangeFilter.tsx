import { DateInput } from '@/components/ui/date-input';

interface DateRangeFilterProps {
  fromDate: Date | undefined;
  toDate: Date | undefined;
  onFromDateChange: (date: Date | undefined) => void;
  onToDateChange: (date: Date | undefined) => void;
  className?: string;
}

export default function DateRangeFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  className,
}: DateRangeFilterProps) {
  return (
    <div className={className || 'flex items-end gap-2'}>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">From Date</label>
        <DateInput
          value={fromDate}
          onChange={onFromDateChange}
          max={toDate || new Date()}
          placeholder="Start date"
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">To Date</label>
        <DateInput
          value={toDate}
          onChange={onToDateChange}
          min={fromDate}
          max={new Date()}
          placeholder="End date"
          className="w-40"
        />
      </div>
    </div>
  );
}

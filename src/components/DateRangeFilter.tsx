import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
      {/* From Date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-44 justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {fromDate ? format(fromDate, 'dd MMMM yyyy') : 'From Date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Calendar
            mode="single"
            selected={fromDate}
            onSelect={(d) => onFromDateChange(d)}
            disabled={toDate ? (date) => date > toDate : undefined}
            className={cn("p-3 pointer-events-auto")}
            captionLayout="dropdown-buttons"
            fromYear={2010}
            toYear={2060}
          />
          {fromDate && (
            <div className="p-2 pt-0 border-t">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onFromDateChange(undefined)}>
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {/* To Date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-44 justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {toDate ? format(toDate, 'dd MMMM yyyy') : 'To Date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Calendar
            mode="single"
            selected={toDate}
            onSelect={(d) => onToDateChange(d)}
            disabled={fromDate ? (date) => date < fromDate : undefined}
            className={cn("p-3 pointer-events-auto")}
            captionLayout="dropdown-buttons"
            fromYear={2010}
            toYear={2060}
          />
          {toDate && (
            <div className="p-2 pt-0 border-t">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onToDateChange(undefined)}>
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

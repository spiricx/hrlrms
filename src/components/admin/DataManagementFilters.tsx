import { useState } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import DateRangeFilter from '@/components/DateRangeFilter';

export interface DataFilters {
  search: string;
  state: string;
  branch: string;
  fromDate: Date | undefined;
  toDate: Date | undefined;
}

const EMPTY_FILTERS: DataFilters = {
  search: '',
  state: '',
  branch: '',
  fromDate: undefined,
  toDate: undefined,
};

interface Props {
  filters: DataFilters;
  onChange: (f: DataFilters) => void;
  branches: string[];
  searchPlaceholder?: string;
}

export function useDataFilters() {
  const [filters, setFilters] = useState<DataFilters>(EMPTY_FILTERS);
  return { filters, setFilters };
}

export default function DataManagementFilters({ filters, onChange, branches, searchPlaceholder }: Props) {
  const set = (partial: Partial<DataFilters>) => onChange({ ...filters, ...partial });

  const hasActive = filters.state || filters.branch || filters.fromDate || filters.toDate;

  return (
    <div className="space-y-3">
      {/* Row 1: Search + State + Branch */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
        <div className="relative flex-1 w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder || 'Search by Name, NHF, Loan Ref...'}
            value={filters.search}
            onChange={e => set({ search: e.target.value })}
            className="pl-9"
          />
        </div>

        <Select value={filters.state} onValueChange={v => set({ state: v === '__all__' ? '' : v })}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All States</SelectItem>
            {NIGERIA_STATES.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.branch} onValueChange={v => set({ branch: v === '__all__' ? '' : v })}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Branches</SelectItem>
            {branches.map(b => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Date range + clear */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>Date Range:</span>
        </div>
        <DateRangeFilter
          fromDate={filters.fromDate}
          toDate={filters.toDate}
          onFromDateChange={d => set({ fromDate: d })}
          onToDateChange={d => set({ toDate: d })}
          className="flex items-end gap-2"
        />
        {hasActive && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY_FILTERS, search: filters.search })}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}

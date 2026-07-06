import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DataTableFilterOption {
  label: string;
  value: string;
}

export interface DataTableFilter {
  columnId: string;
  label: string;
  options: DataTableFilterOption[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  pagination?: boolean;
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  onSelectionChange?: (selectedRows: TData[]) => void;
  showSelection?: boolean;
  isLoading?: boolean;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  filters,
  pagination = true,
  pageSize = 20,
  onRowClick,
  onSelectionChange,
  showSelection = true,
  isLoading = false,
  toolbar,
  emptyMessage = 'Sin resultados.',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const selectColumn: ColumnDef<TData, unknown> = {
    id: '__select__',
    enableSorting: false,
    header: ({ table: t }) => (
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
        checked={t.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = t.getIsSomePageRowsSelected();
        }}
        onChange={(e) => t.toggleAllPageRowsSelected(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };

  const allColumns = (showSelection ? [selectColumn, ...columns] : columns) as ColumnDef<TData, TData>[];

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      setRowSelection((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (onSelectionChange) {
          const selectedIndices = Object.keys(next).filter((k) => next[k]);
          const selectedRows = selectedIndices.map((i) => data[Number(i)]);
          onSelectionChange(selectedRows);
        }
        return next;
      });
    },
    initialState: { pagination: { pageSize } },
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  });

  const showSearch = searchKey || onSearchChange;
  const hasToolbar = showSearch ?? filters?.length ?? toolbar;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      {hasToolbar && (
        <div className="flex items-center gap-2 flex-wrap">
          {showSearch && (
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--arca-ink-4)]" />
              <Input
                placeholder={searchPlaceholder}
                value={
                  onSearchChange
                    ? (searchValue ?? '')
                    : ((table.getColumn(searchKey!)?.getFilterValue() as string) ?? '')
                }
                onChange={(e) =>
                  onSearchChange
                    ? onSearchChange(e.target.value)
                    : table.getColumn(searchKey!)?.setFilterValue(e.target.value)
                }
                className="pl-8 h-8 text-[12.5px]"
              />
            </div>
          )}
          {filters?.map((f) => (
            <FilterSelect
              key={f.columnId}
              label={f.label}
              options={f.options}
              value={
                (table.getColumn(f.columnId)?.getFilterValue() as string) ?? ''
              }
              onChange={(v) =>
                table.getColumn(f.columnId)?.setFilterValue(v || undefined)
              }
            />
          ))}
          {toolbar}
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-b-0">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        className="flex items-center gap-1 group"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {sorted === 'asc' ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-70 transition-opacity" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 rounded bg-[var(--arca-border)] animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                onClick={
                  onRowClick ? () => onRowClick(row.original) : undefined
                }
                className={cn(onRowClick && 'cursor-pointer')}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-[var(--arca-ink-3)] text-[12.5px]"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11.5px] text-[var(--arca-ink-4)]">
            {table.getFilteredRowModel().rows.length === 0
              ? 'Sin resultados'
              : `Mostrando ${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–${Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )} de ${table.getFilteredRowModel().rows.length}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {getPaginationPages(
              table.getPageCount(),
              table.getState().pagination.pageIndex
            ).map((page, i) =>
              page === '...' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="text-[11.5px] text-[var(--arca-ink-4)] px-1"
                >
                  …
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => table.setPageIndex(Number(page) - 1)}
                  className={cn(
                    'h-7 w-7 rounded-md text-[11.5px] font-medium transition-colors duration-[120ms]',
                    table.getState().pagination.pageIndex === Number(page) - 1
                      ? 'bg-[var(--arca-ink)] text-white'
                      : 'text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)]'
                  )}
                >
                  {page}
                </button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Pagination pages helper ─── */
function getPaginationPages(
  pageCount: number,
  currentPage: number
): (number | '...')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (currentPage > 2) pages.push('...');
  for (
    let i = Math.max(2, currentPage);
    i <= Math.min(pageCount - 1, currentPage + 2);
    i++
  )
    pages.push(i);
  if (currentPage + 2 < pageCount - 1) pages.push('...');
  pages.push(pageCount);
  return pages;
}

/* ─── Filter select ─── */
function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: DataTableFilterOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-2.5 text-[12.5px] text-[var(--arca-ink-2)] outline-none focus:border-[var(--arca-navy-600)] transition-colors"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Re-export sort header helper ─── */
export { ArrowUpDown };

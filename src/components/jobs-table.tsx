import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  AlertCircle,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MoreHorizontal,
  Receipt,
  Bell,
  CalendarClock,
  FileWarning,
  Search,
  ArrowRight,
  EyeOff,
  Eye,
  Play,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PageHeader } from '@/components/shared/page-header';
import {
  getJobs,
  getJobLogs,
  dispatchAllJobs,
  type JobStatus,
  type JobType,
  type JobRow,
  type JobsResponse,
  type JobLogRow,
} from '@/actions/job';
import { getRepresentatives } from '@/actions/client';
import { JobsErrorSummary } from '@/components/jobs-error-summary';

export function JobsTable() {
  const routerNavigate = useNavigate();
  const {
    page: currentPage,
    status: statusFilter,
    type: typeFilter,
    clientId: clientFilter,
    search: searchTerm,
    date,
    fromTime,
  } = useSearch({ from: '/_authed/jobs/' });

  const setFilter = (updates: Record<string, unknown>) => {
    routerNavigate({
      to: '/jobs',
      search: (prev: Record<string, unknown>) => ({ ...prev, ...updates, page: 'page' in updates ? (updates.page as number) : 1 }),
    });
  };

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hideFinished, setHideFinished] = useState(false);
  const [dispatchLimit, setDispatchLimit] = useState('');

  const dispatchMutation = useMutation({
    mutationFn: () =>
      dispatchAllJobs({
        data: { limit: dispatchLimit ? parseInt(dispatchLimit) : undefined },
      }),
    onSuccess: (data) => {
      toast.success(`${data.dispatched} jobs encolados correctamente`);
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['job-error-summary'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al disparar los jobs');
    },
  });

  const toggleAll = (ids: string[]) => {
    const allSelected =
      ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(ids));
  };
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageSize = 20;

  const { data: representatives = [] } = useQuery({
    queryKey: ['representatives'],
    queryFn: () => getRepresentatives(),
  });

  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ['jobs', currentPage, statusFilter, typeFilter, clientFilter, date, fromTime],
    queryFn: async (): Promise<JobsResponse> => {
      const response = await getJobs({
        data: {
          page: currentPage,
          limit: pageSize,
          representativeId: clientFilter === 'all' ? undefined : clientFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
          type: typeFilter === 'all' ? undefined : typeFilter,
          date,
          fromTime: fromTime || undefined,
        },
      });
      return response;
    },
  });

  const STATUS_ORDER: Record<string, number> = { running: 0, failed: 1, finished: 2, pending: 3 };

  const jobs = (data?.jobs ?? [])
    .filter((job: JobRow) => {
      if (hiddenIds.has(job.id)) return false;
      if (hideFinished && (job.status === 'finished' || job.status === 'failed')) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        job.id.toLowerCase().includes(term) ||
        (job.representativeName ?? '').toLowerCase().includes(term) ||
        job.clients.some((c) => c.name.toLowerCase().includes(term)) ||
        job.type.toLowerCase().includes(term)
      );
    })
    .sort((a: JobRow, b: JobRow) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));

  const totalPages = data?.totalPages ?? 1;

  const { data: jobLogs = [], isLoading: logsLoading } = useQuery<JobLogRow[]>({
    queryKey: ['job-logs', selectedJob?.id],
    queryFn: async (): Promise<JobLogRow[]> => {
      if (!selectedJob?.id) return [];
      const logs = await getJobLogs({
        data: { jobId: selectedJob.id, limit: 200 },
      });
      return logs;
    },
    enabled: !!selectedJob?.id && logsOpen,
  });

  const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return '-';
    const dateObj = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(dateObj.getTime())) return '-';
    return dateObj.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDurationMinutes = (
    startedAt: string | Date | null,
    finishedAt: string | Date | null
  ) => {
    if (!startedAt || !finishedAt) return '-';
    const start = new Date(startedAt);
    const end = new Date(finishedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      return '-';
    const diffMs = end.getTime() - start.getTime();
    const minutes = diffMs / 1000 / 60;
    if (minutes < 1) return '<1 min';
    return `${minutes.toFixed(1)} min`;
  };

  const renderStatusBadge = (status: JobStatus) => {
    const baseClass =
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';

    switch (status) {
      case 'pending':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-warn)]/10 text-[var(--arca-accent-warn-fg)]`}
          >
            <Clock className="h-3 w-3" />
            Pendiente
          </span>
        );
      case 'running':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-navy-700)]/10 text-[var(--arca-navy-700)]`}
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            En progreso
          </span>
        );
      case 'failed':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-neg)]/10 text-[var(--arca-accent-neg-fg)]`}
          >
            <AlertCircle className="h-3 w-3" />
            Fallido
          </span>
        );
      case 'finished':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-pos)]/10 text-[var(--arca-accent-pos-fg)]`}
          >
            <CheckCircle2 className="h-3 w-3" />
            Correcto
          </span>
        );
      default:
        return null;
    }
  };

  const renderTypeBadge = (type: JobType) => {
    const baseClass =
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';

    switch (type) {
      case 'comprobantes':
      case 'comprobantes_full':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]`}
          >
            <Receipt className="h-3 w-3" />
            {type === 'comprobantes' ? 'Comprobantes' : 'Comprobantes full'}
          </span>
        );
      case 'iva':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-navy-700)]/10 text-[var(--arca-navy-700)]`}
          >
            <FileWarning className="h-3 w-3" />
            IVA
          </span>
        );
      case 'notificaciones':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-info-bg)] text-[var(--arca-navy-700)]`}
          >
            <Bell className="h-3 w-3" />
            Notificaciones
          </span>
        );
      case 'deuda':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]`}
          >
            <AlertCircle className="h-3 w-3" />
            Deuda
          </span>
        );
      case 'vencimientos':
        return (
          <span
            className={`${baseClass} bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]`}
          >
            <CalendarClock className="h-3 w-3" />
            Vencimientos
          </span>
        );
      default:
        return type;
    }
  };

  const handleViewDetails = (job: JobRow) => {
    setSelectedJob(job);
    setDetailOpen(true);
  };

  const handleViewLogs = (job: JobRow) => {
    setSelectedJob(job);
    setLogsOpen(true);
  };

  const handleGoToClient = (job: JobRow) => {
    void navigate({
      to: '/clients/$clientId',
      params: { clientId: job.representativeId },
    });
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Jobs"
        subtitle="Historial de jobs de scraping por cliente, tipo y estado."
        actions={
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title="Opciones avanzadas"
                  aria-label="Opciones avanzadas"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-medium">Modo dev</div>
                  <p className="text-xs text-[var(--arca-ink-3)]">
                    Limita la cantidad de clientes a disparar. Útil para probar
                    sin saturar el scrapper. Vacío = todos.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={dispatchLimit}
                      onChange={(e) => setDispatchLimit(e.target.value)}
                      placeholder="Cantidad de clientes"
                      className="text-sm"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              onClick={() => dispatchMutation.mutate()}
              disabled={dispatchMutation.isPending}
            >
              {dispatchMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" strokeWidth={2.2} />
              )}
              Disparar jobs
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-[2] min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--arca-ink-3)]" />
            <Input
              placeholder="Buscar por ID, representante, empresa o tipo..."
              value={searchTerm}
              onChange={(e) => setFilter({ search: e.target.value })}
              className="pl-8 w-full"
            />
          </div>

          <Input
            type="date"
            value={date}
            onChange={(e) => setFilter({ date: e.target.value })}
            className="flex-1 min-w-[140px]"
          />

          <Input
            type="time"
            value={fromTime}
            onChange={(e) => setFilter({ fromTime: e.target.value })}
            placeholder="Desde"
            className="flex-1 min-w-[110px]"
          />

          <div className="flex-[2] min-w-[180px]">
            <SearchableSelect
              options={[
                { value: 'all', label: 'Todos los representantes' },
                ...representatives.map((c) => ({
                  value: c.id,
                  label: c.name ?? 'Sin nombre',
                })),
              ]}
              value={clientFilter}
              onValueChange={(value) => setFilter({ clientId: value })}
              placeholder="Filtrar por representante"
              searchPlaceholder="Buscar representante..."
              width="100%"
            />
          </div>

          <div className="flex-1 min-w-[140px]">
            <SearchableSelect
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'pending', label: 'Pendiente' },
                { value: 'running', label: 'En progreso' },
                { value: 'finished', label: 'Correcto' },
                { value: 'failed', label: 'Fallido' },
              ]}
              value={statusFilter}
              onValueChange={(value) => setFilter({ status: value })}
              placeholder="Estado"
              searchPlaceholder="Buscar estado..."
              width="100%"
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <SearchableSelect
              options={[
                { value: 'all', label: 'Todos los tipos' },
                { value: 'comprobantes', label: 'Comprobantes' },
                { value: 'comprobantes_full', label: 'Comprobantes full' },
                { value: 'iva', label: 'IVA' },
                { value: 'notificaciones', label: 'Notificaciones' },
                { value: 'deuda', label: 'Deuda' },
                { value: 'vencimientos', label: 'Vencimientos' },
              ]}
              value={typeFilter}
              onValueChange={(value) => setFilter({ type: value })}
              placeholder="Tipo de job"
              searchPlaceholder="Buscar tipo..."
              width="100%"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHideFinished((v) => !v)}
          >
            {hideFinished ? (
              <Eye className="mr-1.5 h-4 w-4" />
            ) : (
              <EyeOff className="mr-1.5 h-4 w-4" />
            )}
            {hideFinished ? 'Mostrar terminados' : 'Ocultar terminados'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilter({
                search: '',
                clientId: 'all',
                status: 'all',
                type: 'all',
                date: '',
                fromTime: '',
                page: 1,
              })
            }
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      <JobsErrorSummary
        representativeId={clientFilter === 'all' ? undefined : clientFilter}
        type={typeFilter === 'all' ? undefined : (typeFilter as JobType)}
        date={date || undefined}
        fromTime={fromTime || undefined}
      />

      <div className="overflow-auto flex-1 min-h-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
                  checked={
                    jobs.length > 0 &&
                    jobs.every((j: JobRow) => selectedIds.has(j.id))
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        jobs.some((j: JobRow) => selectedIds.has(j.id)) &&
                        !jobs.every((j: JobRow) => selectedIds.has(j.id));
                  }}
                  onChange={() => toggleAll(jobs.map((j: JobRow) => j.id))}
                />
              </TableHead>
              <TableHead className="w-[90px]">ID</TableHead>
              <TableHead>Representante</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Cargando jobs...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No se encontraron jobs.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job: JobRow) => (
                <TableRow
                  key={job.id}
                  data-state={selectedIds.has(job.id) ? 'selected' : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
                      checked={selectedIds.has(job.id)}
                      onChange={() => toggleRow(job.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-[var(--arca-surface-2)] px-1.5 py-0.5 rounded">
                      {job.id.slice(0, 8)}
                    </code>
                  </TableCell>
                  <TableCell>
                    {job.representativeName ? (
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {job.representativeName}
                        </span>
                        {job.clients.length > 0 && (
                          <span
                            className="max-w-[260px] truncate text-xs text-[var(--arca-ink-3)]"
                            title={job.clients.map((c) => c.name).join(', ')}
                          >
                            {job.clients.map((c) => c.name).join(', ')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--arca-ink-3)] text-sm">
                        Representante desconocido
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{renderTypeBadge(job.type)}</TableCell>
                  <TableCell>
                    {renderStatusBadge(job.status)}
                  </TableCell>
                  <TableCell>{formatDateTime(job.createdAt)}</TableCell>
                  <TableCell>
                    {getDurationMinutes(job.startedAt, job.finishedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleViewDetails(job)}
                        >
                          <Search className="mr-2 h-4 w-4" />
                          Ver detalle del job
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewLogs(job)}>
                          <Search className="mr-2 h-4 w-4" />
                          Ver logs
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleGoToClient(job)}>
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Ir al cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setHiddenIds((prev) => {
                              const next = new Set(prev);
                              next.add(job.id);
                              return next;
                            })
                          }
                        >
                          <EyeOff className="mr-2 h-4 w-4" />
                          Ocultar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setFilter({ page: Math.max(1, currentPage - 1) })}
                  className={
                    currentPage === 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>

              {/* Mostrar solo primeras 3, últimas 1 y ventana alrededor de la actual */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  if (page <= 3) return true;
                  if (page === totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .flatMap((page, index, visiblePages) => {
                  const prevPage = visiblePages[index - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  const items = [];
                  if (showEllipsis) {
                    items.push(
                      <PaginationItem key={`ellipsis-${page}`}>
                        <span className="px-2 text-[var(--arca-ink-3)]">
                          ...
                        </span>
                      </PaginationItem>
                    );
                  }
                  items.push(
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setFilter({ page })}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                  return items;
                })}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setFilter({ page: Math.min(totalPages, currentPage + 1) })}

                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader className="space-y-2 pb-2 border-b pr-6">
            <DialogTitle className="flex items-center gap-2 text-lg min-w-0">
              <span className="truncate">Detalle del job</span>
              {selectedJob && renderTypeBadge(selectedJob.type)}
            </DialogTitle>
            {selectedJob && (
              <>
                <p className="text-[11px] text-[var(--arca-ink-3)] font-mono truncate">
                  ID: {selectedJob.id}
                </p>
                <div className="pt-1">
                  {renderStatusBadge(selectedJob.status)}
                </div>
              </>
            )}
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-6 pt-4 overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[var(--arca-ink-3)]">
                    Representante
                  </p>
                  <p className="text-sm font-semibold">
                    {selectedJob.representativeName ??
                      'Representante desconocido'}
                  </p>
                  <p className="text-xs text-[var(--arca-ink-3)] font-mono">
                    {selectedJob.representativeId}
                  </p>
                  {selectedJob.clients.length > 0 && (
                    <p className="text-xs text-[var(--arca-ink-3)]">
                      {selectedJob.clients.map((c) => c.name).join(', ')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[var(--arca-ink-3)]">
                    Duración
                  </p>
                  <p className="text-sm">
                    {getDurationMinutes(
                      selectedJob.startedAt,
                      selectedJob.finishedAt
                    )}
                  </p>
                  <p className="text-xs text-[var(--arca-ink-3)]">
                    {selectedJob.startedAt && selectedJob.finishedAt
                      ? `${formatDateTime(selectedJob.startedAt)} → ${formatDateTime(
                          selectedJob.finishedAt
                        )}`
                      : 'Sin información completa de tiempos'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[var(--arca-ink-3)]">
                    Creado
                  </p>
                  <p className="text-sm text-[var(--arca-ink-3)]">
                    {formatDateTime(selectedJob.createdAt)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[var(--arca-ink-3)]">
                    Última actualización
                  </p>
                  <p className="text-sm text-[var(--arca-ink-3)]">
                    {formatDateTime(selectedJob.updatedAt)}
                  </p>
                </div>

                <div className="space-y-1.5 col-span-2">
                  <p className="text-xs font-medium text-[var(--arca-ink-3)]">
                    Motivo de error
                  </p>
                  <p
                    className={`mt-1 text-sm rounded-md px-2 py-1 ${
                      selectedJob.failedReason
                        ? 'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)] border border-[var(--arca-accent-neg)]/30'
                        : 'text-[var(--arca-ink-3)] bg-[var(--arca-surface-2)]'
                    }`}
                  >
                    {selectedJob.failedReason || 'Sin errores reportados'}
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex flex-col">
                    <p className="font-medium">Resultado</p>
                    <p className="text-[11px] text-[var(--arca-ink-3)]">
                      Resumen de lo que devolvió el scrapper
                    </p>
                  </div>
                  {selectedJob.result && (
                    <Badge variant="outline" className="text-[10px]">
                      Detalle
                    </Badge>
                  )}
                </div>

                {!selectedJob.result ||
                Object.keys(selectedJob.result).length === 0 ? (
                  <div className="border rounded-md bg-[var(--arca-surface-2)] px-3 py-2 text-xs text-[var(--arca-ink-3)]">
                    Sin resultado aún.
                  </div>
                ) : (
                  <ScrollArea className="h-48 border rounded-md bg-[var(--arca-surface-2)] p-2">
                    <div className="space-y-1 text-xs">
                      {Object.entries(selectedJob.result).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="flex items-start justify-between gap-4 border-b last:border-b-0 border-border/40 pb-1.5"
                          >
                            <span className="font-medium text-foreground min-w-[120px]">
                              {key}
                            </span>
                            <span className="text-[var(--arca-ink-3)] text-right flex-1 break-words">
                              {typeof value === 'object'
                                ? JSON.stringify(value)
                                : String(value)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader className="space-y-2 pb-2 border-b pr-6">
            <DialogTitle className="flex items-center justify-between gap-4 text-lg">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="truncate">Logs del job</span>
                {selectedJob && (
                  <p className="text-[11px] text-[var(--arca-ink-3)] font-mono truncate">
                    {selectedJob.id}
                  </p>
                )}
              </div>
              {selectedJob && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {renderTypeBadge(selectedJob.type)}
                  {renderStatusBadge(selectedJob.status)}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="pt-3 flex-1 min-h-0">
            {logsLoading ? (
              <div className="border rounded-md bg-[var(--arca-surface-2)] px-3 py-2 text-sm text-[var(--arca-ink-3)]">
                Cargando logs...
              </div>
            ) : jobLogs.length === 0 ? (
              <div className="border rounded-md bg-[var(--arca-surface-2)] px-3 py-2 text-sm text-[var(--arca-ink-3)]">
                No hay logs registrados para este job.
              </div>
            ) : (
              <ScrollArea className="h-[60vh] border rounded-md bg-[var(--arca-surface-2)] p-3">
                <div className="space-y-2 text-xs">
                  {jobLogs.map((log) => {
                    const level = log.level.toLowerCase();
                    let colorClasses =
                      'border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)]';
                    let icon = (
                      <Info className="h-3.5 w-3.5 text-[var(--arca-ink-3)]" />
                    );

                    if (level === 'info') {
                      colorClasses =
                        'border-[var(--arca-accent-info)]/30 bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]';
                      icon = (
                        <Info className="h-3.5 w-3.5 text-[var(--arca-accent-info)]" />
                      );
                    } else if (level === 'warn') {
                      colorClasses =
                        'border-[var(--arca-accent-warn)]/30 bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]';
                      icon = (
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--arca-accent-warn)]" />
                      );
                    } else if (level === 'error') {
                      colorClasses =
                        'border-[var(--arca-accent-neg)]/30 bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]';
                      icon = (
                        <AlertCircle className="h-3.5 w-3.5 text-[var(--arca-accent-neg)]" />
                      );
                    } else if (level === 'debug') {
                      colorClasses =
                        'border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]';
                      icon = (
                        <Bug className="h-3.5 w-3.5 text-[var(--arca-ink-4)]" />
                      );
                    }

                    return (
                      <div
                        key={log.id}
                        className={`flex items-start gap-3 rounded-md border px-3 py-2 ${colorClasses}`}
                      >
                        <div className="mt-0.5">{icon}</div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold tracking-wide uppercase">
                              {level}
                            </span>
                            <span className="text-[10px] text-[var(--arca-ink-3)]">
                              {formatDateTime(log.createdAt)}
                            </span>
                          </div>
                          <p className="text-[11px] leading-snug">
                            {log.message}
                          </p>
                          {log.context &&
                            Object.keys(log.context).length > 0 && (
                              <pre className="mt-1 text-[10px] text-[var(--arca-ink-3)] bg-background/60 rounded px-2 py-1 whitespace-pre-wrap break-words">
                                {JSON.stringify(log.context, null, 2)}
                              </pre>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

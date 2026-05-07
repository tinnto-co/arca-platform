import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getClientPortalRequests,
  completeClientRequest,
  uploadDocumentForRequest,
} from '@/actions/client-portal';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  XCircle,
  Paperclip,
  Upload,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { useState, useRef } from 'react';

type RequestMeta = { documentId?: string; documentName?: string } | null;

interface PortalRequest {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  dueAt: string | Date | null;
  completedAt: string | Date | null;
  metadata?: RequestMeta;
  createdAt: string | Date;
}

export const Route = createFileRoute('/_client/portal/solicitudes/')({
  component: PortalSolicitudes,
});

const STATUS_LABELS: Record<
  string,
  { label: string; bg: string; color: string; icon: React.ReactNode }
> = {
  open: {
    label: 'Pendiente',
    bg: 'var(--arca-accent-warn-bg)',
    color: 'var(--arca-accent-warn)',
    icon: <Clock size={12} />,
  },
  completed: {
    label: 'Completada',
    bg: 'var(--arca-accent-pos-bg)',
    color: 'var(--arca-accent-pos)',
    icon: <CheckCircle2 size={12} />,
  },
  cancelled: {
    label: 'Cancelada',
    bg: 'var(--arca-surface-2)',
    color: 'var(--arca-ink-3)',
    icon: <XCircle size={12} />,
  },
};

function PortalSolicitudes() {
  const { clientId } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [uploadingRequestId, setUploadingRequestId] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: requestsRaw, isLoading } = useQuery({
    queryKey: ['portalRequests', clientId, statusFilter],
    queryFn: () =>
      getClientPortalRequests({
        data: { clientId, status: statusFilter || undefined },
      }),
    enabled: !!clientId,
    staleTime: 30_000,
  });
  const requests: PortalRequest[] = (requestsRaw as PortalRequest[]) ?? [];

  const completeMutation = useMutation({
    mutationFn: (requestId: string) =>
      completeClientRequest({ data: { requestId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalRequests', clientId] });
      queryClient.invalidateQueries({
        queryKey: ['portalDashboard', clientId],
      });
      toast.success('Solicitud marcada como completada');
    },
    onError: () => toast.error('Error al completar la solicitud'),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      requestId,
      file,
    }: {
      requestId: string;
      file: File;
    }) => {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip the data URL prefix (data:mime;base64,)
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Error leyendo el archivo'));
        reader.readAsDataURL(file);
      });

      return uploadDocumentForRequest({
        data: {
          requestId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          base64Data,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalRequests', clientId] });
      queryClient.invalidateQueries({
        queryKey: ['portalDashboard', clientId],
      });
      setUploadingRequestId(null);
      toast.success('Documento enviado correctamente');
    },
    onError: (err: Error) => {
      setUploadingRequestId(null);
      toast.error(err.message ?? 'Error al subir el documento');
    },
  });

  function handleUploadClick(requestId: string) {
    setUploadingRequestId(requestId);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingRequestId) {
      setUploadingRequestId(null);
      return;
    }
    uploadMutation.mutate({ requestId: uploadingRequestId, file });
    // Reset the input so the same file can be re-selected if needed
    e.target.value = '';
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="*/*"
      />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[var(--arca-ink)] leading-tight">
          Solicitudes
        </h1>
        <p className="text-sm text-[var(--arca-ink-3)] mt-1">
          Solicitudes enviadas por su estudio contable
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5">
        {[
          { value: 'open', label: 'Pendientes' },
          { value: 'completed', label: 'Completadas' },
          { value: '', label: 'Todas' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background:
                statusFilter === f.value
                  ? 'var(--arca-accent-primary)'
                  : 'var(--arca-surface)',
              color: statusFilter === f.value ? '#fff' : 'var(--arca-ink-3)',
              borderColor:
                statusFilter === f.value
                  ? 'var(--arca-accent-primary)'
                  : 'var(--arca-border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-sm text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--arca-ink-3)]">
          <ClipboardList size={32} className="opacity-30" />
          <p className="text-sm">
            No hay solicitudes{statusFilter === 'open' ? ' pendientes' : ''}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => {
            const sc = STATUS_LABELS[req.status] ?? STATUS_LABELS.open;
            const meta = req.metadata as RequestMeta;
            const hasDocument = !!meta?.documentId;
            const isUploadingThis =
              uploadMutation.isPending && uploadingRequestId === req.id;

            return (
              <li
                key={req.id}
                className="rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--arca-ink)] leading-snug">
                      {req.title}
                    </p>
                    {req.description && (
                      <p className="text-[12px] text-[var(--arca-ink-3)] mt-1 leading-relaxed">
                        {req.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2.5">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: sc.bg, color: sc.color }}
                      >
                        {sc.icon}
                        {sc.label}
                      </span>
                      <span className="text-[11px] text-[var(--arca-ink-4)]">
                        Tipo: {req.type}
                      </span>
                      {req.dueAt && (
                        <span className="text-[11px] text-[var(--arca-ink-4)]">
                          Vence:{' '}
                          {format(
                            new Date(req.dueAt as unknown as string),
                            'dd/MM/yyyy',
                            { locale: es }
                          )}
                        </span>
                      )}
                      {req.completedAt && (
                        <span className="text-[11px] text-[var(--arca-accent-pos)]">
                          Completada el{' '}
                          {format(
                            new Date(req.completedAt as unknown as string),
                            'dd/MM/yyyy',
                            { locale: es }
                          )}
                        </span>
                      )}
                      {/* Document attachment indicator */}
                      {hasDocument && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background:
                              'var(--arca-accent-primary-bg, #e8f0fe)',
                            color: 'var(--arca-accent-primary)',
                          }}
                        >
                          <Paperclip size={10} />
                          {meta?.documentName ?? 'Documento adjunto'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {/* Document upload for open document-type requests */}
                    {req.status === 'open' && req.type === 'document' && (
                      <>
                        {hasDocument ? (
                          <span className="text-[11px] text-[var(--arca-accent-pos)] flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Documento enviado
                          </span>
                        ) : (
                          <button
                            disabled={
                              isUploadingThis || uploadMutation.isPending
                            }
                            onClick={() => handleUploadClick(req.id)}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            style={{
                              background: 'var(--arca-surface-2)',
                              color: 'var(--arca-ink)',
                              border: '1px solid var(--arca-border-strong)',
                            }}
                          >
                            {isUploadingThis ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Upload size={12} />
                            )}
                            {isUploadingThis
                              ? 'Subiendo...'
                              : 'Subir documento'}
                          </button>
                        )}
                      </>
                    )}

                    {/* Complete button for open non-document requests */}
                    {req.status === 'open' && req.type !== 'document' && (
                      <button
                        disabled={completeMutation.isPending}
                        onClick={() => completeMutation.mutate(req.id)}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        style={{
                          background: 'var(--arca-accent-pos-bg)',
                          color: 'var(--arca-accent-pos)',
                          border: '1px solid var(--arca-accent-pos)',
                        }}
                      >
                        Completar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

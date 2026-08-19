import { Loader2, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { scrapSingleJob } from '@/actions/client';
import { cn } from '@/lib/utils';
import { NotificationsView } from '@/components/notifications-view';
import { userQuery } from '@/lib/user-query';
import { useQuery } from '@tanstack/react-query';

const formatLastUpdateAt = (iso: string | Date) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

interface NotificacionesTabProps {
  representativeId: string;
  selectedClientId?: string;
  scrapingSection: string | null;
  setScrapingSection: (
    s: 'iva' | 'deudas' | 'vencimientos' | 'facturas' | 'notificaciones' | null
  ) => void;
  lastNotificacionesJob: {
    createdAt?: string | Date;
    success?: boolean;
    failedReason?: string | null;
    notificationFetchWarning?: string | null;
  } | null | undefined;
}

export function NotificacionesTab({
  representativeId,
  selectedClientId,
  scrapingSection,
  setScrapingSection,
  lastNotificacionesJob,
}: NotificacionesTabProps) {
  const queryClient = useQueryClient();
  const { data: sessionUser } = useQuery(userQuery);
  const orgKey = sessionUser?.activeOrganizationId ?? '__pending__';

  const hasError =
    lastNotificacionesJob &&
    !lastNotificacionesJob.success &&
    lastNotificacionesJob.failedReason;

  const hasSecurityWarning =
    lastNotificacionesJob?.failedReason?.includes('seguridad') ||
    lastNotificacionesJob?.failedReason?.includes('contraseña');

  return (
    <div
      className="bg-[#F7F6F2] border border-[#DFDCD3] rounded-2xl overflow-hidden"
      style={{
        boxShadow:
          '0 1px 3px rgba(18,19,26,.04), 0 8px 24px rgba(18,19,26,.05)',
      }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECEAE3]">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[12.5px] text-[#6E7079]">
            Últ. actualización{' '}
            {lastNotificacionesJob?.createdAt ? (
              <span
                className={cn(
                  'font-bold',
                  lastNotificacionesJob.success
                    ? 'text-[#2f7d55]'
                    : 'text-[#c0392b]'
                )}
              >
                {formatLastUpdateAt(lastNotificacionesJob.createdAt)}
              </span>
            ) : (
              '—'
            )}
          </p>

          {hasError && (
            <span className="relative group">
              <Info className="h-4 w-4 text-[#c0392b] cursor-help" />
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 hidden group-hover:block w-max max-w-sm rounded-lg bg-[#12131A] text-white text-[11px] leading-snug px-3 py-2 shadow-lg pointer-events-none">
                {lastNotificacionesJob.failedReason}
              </span>
            </span>
          )}

          {hasSecurityWarning && (
            <div className="flex items-center gap-2 text-[12.5px] text-[#c0392b]">
              <Lock className="h-3.5 w-3.5" />
              <span>
                Por medidas de seguridad tenés que cambiar tu contraseña.
              </span>
            </div>
          )}

          {lastNotificacionesJob?.notificationFetchWarning && (
            <span className="text-[11px] text-[#8a6d00]">
              {lastNotificacionesJob.notificationFetchWarning}
            </span>
          )}
        </div>

        <button
          className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors disabled:opacity-50 shrink-0"
          disabled={!!scrapingSection}
          onClick={async () => {
            setScrapingSection('notificaciones');
            try {
              await scrapSingleJob({
                data: { representativeId, jobType: 'notificaciones' },
              });
              await queryClient.invalidateQueries({
                queryKey: ['clientNotifications', orgKey, representativeId],
              });
              await queryClient.invalidateQueries({
                queryKey: ['lastNotificacionesJob', representativeId],
              });
              toast.success('Notificaciones actualizadas correctamente');
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : 'Error al actualizar notificaciones'
              );
              queryClient.invalidateQueries({
                queryKey: ['lastNotificacionesJob', representativeId],
              });
            } finally {
              setScrapingSection(null);
            }
          }}
        >
          {scrapingSection === 'notificaciones' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Actualizando…
            </>
          ) : (
            'Actualizar notificaciones'
          )}
        </button>
      </div>

      {/* ── NotificationsView (master-detail) ── */}
      <NotificationsView
        clientId={representativeId}
        profileId={selectedClientId}
        className="min-h-[640px]"
      />
    </div>
  );
}

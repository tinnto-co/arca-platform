import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  Receipt,
  BanknoteArrowUp,
  Bell,
  BookOpen,
  Check,
  Loader2,
  Mail,
  Calendar as CalendarIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import {
  getRepresentativeDebts,
  getRepresentativeDueDates,
  getRepresentativeIvaCredit,
  getBalanceConfig,
  upsertBalanceConfig,
} from '@/actions/client';
import {
  getNotifications,
  markNotificationOpened,
} from '@/actions/notification';
import { userQuery } from '@/lib/user-query';
import { getMonthBounds, MONTH_NAMES, MONTH_NAMES_SHORT } from './render-iva-resume';
import { cn } from '@/lib/utils';

// ─── Formatting helpers ───────────────────────────────────────────────
const formatARS = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatIvaCurrency = (value: string | number | null | undefined) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
};

const formatDateShort = (date: Date | string | null | undefined) => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// ─── Chart helpers ────────────────────────────────────────────────────
function buildLast12MonthsChart(
  invoices: any[],
  selectedClientId: string | undefined
): { period: string; label: string; ventas: number; compras: number }[] {
  const now = new Date();
  const buckets: Record<string, { ventas: number; compras: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = { ventas: 0, compras: 0 };
  }
  (invoices ?? []).forEach((inv: any) => {
    if (selectedClientId && (inv.profileId ?? inv.profile) !== selectedClientId)
      return;
    const d = new Date(inv.emitionDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[key]) return;
    let amount = parseFloat(inv.amount || '0');
    if (inv.currency?.toUpperCase() === 'USD')
      amount *= parseFloat(inv.currencyRate || '1');
    const dir = inv.direction?.toLowerCase();
    if (dir === 'outbound') buckets[key].ventas += amount;
    else if (dir === 'inbound') buckets[key].compras += amount;
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [, m] = key.split('-').map(Number);
      return {
        period: key,
        label: MONTH_NAMES_SHORT[m - 1],
        ventas: data.ventas,
        compras: data.compras,
      };
    });
}

// ─── Inline SVG chart ─────────────────────────────────────────────────
function InlineSVGChart({
  data,
}: {
  data: { label: string; ventas: number; compras: number }[];
}) {
  if (!data.length) return null;

  const W = 860;
  const H = 320;
  const plotLeft = 55;
  const plotRight = 835;
  const plotTop = 40;
  const plotBottom = 280;
  const labelY = 300;

  const maxVal = Math.max(...data.flatMap((d) => [d.ventas, d.compras]), 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / magnitude) * magnitude;
  const gridLines = 4;
  const gridStep = niceMax / gridLines;

  const plotW = plotRight - plotLeft;
  const groupW = plotW / data.length;
  const barW = 14;
  const pxPerUnit = (plotBottom - plotTop) / niceMax;

  const isLastMonth = (i: number) => i === data.length - 1;

  const formatYLabel = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(0)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return String(v);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Gráfico de ventas y compras últimos 12 meses"
    >
      {/* Gridlines */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const val = gridStep * i;
        const y = plotBottom - val * pxPerUnit;
        return (
          <g key={i}>
            {i > 0 ? (
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="#ECEAE3"
                strokeDasharray="3 4"
              />
            ) : (
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="#DFDCD3"
              />
            )}
            <text
              x={47}
              y={y + 4}
              textAnchor="end"
              fill="#9B9CA3"
              fontSize={11}
            >
              {formatYLabel(val)}
            </text>
          </g>
        );
      })}

      {/* Bars + labels */}
      {data.map((d, i) => {
        const cx = plotLeft + groupW * i + groupW / 2;
        const ventasH = d.ventas * pxPerUnit;
        const comprasH = d.compras * pxPerUnit;
        const opacity = isLastMonth(i) ? 0.65 : 1;
        return (
          <g key={i}>
            <rect
              x={cx - barW - 1}
              y={plotBottom - ventasH}
              width={barW}
              height={Math.max(ventasH, 0)}
              rx={2}
              fill="#142A4E"
              fillOpacity={opacity}
            />
            <rect
              x={cx + 1}
              y={plotBottom - comprasH}
              width={barW}
              height={Math.max(comprasH, 0)}
              rx={2}
              fill="#90ACD0"
              fillOpacity={opacity}
            />
            <text
              x={cx}
              y={labelY}
              textAnchor="middle"
              fill="#9B9CA3"
              fontSize={10.5}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────
interface ResumenTabProps {
  representativeId: string;
  selectedClientId?: string;
  allInvoicesData: { invoices: any[] } | undefined;
  profiles: { id: string; name?: string }[];
}

// ─── Main component ───────────────────────────────────────────────────
export function ResumenTab({
  representativeId,
  selectedClientId,
  allInvoicesData,
  profiles,
}: ResumenTabProps) {
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  // Periodo IVA: mes actual en formato MM/YYYY
  const periodoFiscalResumen = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  // ── Session / org key ──
  const { data: sessionUser } = useQuery(userQuery);
  const orgKey = sessionUser?.activeOrganizationId ?? '__pending__';

  // ── Cierre de ejercicio form state ──
  const [balanceMonth, setBalanceMonth] = useState('12');
  const [balanceDay, setBalanceDay] = useState('31');
  const [balancePresentationDays, setBalancePresentationDays] = useState('');
  const [balanceAlertDays, setBalanceAlertDays] = useState('60,30,15,7');

  // ── Notification detail modal ──
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any>(null);

  // ─── Queries ──────────────────────────────────────────────────────

  const { data: debtsData, isLoading: loadingDebts } = useQuery({
    queryKey: ['representativeDebts', representativeId, selectedClientId],
    queryFn: () =>
      getRepresentativeDebts({
        data: {
          representativeId,
          clientId: selectedClientId || undefined,
        },
      }),
    enabled: !!representativeId,
  });

  const { data: dueDatesData, isLoading: loadingDueDates } = useQuery({
    queryKey: ['representativeDueDates', representativeId, selectedClientId],
    queryFn: () =>
      getRepresentativeDueDates({
        data: {
          representativeId,
          clientId: selectedClientId || undefined,
        },
      }),
    enabled: !!representativeId,
  });

  const { data: notificationsData, isLoading: loadingNotifs } = useQuery({
    queryKey: ['unreadNotifications', orgKey, representativeId, selectedClientId],
    queryFn: () =>
      getNotifications({
        data: {
          representativeFilter: representativeId,
          clientId: selectedClientId || undefined,
          opened: false,
          page: 1,
          limit: 50,
        },
      }),
    enabled: !!representativeId && orgKey !== '__pending__',
  });

  const { data: ivaData, isLoading: loadingIva } = useQuery({
    queryKey: ['clientIva', representativeId, selectedClientId, periodoFiscalResumen],
    queryFn: () =>
      getRepresentativeIvaCredit({
        data: {
          representativeId,
          clientId: selectedClientId || undefined,
          periodoFiscalResumen,
        },
      }),
    enabled: !!representativeId,
  });

  const { data: balanceConfig, isLoading: loadingBalanceConfig } = useQuery({
    queryKey: ['balanceConfig', representativeId],
    queryFn: () =>
      getBalanceConfig({
        data: { representativeId },
      }),
    enabled: !!representativeId,
  });

  // Pre-fill balance config form when data loads
  useEffect(() => {
    if (balanceConfig) {
      if (balanceConfig.fiscalYearEndMonth != null)
        setBalanceMonth(String(balanceConfig.fiscalYearEndMonth));
      if (balanceConfig.fiscalYearEndDay != null)
        setBalanceDay(String(balanceConfig.fiscalYearEndDay));
      if (balanceConfig.presentationDueDays != null)
        setBalancePresentationDays(String(balanceConfig.presentationDueDays));
      if (balanceConfig.alertDaysBefore != null)
        setBalanceAlertDays(
          Array.isArray(balanceConfig.alertDaysBefore)
            ? (balanceConfig.alertDaysBefore as number[]).join(', ')
            : String(balanceConfig.alertDaysBefore)
        );
    }
  }, [balanceConfig]);

  // ─── Mutations ────────────────────────────────────────────────────

  const markOpenedMutation = useMutation({
    mutationFn: (id: string) =>
      markNotificationOpened({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['unreadNotifications', orgKey, representativeId, selectedClientId],
      });
      toast.success('Notificación marcada como leída');
    },
    onError: () => {
      toast.error('Error al marcar la notificación');
    },
  });

  const upsertBalanceMutation = useMutation({
    mutationFn: () => {
      const alertDaysBefore = balanceAlertDays
        ? balanceAlertDays
            .split(/[,\s]+/)
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n))
        : undefined;
      return upsertBalanceConfig({
        data: {
          representativeId,
          fiscalYearEndMonth: Number(balanceMonth),
          fiscalYearEndDay: Number(balanceDay),
          presentationDueDays: balancePresentationDays
            ? Number(balancePresentationDays)
            : null,
          alertDaysBefore,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balanceConfig', representativeId] });
      toast.success('Configuración guardada correctamente');
    },
    onError: () => {
      toast.error('Error al guardar la configuración');
    },
  });

  // ─── Computed values ──────────────────────────────────────────────

  const debtStats = useMemo(() => {
    const debts = debtsData ?? [];
    const totalBalance = debts.reduce(
      (acc: number, d: any) => acc + parseFloat(d.balance || '0'),
      0
    );
    const totalDebts = debts.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueCount = debts.filter((d: any) => {
      if (!d.dueDate) return false;
      const due = new Date(d.dueDate);
      return due < today;
    }).length;
    return { totalBalance, totalDebts, overdueCount };
  }, [debtsData]);

  const dueDateStats = useMemo(() => {
    const dueDates = dueDatesData ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDates = dueDates
      .filter((dd: any) => {
        if (!dd.dueDate) return false;
        const d = new Date(dd.dueDate);
        return d >= today;
      })
      .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const nextDueDate = futureDates[0]?.dueDate ?? null;
    return { nextDueDate };
  }, [dueDatesData]);

  const resumenCurrentMonthStats = useMemo(() => {
    const invoices = allInvoicesData?.invoices ?? [];
    if (!invoices.length) return { totalSales: 0, totalPurchases: 0 };
    const { from, to } = getMonthBounds(now.getFullYear(), now.getMonth());
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    let totalSales = 0;
    let totalPurchases = 0;
    invoices.forEach((inv: any) => {
      if (selectedClientId && (inv.profileId ?? inv.profile) !== selectedClientId)
        return;
      const invDate = new Date(inv.emitionDate);
      if (invDate < from || invDate > toEnd) return;
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD')
        amount *= parseFloat(inv.currencyRate || '1');
      const dir = inv.direction?.toLowerCase();
      if (dir === 'outbound') totalSales += amount;
      else if (dir === 'inbound') totalPurchases += amount;
    });
    return { totalSales, totalPurchases };
  }, [allInvoicesData, selectedClientId, now]);

  const resumenChartData = useMemo(
    () => buildLast12MonthsChart(allInvoicesData?.invoices ?? [], selectedClientId),
    [allInvoicesData, selectedClientId]
  );

  const unreadNotifications = notificationsData?.notifications ?? [];
  const unreadCount = notificationsData?.totalCount ?? 0;

  const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const currentIvaPeriodLabel = periodoFiscalResumen;

  const saldoFacturacion =
    resumenCurrentMonthStats.totalSales - resumenCurrentMonthStats.totalPurchases;

  // Find a profile to link to (first profile, or selected)
  const linkProfileId =
    selectedClientId ?? profiles[0]?.id ?? '';

  return (
    <>
      <div
        className="bg-[#F7F6F2] border border-[#DFDCD3] rounded-2xl overflow-hidden"
        style={{
          boxShadow:
            '0 1px 3px rgba(18,19,26,.04), 0 8px 24px rgba(18,19,26,.05)',
        }}
      >
        {/* ── Top band: 3 columns ── */}
        <div
          className="grid bg-white"
          style={{ gridTemplateColumns: '1.05fr 1fr 1fr' }}
        >
          {/* ── Estado general ── */}
          <div className="px-7 py-6 border-r border-[#ECEAE3]">
            {/* Header */}
            <div className="flex items-center gap-2 mb-5">
              <Activity
                className="shrink-0"
                style={{ width: 15, height: 15, stroke: '#3E404A' }}
              />
              <span
                className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
                style={{ fontSize: 15 }}
              >
                Estado general
              </span>
            </div>

            {/* Row 1: Deuda total */}
            <div className="py-[14px]">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[6px]">
                DEUDA TOTAL
              </div>
              {loadingDebts ? (
                <div className="flex items-center gap-2 h-8">
                  <Loader2 className="h-4 w-4 animate-spin text-[#9B9CA3]" />
                </div>
              ) : (
                <>
                  <div
                    className="font-[family-name:var(--ff-display)] font-bold text-[#12131A] tabular-nums whitespace-nowrap leading-none"
                    style={{ fontSize: 24 }}
                  >
                    {formatARS(debtStats.totalBalance)}
                  </div>
                  <div className="mt-[5px] text-[12px] text-[#6E7079]">
                    {debtStats.totalDebts} deuda{debtStats.totalDebts !== 1 ? 's' : ''}{' '}
                    ·{' '}
                    <span className="text-[#c0392b] font-semibold">
                      {debtStats.overdueCount} vencida{debtStats.overdueCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-[#F0EEE8]" />

            {/* Row 2: Próximo vencimiento */}
            <div className="py-[14px]">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[6px]">
                PRÓX. VENCIMIENTO
              </div>
              {loadingDueDates ? (
                <div className="flex items-center gap-2 h-6">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9B9CA3]" />
                </div>
              ) : (
                <div className="text-[15px] font-semibold text-[#12131A] tabular-nums">
                  {formatDateShort(dueDateStats.nextDueDate)}
                </div>
              )}
            </div>

            <div className="border-t border-[#F0EEE8]" />

            {/* Row 3: Notificaciones pendientes */}
            <div className="py-[14px]">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[6px]">
                NOTIF. PENDIENTES
              </div>
              {loadingNotifs ? (
                <div className="flex items-center gap-2 h-6">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9B9CA3]" />
                </div>
              ) : (
                <div className="text-[15px] font-semibold text-[#12131A] tabular-nums">
                  {unreadCount}
                </div>
              )}
            </div>

            {/* Footer link */}
            {linkProfileId && (
              <Link
                to="/clients/$clientId/$profileId"
                params={{
                  clientId: representativeId,
                  profileId: linkProfileId,
                }}
                className="text-[13px] font-semibold text-[#2A4680] hover:underline mt-1 inline-block"
              >
                Ver perfil completo →
              </Link>
            )}
          </div>

          {/* ── Facturación ── */}
          <div className="px-7 py-6 border-r border-[#ECEAE3]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Receipt
                  className="shrink-0"
                  style={{ width: 15, height: 15, stroke: '#3E404A' }}
                />
                <span
                  className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
                  style={{ fontSize: 15 }}
                >
                  Facturación
                </span>
              </div>
              <span
                className="font-[family-name:var(--ff-mono)] text-[#9B9CA3]"
                style={{ fontSize: 11.5 }}
              >
                {currentMonthLabel}
              </span>
            </div>

            {/* Ventas */}
            <div className="py-[13px]">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[5px]">
                VENTAS
              </div>
              <div
                className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A] tabular-nums"
                style={{ fontSize: 18 }}
              >
                {formatARS(resumenCurrentMonthStats.totalSales)}
              </div>
            </div>

            {/* Compras */}
            <div className="py-[13px]">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[5px]">
                COMPRAS
              </div>
              <div
                className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A] tabular-nums"
                style={{ fontSize: 18 }}
              >
                {formatARS(resumenCurrentMonthStats.totalPurchases)}
              </div>
            </div>

            <div className="border-t border-[#F0EEE8] my-1" />

            {/* Saldo */}
            <div className="pt-[13px]">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[5px]">
                SALDO
              </div>
              <div
                className={cn(
                  'font-[family-name:var(--ff-display)] font-bold tabular-nums',
                  saldoFacturacion >= 0
                    ? 'text-[#2f7d55]'
                    : 'text-[#c0392b]'
                )}
                style={{ fontSize: 26 }}
              >
                {formatARS(saldoFacturacion)}
              </div>
            </div>
          </div>

          {/* ── IVA ── */}
          <div className="px-7 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BanknoteArrowUp
                  className="shrink-0"
                  style={{ width: 15, height: 15, stroke: '#3E404A' }}
                />
                <span
                  className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
                  style={{ fontSize: 15 }}
                >
                  IVA
                </span>
              </div>
              <span
                className="font-[family-name:var(--ff-mono)] text-[#9B9CA3]"
                style={{ fontSize: 11.5 }}
              >
                {currentIvaPeriodLabel}
              </span>
            </div>

            {loadingIva ? (
              <div className="flex items-center gap-2 h-16 text-[#9B9CA3]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[13.5px]">Cargando IVA…</span>
              </div>
            ) : !ivaData ? (
              <div className="flex flex-col gap-3">
                <span
                  className="inline-flex items-center self-start rounded-full px-3 py-[4px] text-[12px] font-semibold"
                  style={{
                    color: 'oklch(0.48 0.11 245)',
                    background: 'oklch(0.94 0.03 245)',
                  }}
                >
                  Pendiente de carga
                </span>
                <p className="text-[13.5px] text-[#6E7079]">
                  Sin datos del período
                </p>
                <p className="text-[12px] text-[#B4B3AC]">
                  Actualizá el IVA para ver los datos
                </p>
              </div>
            ) : (
              <>
                {/* Saldo técnico */}
                <div className="py-[13px]">
                  <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[5px]">
                    SALDO TÉCNICO
                  </div>
                  <div
                    className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A] tabular-nums"
                    style={{ fontSize: 17 }}
                  >
                    {formatIvaCurrency((ivaData as any)?.saldoTecnico)}
                  </div>
                </div>

                <div className="border-t border-[#F0EEE8] my-1" />

                {/* Libre disponibilidad */}
                <div className="pt-[13px]">
                  <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3] mb-[5px]">
                    LIBRE DISP.
                  </div>
                  <div
                    className={cn(
                      'font-[family-name:var(--ff-display)] font-semibold tabular-nums',
                      Number((ivaData as any)?.libreDisponibilidad ?? 0) >= 0
                        ? 'text-[#2f7d55]'
                        : 'text-[#c0392b]'
                    )}
                    style={{ fontSize: 20 }}
                  >
                    {formatIvaCurrency((ivaData as any)?.libreDisponibilidad)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Middle band: Chart + Notifications ── */}
        <div
          className="grid border-t border-[#ECEAE3]"
          style={{ gridTemplateColumns: '2fr 1fr' }}
        >
          {/* ── Chart ── */}
          <div className="px-7 py-6 border-r border-[#ECEAE3] bg-white">
            <div className="flex items-center justify-between mb-1">
              <span
                className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
                style={{ fontSize: 15 }}
              >
                Ventas y compras
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#142A4E]" />
                  <span className="text-[12px] text-[#6E7079]">Ventas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#90ACD0]" />
                  <span className="text-[12px] text-[#6E7079]">Compras</span>
                </div>
              </div>
            </div>
            <p className="text-[12px] text-[#9B9CA3] mb-3">
              Últimos 12 meses · valores en ARS
            </p>
            <InlineSVGChart data={resumenChartData} />
          </div>

          {/* ── Notificaciones ── */}
          <div className="px-7 py-6 bg-white">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <Bell
                className="shrink-0"
                style={{ width: 15, height: 15, stroke: '#3E404A' }}
              />
              <span
                className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
                style={{ fontSize: 15 }}
              >
                Notificaciones
              </span>
              {unreadCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#c0392b] text-white text-[11px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>

            {loadingNotifs ? (
              <div className="flex items-center gap-2 h-16 text-[#9B9CA3]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[13.5px]">Cargando…</span>
              </div>
            ) : unreadNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 44,
                    height: 44,
                    background: '#E6F0EA',
                  }}
                >
                  <Check
                    style={{ width: 22, height: 22, stroke: '#2f7d55' }}
                  />
                </div>
                <p className="text-[13.5px] text-[#6E7079] text-center">
                  Sin notificaciones pendientes
                </p>
              </div>
            ) : (
              <div
                className="flex flex-col gap-2 overflow-y-auto"
                style={{ maxHeight: 340 }}
              >
                {unreadNotifications.map((notif: any) => (
                  <div
                    key={notif.id}
                    className="flex items-start gap-3 p-3 rounded-[10px] hover:bg-[#F7F6F2] transition-colors cursor-pointer border border-transparent hover:border-[#ECEAE3]"
                    onClick={() => {
                      setSelectedNotif(notif);
                      setNotifModalOpen(true);
                    }}
                  >
                    {/* Icon */}
                    <div className="shrink-0 mt-[2px]">
                      <Mail
                        style={{
                          width: 15,
                          height: 15,
                          stroke: '#142A4E',
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-[#12131A] truncate">
                        {notif.profileName ?? notif.clientName ?? 'AFIP'}
                      </div>
                      <div
                        className="text-[12.5px] text-[#6E7079] mt-[2px]"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }}
                      >
                        {notif.aiSummary ?? notif.message ?? '—'}
                      </div>
                      <div className="flex items-center gap-1 mt-[5px]">
                        <CalendarIcon
                          style={{
                            width: 11,
                            height: 11,
                            stroke: '#B4B3AC',
                          }}
                        />
                        <span
                          className="font-[family-name:var(--ff-mono)] text-[#B4B3AC]"
                          style={{ fontSize: 11.5 }}
                        >
                          {notif.publicationDate
                            ? format(new Date(notif.publicationDate), 'dd MMM yyyy', { locale: es })
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Mark read button */}
                    <button
                      className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full hover:bg-[#E6F0EA] transition-colors"
                      title="Marcar como leída"
                      onClick={(e) => {
                        e.stopPropagation();
                        markOpenedMutation.mutate(notif.id);
                      }}
                    >
                      <Check
                        style={{ width: 13, height: 13, stroke: '#2f7d55' }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Cierre de ejercicio ── */}
        <div className="px-7 py-6 border-t border-[#ECEAE3] bg-[#F7F6F2]">
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <BookOpen
              className="shrink-0"
              style={{ width: 15, height: 15, stroke: '#3E404A' }}
            />
            <span
              className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
              style={{ fontSize: 15 }}
            >
              Cierre de ejercicio
            </span>
            {loadingBalanceConfig && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9B9CA3] ml-1" />
            )}
          </div>

          {/* Form grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {/* Mes de cierre */}
            <div>
              <label className="block text-[11px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[7px]">
                Mes de cierre
              </label>
              <select
                value={balanceMonth}
                onChange={(e) => setBalanceMonth(e.target.value)}
                className="w-full border border-[#DFDCD3] rounded-[10px] px-[13px] py-[10px] text-[13.5px] text-[#12131A] bg-white outline-none focus:border-[#9B9CA3] transition-colors appearance-none"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Día de cierre */}
            <div>
              <label className="block text-[11px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[7px]">
                Día de cierre
              </label>
              <select
                value={balanceDay}
                onChange={(e) => setBalanceDay(e.target.value)}
                className="w-full border border-[#DFDCD3] rounded-[10px] px-[13px] py-[10px] text-[13.5px] text-[#12131A] bg-white outline-none focus:border-[#9B9CA3] transition-colors appearance-none"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Días para presentación */}
            <div>
              <label className="block text-[11px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[7px]">
                Días para presentación
              </label>
              <input
                type="number"
                placeholder="Opcional"
                value={balancePresentationDays}
                onChange={(e) => setBalancePresentationDays(e.target.value)}
                className="w-full border border-[#DFDCD3] rounded-[10px] px-[13px] py-[10px] text-[13.5px] text-[#12131A] bg-white outline-none focus:border-[#9B9CA3] transition-colors placeholder:text-[#9B9CA3]"
              />
            </div>

            {/* Alertas */}
            <div>
              <label className="block text-[11px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[7px]">
                Alertas (días antes)
              </label>
              <input
                type="text"
                placeholder="60, 30, 15, 7"
                value={balanceAlertDays}
                onChange={(e) => setBalanceAlertDays(e.target.value)}
                className="w-full border border-[#DFDCD3] rounded-[10px] px-[13px] py-[10px] text-[13.5px] text-[#12131A] bg-white outline-none focus:border-[#9B9CA3] transition-colors placeholder:text-[#9B9CA3]"
              />
            </div>
          </div>

          {/* Save button */}
          <button
            className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors disabled:opacity-50"
            disabled={upsertBalanceMutation.isPending}
            onClick={() => upsertBalanceMutation.mutate()}
          >
            {upsertBalanceMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </button>
        </div>
      </div>

      {/* ── Notification detail modal ── */}
      {notifModalOpen && selectedNotif && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          style={{ background: 'rgba(18,19,26,.45)', padding: '56px 24px' }}
          onClick={() => setNotifModalOpen(false)}
        >
          <div
            className="w-[640px] max-w-full bg-white border border-[#DFDCD3] rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 12px 40px rgba(18,19,26,.22)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-7 py-5 border-b border-[#ECEAE3] bg-white">
              <div className="flex items-center gap-3">
                <Mail
                  style={{ width: 16, height: 16, stroke: '#142A4E' }}
                />
                <h2
                  className="font-[family-name:var(--ff-display)] font-semibold text-[#12131A]"
                  style={{ fontSize: 18 }}
                >
                  Notificación AFIP
                </h2>
              </div>
              <button
                className="flex items-center justify-center w-[34px] h-[34px] bg-white border border-[#DFDCD3] rounded-[10px] hover:bg-[#FBFAF6] transition-colors"
                onClick={() => setNotifModalOpen(false)}
              >
                <X className="h-4 w-4 stroke-[#3E404A]" />
              </button>
            </div>

            {/* Body */}
            <div className="px-7 py-6 space-y-5">
              {/* Profile */}
              <div>
                <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[5px]">
                  PERFIL
                </div>
                <p className="text-[14.5px] font-semibold text-[#12131A]">
                  {selectedNotif.profileName ?? selectedNotif.clientName ?? '—'}
                </p>
                {selectedNotif.profileIdentityNumber && (
                  <p className="text-[12.5px] text-[#9B9CA3] font-[family-name:var(--ff-mono)] mt-[2px]">
                    CUIT: {selectedNotif.profileIdentityNumber}
                  </p>
                )}
              </div>

              {/* Date */}
              <div>
                <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[5px]">
                  FECHA DE PUBLICACIÓN
                </div>
                <p className="text-[14px] text-[#12131A] tabular-nums">
                  {selectedNotif.publicationDate
                    ? format(new Date(selectedNotif.publicationDate), "dd 'de' MMMM yyyy", { locale: es })
                    : '—'}
                </p>
              </div>

              {/* Category / severity */}
              {(selectedNotif.category || selectedNotif.severity) && (
                <div className="flex items-center gap-3">
                  {selectedNotif.category && (
                    <span className="inline-block text-[12px] font-medium text-[#3E404A] bg-[#F2F1EB] border border-[#E4E1D9] rounded-full px-[11px] py-[3px]">
                      {selectedNotif.category}
                    </span>
                  )}
                  {selectedNotif.severity && (
                    <span className="inline-block text-[12px] font-medium text-[#3E404A] bg-[#F2F1EB] border border-[#E4E1D9] rounded-full px-[11px] py-[3px]">
                      {selectedNotif.severity}
                    </span>
                  )}
                </div>
              )}

              {/* AI Summary */}
              {selectedNotif.aiSummary && (
                <div>
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[5px]">
                    RESUMEN
                  </div>
                  <p className="text-[14px] text-[#3E404A] leading-relaxed">
                    {selectedNotif.aiSummary}
                  </p>
                </div>
              )}

              {/* Message */}
              {selectedNotif.message && (
                <div>
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[5px]">
                    MENSAJE ORIGINAL
                  </div>
                  <p className="text-[13.5px] text-[#6E7079] leading-relaxed whitespace-pre-wrap">
                    {selectedNotif.message}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-7 py-4 bg-[#FBFAF6] border-t border-[#ECEAE3]">
              <button
                className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors disabled:opacity-50"
                disabled={markOpenedMutation.isPending}
                onClick={() => {
                  markOpenedMutation.mutate(selectedNotif.id);
                  setNotifModalOpen(false);
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Marcar como leída
              </button>
              <button
                className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] text-[13.5px] font-semibold text-[#3E404A] rounded-[10px] px-[15px] py-[9px] hover:bg-[#FBFAF6] transition-colors"
                onClick={() => setNotifModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

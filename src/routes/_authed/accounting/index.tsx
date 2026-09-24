import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { listOrgModules } from '@/actions/admin';
import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  Fragment,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronsDownUp,
  FileText,
  Scale,
  BookOpen,
  List,
  Inbox,
  TrendingUp,
  Percent,
  FileBarChart,
  ScrollText,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  Building2,
  Layers,
  Lock,
  CalendarDays,
  CalendarPlus,
  LockOpen,
  History,
  Copy,
  Ban,
  Download,
  FileSpreadsheet,
  Workflow,
  Power,
  Upload,
  HelpCircle,
  Lightbulb,
  Zap,
  RefreshCw,
  CheckSquare,
  Square,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  XCircle,
  X,
  Check,
  Bookmark,
  BookmarkPlus,
  Eye,
  Loader2,
  GripVertical,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SelectorFecha } from '@/components/shared/selector-fecha';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { ArcaCard } from '@/components/dashboard/shared';
import { SaldosReferencia } from '@/components/accounting/SaldosReferencia';
import { OrdenDocumento } from '@/components/accounting/OrdenDocumento';
import { InformeAuditor } from '@/components/accounting/InformeAuditor';
import {
  fechaLarga,
  rangoAnexos,
  rangoNotas,
  fillAuditReport,
  AUDIT_REPORT_VARS,
  type AuditReportVars,
} from '@/lib/accounting-audit-report';
import { frameworkCite } from '@/lib/accounting-labels';
import {
  defaultNoteLayout,
  numberNotes,
  referenceForGroup,
  resolveDocumentLayout,
  anexoIMuestraComparativo,
  ANEXO_REFERENCE_BY_GROUP,
  type LayoutEntry,
} from '@/lib/accounting-document';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Ayuda } from '@/components/shared/ayuda';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIA_MOVIMIENTO_LABEL,
} from '@/lib/clasificar-movimiento';
import { Paginador } from '@/components/shared/paginador';
import { chipFiltro, LimpiarFiltros } from '@/components/shared/filtros';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TutorialReglas } from '@/components/accounting/TutorialReglas';
import { esClicEnTutorial } from '@/components/shared/tutorial';
import {
  analizarCuadreRegla,
  direccionSugeridaPorNombre,
} from '@/lib/accounting-invoice-posting';
import { BASES_POR_MODULO, type ModuloRegla } from '@/lib/accounting-reglas';
import {
  variablesDelBalance,
  missingVars,
} from '@/lib/accounting-audit-report';
import {
  leerNotasDeWord,
  plantillaNotasWord,
  PLANTILLA,
  type NotaImportada,
} from '@/lib/notas-word';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import {
  listAccountingClients,
  getCurrentRole,
  getChartOfAccounts,
  getAccountMovementCounts,
  setAccountActive,
  createCustomAccount,
  renameBaseAccount,
  revertBaseAccountRename,
  createBaseAccount,
  updateBaseAccount,
  deleteBaseAccount,
  deleteCustomAccount,
  getFiscalYears,
  createFiscalYear,
  getFiscalYearDetail,
  closePeriod,
  reopenPeriod,
  getAccountingLog,
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  voidJournalEntry,
  voidJournalEntries,
  resetFiscalYearInvoiceEntries,
  getJournalEntry,
  getPostableAccounts,
  getLedgerAccount,
  getLedgerConsolidated,
  getTrialBalance,
  getJournalBook,
  listMappingRules,
  getMappingRule,
  createMappingRule,
  updateMappingRule,
  setMappingRuleActive,
  importMappingRules,
  listClientesConReglasActivas,
  reorderMappingRules,
  type MappingRuleListRow,
  getInvoicePostingPreview,
  generateInvoiceEntries,
  regenerateEntriesForRule,
  regenerateInvoiceEntry,
  regenerateInvoiceEntries,
  getPendingReviewEntries,
  getFixedAssetAccounts,
  createFixedAsset,
  listFixedAssets,
  disposeFixedAsset,
  getAnexoI,
  getMembreteData,
  getCMV,
  saveCMV,
  getYearEndChecklist,
  getClosingWizard,
  approveClosingStage,
  sealClosing,
  getESP,
  getER,
  getEEPN,
  type EepnRow,
  getEFE,
  getAnexoII,
  getAuditLog,
  getFinancialStatement,
  saveFinancialStatementNotes,
  approveFinancialStatement,
  reopenFinancialStatement,
  saveFinancialStatementPdf,
  type ChartAccount,
  type PeriodView,
  type LedgerRow,
  type ConsolidatedAccount,
  type PendingReviewEntry,
  type FixedAssetRow,
  type YearEndCheck,
  type ClosingEntryPreview,
  type EspSection,
  type EspRubro,
  type ErLine,
  type AnexoIIFunction,
  type FsNote,
  type AuditEventType,
  type AuditLogEntry,
  type JournalEntryListRow,
  listJournalTemplates,
  saveJournalTemplate,
  deleteJournalTemplate,
  type JournalTemplate,
  updateClientFiscalData,
} from '@/actions/accounting';
import {
  exportMayorExcel,
  exportMayorPdf,
  exportBalanceExcel,
  exportBalancePdf,
  exportLibroDiarioPdf,
  exportAnexoIPdf,
  exportAnexoIExcel,
  exportCmvPdf,
  exportCmvExcel,
  exportEeccPackagePdf,
  exportEstadosExcel,
  exportLibroMayorPdf,
  exportLibroInventariosPdf,
  type MayorExportData,
  type MayorSection,
  type AnexoIExportData,
  type CmvExportData,
} from '@/lib/mayor-export';
import {
  downloadChartTemplate,
  type ChartTemplateAccount,
} from '@/lib/accounting-chart-template';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ImportarPlanDialog } from '@/components/accounting/ImportarPlanDialog';
import {
  ACCOUNT_GROUP_LABELS,
  ACCOUNT_GROUP_SECTIONS,
  ACCOUNT_TYPE_LABELS,
  EXPECTED_BALANCE_LABELS,
  EXPENSE_FUNCTION_LABELS,
  CUSTOM_SEGMENT_START,
  MONTH_NAMES,
  FISCAL_YEAR_STATUS_LABELS,
  JOURNAL_ORIGIN_LABELS,
  MAPPING_SOURCE_LABELS,
  MAPPING_RULE_TYPE_LABELS,
  MAPPING_SIDE_LABELS,
  MAPPING_AMOUNT_BASIS_LABELS,
  etiquetaBase,
  FIXED_ASSET_CATEGORY_LABELS,
  FIXED_ASSET_STATUS_LABELS,
  FIXED_ASSET_DISPOSAL_REASON_LABELS,
  type AccountGroup,
  type JournalOrigin,
} from '@/lib/accounting-labels';
import { monthlyDepreciation } from '@/lib/accounting-depreciation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { IndicesInflacion } from '@/components/accounting/IndicesInflacion';
import { AjustePorInflacion } from '@/components/accounting/AjustePorInflacion';
import { mandaEnElEstudio } from '@/lib/permissions';

const TAB_IDS = [
  'plan',
  'ejercicios',
  'asientos',
  'mayor',
  'balance',
  'reglas',
  'contabilizar',
  'pendientes',
  'bienes',
  'indices',
  'ajuste',
  'estados',
  'auditoria',
] as const;
type Tab = (typeof TAB_IDS)[number];

/** Permite entrar directo a una empresa/solapa (ej. desde el cierre de sueldos). */
const accountingSearchSchema = z.object({
  clientId: z.string().uuid().optional(),
  tab: z.enum(TAB_IDS).optional(),
});
type AccountingSearch = z.infer<typeof accountingSearchSchema>;

/**
 * Ejercicio que se muestra cuando el usuario todavía no eligió ninguno.
 *
 * Los de referencia quedan afuera: existen solo para alimentar la columna
 * comparativa y están en estado «abierto», así que sin esto se llevaban el
 * lugar del ejercicio que la empresa está liquidando de verdad.
 */
function defaultFiscalYearId(
  years: { id: string; estado: string; soloReferencia?: boolean }[]
): string {
  return (
    years.find((y) => y.estado === 'abierto' && !y.soloReferencia)?.id ??
    years.find((y) => !y.soloReferencia)?.id ??
    years[0]?.id ??
    ''
  );
}

export const Route = createFileRoute('/_authed/accounting/')({
  validateSearch: accountingSearchSchema,
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled =
      modules.find((m) => m.module === 'contabilidad')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: AccountingPage,
});

/* ─── Shared styles ─── */
/** El `focus:outline-none` pelado dejaba los inputs sin ninguna marca de
 *  foco: ahora toman el borde y el anillo de acento del sistema. */
const INPUT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border-strong)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] outline-none transition-[color,box-shadow] focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)]';

/* ─── Barra de filtros y acciones ─── */

/**
 * Las barras que van arriba de las tablas se leen en tres zonas: a la
 * izquierda lo que achica lo que se ve (filtros), a la derecha lo que se hace
 * (vista y acciones), y una línea que las separa.
 *
 * Antes los filtros iban en un renglón y todo lo demás en otro, pegado a la
 * derecha: la segunda línea juntaba controles de vista, operaciones masivas y
 * la acción principal sin nada que los distinguiera, y el hueco de la
 * izquierda la hacía leer como una tira suelta.
 */
const TOOLBAR_BTN =
  'flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors';
/** Solo icono: los controles de vista se repiten en cada pantalla y el rótulo
 *  costaba el ancho que necesitaban los filtros. El nombre va en el `title`. */
const TOOLBAR_ICON_BTN =
  'flex items-center justify-center h-7 w-7 rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors';

/* ─── Badges ─── */
function TypeBadge({ type }: { type: 'imputable' | 'grupo' }) {
  const color =
    type === 'imputable' ? 'oklch(0.45 0.10 220)' : 'oklch(0.50 0.02 260)';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 88%)`,
        color,
      }}
    >
      {ACCOUNT_TYPE_LABELS[type]}
    </span>
  );
}

function OriginBadge({ scope }: { scope: 'base' | 'propia' }) {
  const color =
    scope === 'propia' ? 'oklch(0.50 0.13 50)' : 'oklch(0.45 0.04 250)';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 88%)`,
        color,
      }}
    >
      {scope === 'propia' ? 'Propia' : 'Base'}
    </span>
  );
}

/* ─── Tab bar ─── */

/**
 * Las solapas van de más usada a menos usada, y los grupos también. Ese orden
 * es el que decide qué queda a la vista: cuando no entran todas, el desborde
 * come desde el final, así que lo que cae en «Más» es lo que menos se abre.
 *
 * El criterio, de mayor a menor: lo de todos los días (registrar asientos,
 * contabilizar comprobantes, resolver pendientes), lo que se consulta seguido
 * (mayor y balance), lo del cierre —intenso, pero una vez por ejercicio—, la
 * configuración —que se arma al dar de alta la empresa y después casi no se
 * toca— y al final el log de auditoría, de solo lectura, que se mira cuando
 * algo salió mal.
 *
 * Los grupos se separan con una línea; no llevan rótulo porque costaría el
 * renglón que estamos tratando de ahorrar.
 *
 * En módulo y no adentro del componente para que la lista sea estable: la
 * medición del ancho depende de ella y rehacerla en cada render la dispararía
 * de nuevo cada vez.
 */
const SOLAPAS: {
  id: Tab;
  label: string;
  grupo: string;
  icon: React.ElementType;
  ready: boolean;
  ownerOnly?: boolean;
}[] = [
  {
    id: 'asientos',
    label: 'Asientos',
    grupo: 'Registración',
    icon: FileText,
    ready: true,
  },
  // Las reglas de mapeo son las que arman los asientos automáticos, así que
  // van pegadas a Asientos y antes de Contabilizar, que es quien las aplica.
  {
    id: 'reglas',
    label: 'Reglas',
    grupo: 'Registración',
    icon: Workflow,
    ready: true,
  },
  {
    id: 'contabilizar',
    label: 'Contabilizar',
    grupo: 'Registración',
    icon: Zap,
    ready: true,
  },
  // Pendientes trae un contador que reclama atención: no debería esconderse.
  {
    id: 'pendientes',
    label: 'Pendientes',
    grupo: 'Registración',
    icon: Inbox,
    ready: true,
  },
  {
    id: 'mayor',
    label: 'Mayor',
    grupo: 'Consulta',
    icon: BookOpen,
    ready: true,
  },
  {
    id: 'balance',
    label: 'Balance',
    grupo: 'Consulta',
    icon: Scale,
    ready: true,
  },
  {
    id: 'estados',
    label: 'Estados Contables',
    grupo: 'Cierre',
    icon: FileBarChart,
    ready: true,
  },
  {
    id: 'ajuste',
    label: 'Ajuste por inflación',
    grupo: 'Cierre',
    icon: Percent,
    ready: true,
  },
  {
    id: 'bienes',
    label: 'Bienes de uso',
    grupo: 'Cierre',
    icon: Boxes,
    ready: true,
  },
  // La serie la carga el cron mensual: se entra solo si falta un mes.
  {
    id: 'indices',
    label: 'Índices',
    grupo: 'Cierre',
    icon: TrendingUp,
    ready: true,
  },
  {
    id: 'plan',
    label: 'Plan de cuentas',
    grupo: 'Configuración',
    icon: List,
    ready: true,
  },
  {
    id: 'ejercicios',
    label: 'Ejercicios',
    grupo: 'Configuración',
    icon: CalendarDays,
    ready: true,
  },
  {
    id: 'auditoria',
    label: 'Auditoría',
    grupo: 'Control',
    icon: ScrollText,
    ready: true,
    ownerOnly: true,
  },
];

function TabBar({
  active,
  onChange,
  pendingCount = 0,
  isOwner = false,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  pendingCount?: number;
  isOwner?: boolean;
}) {
  const solapas = useMemo(
    () => SOLAPAS.filter((t) => !t.ownerOnly || isOwner),
    [isOwner]
  );

  const barRef = useRef<HTMLDivElement>(null);
  const medidorRef = useRef<HTMLDivElement>(null);
  /** Cuántas entran en el renglón; el resto cae en «Más». */
  const [entran, setEntran] = useState(solapas.length);

  /**
   * Cuántas solapas entran se resuelve midiendo, no adivinando: los rótulos
   * son de ancho variable y el ancho útil depende de la ventana.
   *
   * Se mide sobre una copia oculta que siempre tiene las trece. Medir sobre
   * las visibles se realimentaría —esconder una agranda el sobrante, que
   * vuelve a mostrarla— y la barra quedaría parpadeando.
   */
  useLayoutEffect(() => {
    const bar = barRef.current;
    const medidor = medidorRef.current;
    if (!bar || !medidor) return;

    const recalcular = () => {
      const anchos = Array.from(medidor.children).map(
        (c) => c.getBoundingClientRect().width
      );
      // El último hijo del medidor es el botón «Más».
      const anchoMas = anchos[anchos.length - 1] ?? 0;
      const anchoSolapa = anchos.slice(0, solapas.length);
      const disponible = bar.getBoundingClientRect().width;
      const GAP = 4;

      const extra = (i: number) => anchoSolapa[i] + (i === 0 ? 0 : GAP);

      const todas = anchoSolapa.reduce((s, _, i) => s + extra(i), 0);
      if (todas <= disponible) {
        setEntran(solapas.length);
        return;
      }

      // Con «Más» en pantalla hay menos lugar, y la solapa activa tiene que
      // entrar sí o sí: sin ella no queda ninguna señal de dónde estás.
      const iActiva = solapas.findIndex((t) => t.id === active);
      let usado = anchoMas + GAP;
      let n = 0;
      for (let i = 0; i < solapas.length; i++) {
        const reservaActiva =
          iActiva > -1 && iActiva >= i ? anchoSolapa[iActiva] + GAP : 0;
        if (usado + extra(i) + reservaActiva > disponible) break;
        usado += extra(i);
        n = i + 1;
      }
      setEntran(n);
    };

    recalcular();
    const ro = new ResizeObserver(recalcular);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [solapas, active]);

  const enBarra = solapas.slice(0, entran);
  const desbordan = solapas.slice(entran);
  // La activa se muestra siempre, aunque le tocara caer en el menú. Y si se
  // promueve a la barra sale del menú: figurar en los dos lados la duplica.
  const activaEscondida = desbordan.find((t) => t.id === active);
  const mostradas = activaEscondida ? [...enBarra, activaEscondida] : enBarra;
  const enMenu = activaEscondida
    ? desbordan.filter((t) => t.id !== active)
    : desbordan;

  /**
   * Tab de sección: subrayada, no un bloque de tinta.
   *
   * El subrayado se apoya en el borde de 1px de la barra —de ahí el
   * `-mb-1.5`, que lo baja a esa línea— y por eso antes "colgaba": le
   * faltaba el borde del contenedor, que hoy sí está.
   */
  const claseSolapa =
    'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 pb-2 -mb-1.5 text-[13px] transition-colors duration-[120ms]';
  const claseActiva = (id: Tab) =>
    active === id
      ? 'border-[var(--arca-accent)] font-semibold text-[var(--arca-ink)]'
      : 'font-medium text-[var(--arca-ink-3)] hover:text-[var(--arca-ink-2)]';

  const contenido = (tab: (typeof solapas)[number]) => (
    <>
      <tab.icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
      {tab.label}
      {tab.id === 'pendientes' && pendingCount > 0 && (
        <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]">
          {pendingCount}
        </span>
      )}
      {!tab.ready && (
        <span className="text-[9px] px-1 py-px rounded-full bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
          pronto
        </span>
      )}
    </>
  );

  return (
    /**
     * Trece solapas no entran en un renglón. Scrollear de costado dejaba la
     * activa fuera de la pantalla —la única señal de dónde estabas parado— y
     * envolver costaba un renglón entero. Ahora entran las que entran y el
     * resto cae en «Más», con la activa siempre presente.
     *
     * Sin iconos: eran 260px de los 572 que sobraban, y en un monitor de 1920
     * alcanzan para que las trece entren sin abrir el menú.
     */
    <div
      ref={barRef}
      className="relative flex items-center gap-1 mb-5 pb-1.5 border-b border-[var(--arca-border)]"
    >
      {mostradas.map((tab) => (
        <Fragment key={tab.id}>
          <button
            onClick={() => onChange(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
            title={`${tab.grupo} · ${tab.label}`}
            className={cn(claseSolapa, claseActiva(tab.id))}
          >
            {contenido(tab)}
          </button>
        </Fragment>
      ))}

      {enMenu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`${claseSolapa} ml-auto text-[var(--arca-ink-3)]`}
              title="Solapas que no entran en el ancho de la ventana"
            >
              Más
              <ChevronDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {enMenu.map((tab, i) => (
              <Fragment key={tab.id}>
                {i > 0 && tab.grupo !== enMenu[i - 1].grupo && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuItem onSelect={() => onChange(tab.id)}>
                  <tab.icon
                    className="w-3.5 h-3.5 shrink-0 text-[var(--arca-ink-3)]"
                    strokeWidth={2}
                  />
                  {tab.label}
                  {tab.id === 'pendientes' && pendingCount > 0 && (
                    <span className="ml-auto rounded-full bg-[var(--arca-accent-neg-bg)] px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-[var(--arca-accent-neg-fg)] [font-family:var(--ff-mono)]">
                      {pendingCount}
                    </span>
                  )}
                </DropdownMenuItem>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Copia oculta para medir: siempre con las trece y el botón «Más».
          Va dentro de una caja de 0×0 recortada porque mide más que la barra
          y, aun siendo absoluta, su desborde le agregaba scroll horizontal a
          todo el módulo. `w-max` para que las solapas conserven su ancho
          natural pese a que el contenedor mida cero. */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-0 w-0 overflow-hidden pointer-events-none"
      >
        <div ref={medidorRef} className="flex items-center w-max">
          {solapas.map((tab) => (
            <span key={tab.id} className={claseSolapa}>
              {contenido(tab)}
            </span>
          ))}
          <span className={claseSolapa}>
            Más
            <ChevronDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
function AccountingPage() {
  const search = Route.useSearch();
  // Guarda en runtime: el search viene de la URL, puede traer cualquier cosa.
  const [tab, setTab] = useState<Tab>(() => {
    const t = String(search.tab ?? '');
    // Se entra por la primera solapa, que es la más usada. Antes se entraba
    // por «Plan de cuentas», que quedó entre las que menos se abren: al
    // ordenar por uso, la de arranque terminaba promovida al extremo derecho.
    return (TAB_IDS as readonly string[]).includes(t)
      ? (t as Tab)
      : SOLAPAS[0].id;
  });
  // `Route.useNavigate()` y no `useNavigate()`: el primero conoce el schema de
  // search de esta ruta, así que el updater `(prev) => ({...prev, clientId})`
  // tipa. Con el genérico, TypeScript no puede inferirlo y se queja.
  const navigate = Route.useNavigate();
  const [recordado, recordarCliente] = useClienteSeleccionado();
  // La URL manda si la trae: un link compartido tiene que abrir en la empresa
  // del link, no en la última que miró quien lo abre. Si no, el recordado.
  const [clientId, setClientId] = useState<string>(() =>
    String(search.clientId ?? '')
  );

  const { data: clients = [] } = useQuery({
    queryKey: ['accounting', 'clients'],
    queryFn: () => listAccountingClients(),
  });
  const { data: roleData } = useQuery({
    queryKey: ['accounting', 'role'],
    queryFn: () => getCurrentRole(),
  });
  const isOwner = mandaEnElEstudio(roleData?.role);

  /**
   * El recordado solo vale si sigue en la lista: un cliente dado de baja, o
   * uno de otra organización tras cambiar de cuenta, no debe resucitar. Es el
   * caso de borde que pide el ticket («un cliente que se da de baja mientras
   * estaba seleccionado no debe romper la sesión activa»).
   */
  const recordadoValido =
    recordado && clients.some((c) => c.id === recordado) ? recordado : '';

  const effectiveClientId = clientId || recordadoValido || clients[0]?.id || '';

  // Si se entró sin `clientId` en la URL, dejarlo puesto una vez resuelto:
  // así la solapa que se abra después comparte la misma empresa y el link
  // sigue siendo compartible.
  useEffect(() => {
    if (!effectiveClientId) return;
    if (search.clientId === effectiveClientId) return;
    void navigate({
      search: (prev: AccountingSearch) => ({
        ...prev,
        clientId: effectiveClientId,
      }),
      replace: true,
    });
  }, [effectiveClientId, search.clientId, navigate]);

  // TIN-1425: la selección se recuerda entre módulos, no solo entre solapas.
  const handleClientChange = (v: string) => {
    setClientId(v);
    recordarCliente(v);
    void navigate({
      search: (prev: AccountingSearch) => ({ ...prev, clientId: v }),
    });
  };

  const { data: pendingEntries = [] } = useQuery({
    queryKey: ['accounting', 'pending-review', effectiveClientId],
    queryFn: () =>
      getPendingReviewEntries({ data: { clientId: effectiveClientId } }),
    enabled: !!effectiveClientId,
  });

  // TIN-1425: opciones para el buscador de clientes.
  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.name} · ${c.identityNumber}`,
  }));

  return (
    <PageShell>
      <PageHeader
        title="Balances y Estados Contables"
        subtitle="Plan de cuentas, libro diario, mayor y Estados Contables"
        actions={
          <div className="flex items-center gap-2">
            <Building2
              className="w-4 h-4 text-[var(--arca-ink-3)]"
              strokeWidth={1.8}
            />
            <SearchableSelect
              options={clientOptions}
              value={effectiveClientId}
              onValueChange={handleClientChange}
              placeholder="Sin empresas"
              searchPlaceholder="Buscar empresa…"
              emptyMessage="No se encontraron empresas"
              width={300}
            />
          </div>
        }
      />

      <TabBar
        active={tab}
        onChange={setTab}
        pendingCount={pendingEntries.length}
        isOwner={isOwner}
      />

      {!effectiveClientId ? (
        <ArcaCard>
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay empresas fiscales cargadas en el estudio.
          </div>
        </ArcaCard>
      ) : tab === 'plan' ? (
        <PlanDeCuentas clientId={effectiveClientId} isOwner={isOwner} />
      ) : tab === 'ejercicios' ? (
        <Ejercicios
          clientId={effectiveClientId}
          isOwner={isOwner}
          onGoToPending={() => setTab('pendientes')}
        />
      ) : tab === 'asientos' ? (
        <Asientos
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          isOwner={isOwner}
        />
      ) : tab === 'mayor' ? (
        <Mayor
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
        />
      ) : tab === 'balance' ? (
        <Balance
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
        />
      ) : tab === 'reglas' ? (
        <Reglas
          clientId={effectiveClientId}
          isOwner={isOwner}
          clients={clients}
        />
      ) : tab === 'contabilizar' ? (
        <Contabilizar
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          isOwner={isOwner}
        />
      ) : tab === 'pendientes' ? (
        <Pendientes
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          onGoToReglas={() => setTab('reglas')}
        />
      ) : tab === 'bienes' ? (
        <BienesDeUso
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
        />
      ) : tab === 'indices' ? (
        <IndicesInflacion isOwner={isOwner} />
      ) : tab === 'ajuste' ? (
        <AjustePorInflacion
          clientId={effectiveClientId}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
          isOwner={isOwner}
        />
      ) : tab === 'estados' ? (
        <EstadosContables
          clientId={effectiveClientId}
          isOwner={mandaEnElEstudio(roleData?.role)}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
          clientCuit={
            clients.find((c) => c.id === effectiveClientId)?.identityNumber ??
            ''
          }
        />
      ) : tab === 'auditoria' && isOwner ? (
        <AuditoriaView clientId={effectiveClientId} />
      ) : (
        <ArcaCard>
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Esta sección se construye en una fase próxima del módulo.
          </div>
        </ArcaCard>
      )}
    </PageShell>
  );
}

/* ─── Plan de cuentas ─── */
type FormMode =
  | { kind: 'custom' }
  | { kind: 'base-create' }
  | { kind: 'base-edit'; account: ChartAccount };

/**
 * Mapea el plan efectivo al formato de la plantilla Excel (para "Plan actual").
 * Exporta solo el plan base del estudio: excluye la clase de sistema "0" y las
 * cuentas propias (scope custom, rango 9.x), que se gestionan por empresa y no
 * se pueden reimportar al plan base.
 */
function accountsToTemplate(accounts: ChartAccount[]): ChartTemplateAccount[] {
  return accounts
    .filter(
      (a) => a.scope !== 'propia' && a.code !== '0' && !a.code.startsWith('0.')
    )
    .map((a) => ({
      code: a.code,
      name: a.name,
      type: a.type,
      accountGroup: a.accountGroup,
      expectedBalance: a.expectedBalance as
        | 'deudor'
        | 'acreedor'
        | 'ambos'
        | null,
      expenseFunction: a.expenseFunction,
      description: a.description,
    }));
}

function PlanDeCuentas({
  clientId,
  isOwner,
}: {
  clientId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [rubro, setRubro] = useState<string>('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [origin, setOrigin] = useState<'all' | 'base' | 'propia'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChartAccount | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ChartAccount | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const queryKey = ['accounting', 'chart', clientId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getChartOfAccounts({ data: { clientId } }),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const accounts = data?.accounts ?? [];

  const setActiveMut = useMutation({
    mutationFn: (args: { accountId: string; isActive: boolean }) =>
      setAccountActive({ data: { clientId, ...args } }),
    onSuccess: () => {
      invalidate();
      setDeactivateTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* Build hierarchy maps */
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, ChartAccount[]>();
    for (const a of accounts) {
      const key = a.parentId;
      const list = m.get(key) ?? [];
      list.push(a);
      m.set(key, list);
    }
    return m;
  }, [accounts]);

  const byId = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const filterActive =
    !!search.trim() || !!rubro || onlyActive || origin !== 'all';

  /* Compute which accounts are visible under the active filters (matches + ancestors) */
  const visibleIds = useMemo(() => {
    if (!filterActive) return null; // null = show all
    const q = search.trim().toLowerCase();
    const matches = accounts.filter((a) => {
      if (
        q &&
        !a.code.toLowerCase().includes(q) &&
        !a.name.toLowerCase().includes(q)
      )
        return false;
      if (rubro && a.accountGroup !== rubro) return false;
      if (onlyActive && !a.isActive) return false;
      if (origin !== 'all' && a.scope !== origin) return false;
      return true;
    });
    const ids = new Set<string>();
    for (const m of matches) {
      ids.add(m.id);
      let p = m.parentId;
      while (p && !ids.has(p)) {
        ids.add(p);
        p = byId.get(p)?.parentId ?? null;
      }
    }
    return ids;
  }, [accounts, search, rubro, onlyActive, origin, filterActive, byId]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Con todo abierto el botón colapsa; si no, expande. Eran dos botones
   *  seguidos donde uno siempre sobraba. */
  const todoExpandido = accounts.length > 0 && expanded.size >= accounts.length;
  const alternarArbol = () =>
    setExpanded(todoExpandido ? new Set() : new Set(accounts.map((a) => a.id)));

  /** Cuántos filtros están puestos, para ofrecer limpiarlos. */
  const filtrosPuestos =
    (search ? 1 : 0) +
    (rubro ? 1 : 0) +
    (origin !== 'all' ? 1 : 0) +
    (onlyActive ? 1 : 0);

  function onToggleActive(account: ChartAccount) {
    if (account.isActive) {
      // Desactivar → confirmación con conteo de movimientos.
      setDeactivateTarget(account);
    } else {
      setActiveMut.mutate({ accountId: account.id, isActive: true });
    }
  }

  /* Recursive row renderer */
  function renderNode(account: ChartAccount, depth: number): React.ReactNode {
    if (visibleIds && !visibleIds.has(account.id)) return null;
    const children = childrenByParent.get(account.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded =
      expanded.has(account.id) || (filterActive && visibleIds?.has(account.id));
    // El rubro de sistema ("0" y sus hijas) no se toca: ni desactivar, ni
    // renombrar, ni editar, ni borrar. Cubre también bases ya sembradas donde
    // el grupo "0" quedó sin isSystemAccount.
    const isProtected =
      account.isSystemAccount ||
      account.code === '0' ||
      account.code.startsWith('0.');

    return (
      <div key={account.id}>
        <div
          className="group flex items-center gap-2.5 px-4 py-2 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
          style={{ paddingLeft: `${16 + depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(account.id)}
              className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" strokeWidth={1.8} />
              ) : (
                <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
              )}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          <span className="w-24 shrink-0 text-[11.5px] font-mono text-[var(--arca-ink-3)]">
            {account.code}
          </span>

          <span
            className={`flex-1 min-w-0 truncate text-[13px] ${account.type === 'grupo' ? 'font-semibold' : 'font-medium'} ${
              account.isActive
                ? 'text-[var(--arca-ink)]'
                : 'text-[var(--arca-ink-3)] line-through'
            }`}
            title={
              account.isRenamed ? `Nombre base: ${account.baseName}` : undefined
            }
          >
            {account.name}
            {account.isRenamed && (
              <span className="ml-1.5 text-[10px] text-[var(--arca-ink-3)] font-normal">
                (renombrada)
              </span>
            )}
            {isProtected && (
              <Lock
                className="inline-block ml-1.5 w-3 h-3 text-[var(--arca-ink-3)] align-[-1px]"
                strokeWidth={1.8}
              />
            )}
          </span>

          {/* Rubro — columna fija */}
          <span className="hidden md:block w-[156px] shrink-0 truncate text-right text-[10.5px] text-[var(--arca-ink-3)]">
            {account.accountGroup
              ? ACCOUNT_GROUP_LABELS[account.accountGroup as AccountGroup]
              : ''}
          </span>

          {/* Movimientos — columna fija */}
          <span className="w-[60px] shrink-0 flex justify-center">
            {account.hasMovements && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  background:
                    'color-mix(in oklch, oklch(0.45 0.14 145), transparent 88%)',
                  color: 'oklch(0.40 0.14 145)',
                }}
                title="Tiene movimientos en el ejercicio actual"
              >
                con mov.
              </span>
            )}
          </span>

          {/* Tipo — columna fija */}
          <span className="w-[88px] shrink-0 flex justify-start">
            <TypeBadge type={account.type} />
          </span>

          {/* Origen — columna fija */}
          <span className="w-[52px] shrink-0 flex justify-start">
            <OriginBadge scope={account.scope} />
          </span>

          {isOwner && (
            <div className="w-[176px] shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Renombrar (solo cuentas base no protegidas) */}
              {account.scope === 'base' && !isProtected && (
                <>
                  <IconBtn
                    title="Renombrar para esta empresa"
                    onClick={() => setRenameTarget(account)}
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </IconBtn>
                  {account.isRenamed && (
                    <IconBtn
                      title="Revertir al nombre base"
                      onClick={() =>
                        revertBaseAccountRename({
                          data: { clientId, accountId: account.id },
                        })
                          .then(invalidate)
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </IconBtn>
                  )}
                </>
              )}
              {/* Editar / borrar cuenta base (plan del estudio) */}
              {account.scope === 'base' && !isProtected && (
                <>
                  <IconBtn
                    title="Editar en el plan base del estudio"
                    onClick={() => setFormMode({ kind: 'base-edit', account })}
                  >
                    <Layers className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </IconBtn>
                  <IconBtn
                    title="Borrar del plan base del estudio"
                    onClick={() => setDeleteTarget(account)}
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </IconBtn>
                </>
              )}
              {account.scope === 'propia' && (
                <IconBtn
                  title="Borrar cuenta propia"
                  onClick={() => setDeleteTarget(account)}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                </IconBtn>
              )}
              {/* Activar / desactivar */}
              {!isProtected && (
                <button
                  onClick={() => onToggleActive(account)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
                >
                  {account.isActive ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          )}
        </div>

        {isExpanded && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  const roots = childrenByParent.get(null) ?? [];

  return (
    <>
      {/* Filtros afuera de la card, todos de 32px y en una línea. */}
      <div className="mb-[10px] flex flex-wrap items-center gap-2">
        <div className="relative w-[240px]">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[var(--arca-ink-4)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código o nombre…"
            className={cn(INPUT_CLASS, 'h-8 w-full pl-7')}
          />
        </div>

        <Select
          value={rubro === '' ? 'all' : rubro}
          onValueChange={(v) => setRubro(v === 'all' ? '' : v)}
        >
          <SelectTrigger size="sm" className="w-[180px] data-[size=sm]:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los rubros</SelectItem>
            {ACCOUNT_GROUP_SECTIONS.map((sec) => (
              <SelectGroup key={sec.section}>
                <SelectLabel>{sec.section}</SelectLabel>
                {sec.groups.map((g) => (
                  <SelectItem key={g} value={g}>
                    {ACCOUNT_GROUP_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={origin}
          onValueChange={(v) => setOrigin(v as 'all' | 'base' | 'propia')}
        >
          <SelectTrigger size="sm" className="w-[150px] data-[size=sm]:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Base y propias</SelectItem>
            <SelectItem value="base">Solo base</SelectItem>
            <SelectItem value="propia">Solo propias</SelectItem>
          </SelectContent>
        </Select>

        {/* Chip, como "Incluir anulados" en Asientos. */}
        <button
          type="button"
          aria-pressed={onlyActive}
          onClick={() => setOnlyActive(!onlyActive)}
          className={chipFiltro(onlyActive)}
        >
          Solo activas
        </button>

        {filtrosPuestos > 0 && (
          <LimpiarFiltros
            onLimpiar={() => {
              setSearch('');
              setRubro('');
              setOrigin('all');
              setOnlyActive(false);
            }}
          />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={alternarArbol}
                aria-label={
                  todoExpandido ? 'Colapsar el árbol' : 'Expandir el árbol'
                }
                className={cn(TOOLBAR_ICON_BTN, 'size-8')}
              >
                {todoExpandido ? (
                  <ChevronsDownUp className="w-3.5 h-3.5" strokeWidth={2} />
                ) : (
                  <ChevronsUpDown className="w-3.5 h-3.5" strokeWidth={2} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {todoExpandido
                ? 'Colapsar todo el árbol'
                : 'Expandir todo el árbol'}
            </TooltipContent>
          </Tooltip>
          {isOwner && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(TOOLBAR_BTN, 'h-8')}>
                    <FileSpreadsheet className="w-3 h-3" strokeWidth={2} />
                    Importar / Exportar
                    <ChevronDown className="w-3 h-3" strokeWidth={2} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem
                    onClick={() =>
                      void downloadChartTemplate({
                        mode: 'blank',
                        label: 'estudio',
                      })
                    }
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <div className="flex flex-col">
                      <span>Plantilla vacía</span>
                      <span className="text-[11px] text-[var(--arca-ink-3)]">
                        Esqueleto de rubros para armar desde cero
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={accounts.length === 0}
                    onClick={() =>
                      void downloadChartTemplate({
                        mode: 'current',
                        accounts: accountsToTemplate(accounts),
                      })
                    }
                  >
                    <Download className="w-3.5 h-3.5" />
                    <div className="flex flex-col">
                      <span>Plan actual</span>
                      <span className="text-[11px] text-[var(--arca-ink-3)]">
                        El plan de hoy, para editar y reimportar
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload className="w-3.5 h-3.5" />
                    <div className="flex flex-col">
                      <span>Importar desde Excel</span>
                      <span className="text-[11px] text-[var(--arca-ink-3)]">
                        Cargar el plan desde una planilla
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFormMode({ kind: 'base-create' })}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <div className="flex flex-col">
                      <span>Nueva cuenta del plan base</span>
                      <span className="text-[11px] text-[var(--arca-ink-3)]">
                        Se agrega al plan que comparten las empresas
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setFormMode({ kind: 'custom' })}
                    aria-label="Nueva cuenta"
                    className="flex size-8 items-center justify-center rounded-[8px] bg-[var(--arca-accent)] text-white transition-opacity hover:opacity-90"
                  >
                    <Plus className="size-3.5" strokeWidth={2.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Nueva cuenta</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <ArcaCard>
        {/* Body */}
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando plan de cuentas…
          </div>
        ) : roots.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            El plan de cuentas base aún no está sembrado para este estudio.
          </div>
        ) : (
          <div>{roots.map((r) => renderNode(r, 0))}</div>
        )}
      </ArcaCard>

      {/* Importar plan de cuentas desde Excel */}
      <ImportarPlanDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        clientId={clientId}
        onImported={invalidate}
      />

      {/* Crear/editar cuenta */}
      {formMode && (
        <AccountFormDialog
          mode={formMode}
          clientId={clientId}
          accounts={accounts}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null);
            invalidate();
          }}
        />
      )}

      {/* Renombrar */}
      {renameTarget && (
        <RenameDialog
          clientId={clientId}
          account={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={() => {
            setRenameTarget(null);
            invalidate();
          }}
        />
      )}

      {/* Confirmar desactivación */}
      {deactivateTarget && (
        <DeactivateDialog
          clientId={clientId}
          account={deactivateTarget}
          pending={setActiveMut.isPending}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() =>
            setActiveMut.mutate({
              accountId: deactivateTarget.id,
              isActive: false,
            })
          }
        />
      )}

      {/* Confirmar borrado (cuenta propia o del plan base) */}
      {deleteTarget && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteTarget.scope === 'propia'
                  ? 'Borrar cuenta propia'
                  : 'Borrar cuenta del plan base'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                ¿Borrar la cuenta{' '}
                <strong>
                  {deleteTarget.code} · {deleteTarget.name}
                </strong>
                ?{' '}
                {deleteTarget.scope === 'propia'
                  ? 'No se puede borrar si tiene movimientos o subcuentas.'
                  : 'Afecta a todas las empresas del estudio. No se puede borrar si tiene movimientos en alguna empresa o subcuentas.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  (deleteTarget.scope === 'propia'
                    ? deleteCustomAccount({
                        data: { clientId, id: deleteTarget.id },
                      })
                    : deleteBaseAccount({ data: { id: deleteTarget.id } })
                  )
                    .then(() => {
                      toast.success('Cuenta borrada');
                      setDeleteTarget(null);
                      invalidate();
                    })
                    .catch((e: Error) => toast.error(e.message))
                }
              >
                Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] hover:bg-[var(--arca-surface)] transition-colors"
    >
      {children}
    </button>
  );
}

/* ─── Rename dialog (US 1.1.4) ─── */
function RenameDialog({
  clientId,
  account,
  onClose,
  onSaved,
}: {
  clientId: string;
  account: ChartAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account.name);
  const mut = useMutation({
    mutationFn: () =>
      renameBaseAccount({
        data: { clientId, accountId: account.id, customName: name.trim() },
      }),
    onSuccess: () => {
      toast.success('Cuenta renombrada para esta empresa');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Renombrar cuenta</DialogTitle>
          <DialogDescription>
            El nuevo nombre aplica solo a esta empresa. El plan base del estudio
            y las demás empresas no se modifican.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <p className="text-[12px] text-[var(--arca-ink-3)]">
            Nombre base: <span className="font-medium">{account.baseName}</span>
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${INPUT_CLASS} w-full h-9`}
            placeholder="Nombre para esta empresa"
          />
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!name.trim() || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Deactivate confirmation (US 1.1.2) ─── */
function DeactivateDialog({
  clientId,
  account,
  pending,
  onCancel,
  onConfirm,
}: {
  clientId: string;
  account: ChartAccount;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'movement-counts', clientId, account.id],
    queryFn: () =>
      getAccountMovementCounts({ data: { clientId, accountId: account.id } }),
  });
  const blocked = (data?.currentYear ?? 0) > 0;

  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar cuenta</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Cuenta{' '}
                <strong>
                  {account.code} · {account.name}
                </strong>
                .
              </p>
              {isLoading ? (
                <p>Calculando movimientos…</p>
              ) : blocked ? (
                <p className="text-[var(--arca-danger,oklch(0.55_0.18_25))]">
                  No se puede desactivar: tiene {data?.currentYear}{' '}
                  movimiento(s) en el ejercicio actual.
                </p>
              ) : (
                <p>
                  Movimientos pasados (ejercicios anteriores):{' '}
                  <strong>{data?.past ?? 0}</strong>. La cuenta dejará de estar
                  disponible para esta empresa, sin afectar a las demás.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked || pending || isLoading}
            onClick={onConfirm}
          >
            Desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Sugiere el próximo código libre para una cuenta hija bajo `parentId`, dentro
 * del rango [startSegment, maxExclusive). Base → [1, 900); propias → [900, ∞).
 * El backend es la fuente autoritativa; esto es solo para prellenar/mostrar.
 */
function suggestNextChildCode(
  accounts: ChartAccount[],
  parentId: string,
  startSegment: number,
  maxExclusive?: number
): string {
  const parent = accounts.find((a) => a.id === parentId);
  if (!parent) return '';
  let max = startSegment - 1;
  for (const k of accounts) {
    if (k.parentId !== parentId) continue;
    const seg = parseInt(k.code.slice(k.code.lastIndexOf('.') + 1), 10);
    if (Number.isNaN(seg)) continue;
    if (maxExclusive != null && seg >= maxExclusive) continue;
    if (seg > max) max = seg;
  }
  return `${parent.code}.${String(max + 1).padStart(3, '0')}`;
}

/* ─── Create / edit account dialog (US 1.1.3 custom, US 1.1.5 base) ─── */
function AccountFormDialog({
  mode,
  clientId,
  accounts,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  clientId: string;
  accounts: ChartAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === 'base-edit' ? mode.account : null;
  const isCustom = mode.kind === 'custom';

  const [code, setCode] = useState(editing?.code ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [type, setType] = useState<'imputable' | 'grupo'>(
    editing?.type ?? 'imputable'
  );
  const [accountGroup, setAccountGroup] = useState<string>(
    editing?.accountGroup ?? ''
  );
  const [expectedBalance, setExpectedBalance] = useState<string>(
    editing?.expectedBalance ?? ''
  );
  const [expenseFunction, setExpenseFunction] = useState<string>(
    editing?.expenseFunction ?? ''
  );
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? '');

  // Código sugerido para cuenta propia: se autoasigna en el rango reservado
  // (.900+) bajo el padre elegido. El backend es la fuente autoritativa.
  const customCodePreview = useMemo(
    () =>
      mode.kind === 'custom' && parentId
        ? suggestNextChildCode(accounts, parentId, CUSTOM_SEGMENT_START)
        : '',
    [mode.kind, parentId, accounts]
  );

  const title =
    mode.kind === 'custom'
      ? 'Nueva cuenta propia'
      : mode.kind === 'base-create'
        ? 'Nueva cuenta del plan base'
        : 'Editar cuenta del plan base';

  const isExpenseGroup =
    accountGroup === 'gastos_administracion' ||
    accountGroup === 'gastos_comercializacion' ||
    accountGroup === 'gastos_financieros' ||
    accountGroup === 'costo_ventas' ||
    accountGroup === 'otros_resultados_neg';

  const mut = useMutation({
    mutationFn: () => {
      const groupVal = accountGroup || undefined;
      const balVal = (expectedBalance || undefined) as
        | 'deudor'
        | 'acreedor'
        | 'ambos'
        | undefined;
      const expVal = (expenseFunction || undefined) as
        | 'administracion'
        | 'comercializacion'
        | 'financiero'
        | 'otro'
        | undefined;
      if (mode.kind === 'custom') {
        return createCustomAccount({
          data: {
            clientId,
            name,
            type,
            accountGroup: groupVal,
            expectedBalance: balVal,
            expenseFunction: expVal,
            description: description || undefined,
            parentId,
          },
        });
      }
      if (mode.kind === 'base-create') {
        return createBaseAccount({
          data: {
            code,
            name,
            type,
            accountGroup: groupVal,
            expectedBalance: balVal,
            expenseFunction: expVal,
            description: description || undefined,
            parentId: parentId || undefined,
          },
        });
      }
      return updateBaseAccount({
        data: {
          id: editing!.id,
          name,
          description: description || null,
          type,
          accountGroup: groupVal,
          expectedBalance: balVal,
          expenseFunction: expVal ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success('Guardado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parentOptions = accounts.filter(
    (a) => a.type === 'grupo' && a.id !== editing?.id
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode.kind === 'base-create' && (
            <DialogDescription>
              Se agrega al plan del estudio y aparece{' '}
              <strong>inactiva por default</strong> en todas las empresas.
            </DialogDescription>
          )}
          {mode.kind === 'custom' && (
            <DialogDescription>
              Cuenta propia de esta empresa. Elegí la cuenta padre (rubro) y el
              código se asigna automáticamente dentro de ese rubro.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-1">
          <Field label="Código *">
            {mode.kind === 'custom' ? (
              <input
                value={customCodePreview || '—'}
                disabled
                title="Se asigna automáticamente dentro del rubro elegido"
                className={`${INPUT_CLASS} w-full h-9 disabled:opacity-60`}
              />
            ) : (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={mode.kind === 'base-edit'}
                placeholder="1.1.07"
                className={`${INPUT_CLASS} w-full h-9 disabled:opacity-60`}
              />
            )}
          </Field>
          <Field label="Tipo *">
            <Select
              value={type}
              onValueChange={(v) => setType(v as 'imputable' | 'grupo')}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="imputable">
                  Imputable (admite movimientos)
                </SelectItem>
                <SelectItem value="grupo">Agrupación (solo suma)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Nombre *" full>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la cuenta"
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>

          <Field label="Rubro de exposición" full>
            <Select
              value={accountGroup === '' ? 'none' : accountGroup}
              onValueChange={(v) => setAccountGroup(v === 'none' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  — Sin rubro (solo agrupaciones) —
                </SelectItem>
                {ACCOUNT_GROUP_SECTIONS.map((sec) => (
                  <SelectGroup key={sec.section}>
                    <SelectLabel>{sec.section}</SelectLabel>
                    {sec.groups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {ACCOUNT_GROUP_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Saldo esperado">
            <Select
              value={expectedBalance === '' ? 'none' : expectedBalance}
              onValueChange={(v) => setExpectedBalance(v === 'none' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(['deudor', 'acreedor', 'ambos'] as const).map((b) => (
                  <SelectItem key={b} value={b}>
                    {EXPECTED_BALANCE_LABELS[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isExpenseGroup && (
            <Field label="Clasificación de gasto">
              <Select
                value={expenseFunction === '' ? 'none' : expenseFunction}
                onValueChange={(v) => setExpenseFunction(v === 'none' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(
                    [
                      'administracion',
                      'comercializacion',
                      'financiero',
                      'otro',
                    ] as const
                  ).map((f) => (
                    <SelectItem key={f} value={f}>
                      {EXPENSE_FUNCTION_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {mode.kind !== 'base-edit' && (
            <Field
              label={isCustom ? 'Cuenta padre (rubro) *' : 'Cuenta padre'}
              full
            >
              <Select
                value={parentId === '' ? 'none' : parentId}
                onValueChange={(v) => {
                  const pid = v === 'none' ? '' : v;
                  setParentId(pid);
                  const p = pid
                    ? accounts.find((a) => a.id === pid)
                    : undefined;
                  // Al elegir el rubro, prefill del rubro de exposición si está vacío.
                  if (pid && p?.accountGroup && !accountGroup) {
                    setAccountGroup(p.accountGroup);
                  }
                  // Base: prellenar el código (editable) con el próximo libre en
                  // rango base [1, 900). Propias usan preview read-only aparte.
                  if (mode.kind === 'base-create' && pid) {
                    setCode(
                      suggestNextChildCode(
                        accounts,
                        pid,
                        1,
                        CUSTOM_SEGMENT_START
                      )
                    );
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Ninguna —</SelectItem>
                  {parentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Descripción" full>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={
              !name.trim() ||
              (mode.kind === 'base-create' && !code.trim()) ||
              (mode.kind === 'custom' && !parentId) ||
              (type === 'imputable' && (!accountGroup || !expectedBalance)) ||
              mut.isPending
            }
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? 'col-span-2' : ''}`}>
      <label className="text-[11px] text-[var(--arca-ink-3)] flex items-center gap-1">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Ícono de ayuda con tooltip nativo (?). */
function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="cursor-help text-[var(--arca-ink-3)] hover:text-[var(--arca-accent)] inline-flex transition-colors"
          aria-label="Ayuda"
        >
          <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/* ════════════════════ Ejercicios y períodos (US 1.2.x) ════════════════════ */

function fmtFecha(d: string | Date) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const MESES_ES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];
/** Fecha larga en español para el membrete: "01 DE ENERO DE 2025". */
function fmtFechaLarga(d: string | Date) {
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dd} DE ${MESES_ES[dt.getUTCMonth()]} DE ${dt.getUTCFullYear()}`;
}

function fmtMoney(n: number) {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Primer día del mes (YYYY-MM-01) de una fecha YYYY-MM-DD. */
function firstOfMonth(dateStr: string): string {
  if (!dateStr) return '';
  return `${dateStr.slice(0, 7)}-01`;
}

/** Último día del último mes de un ejercicio de `months` meses que empieza en startStr (día 1). */
function computeEnd(startStr: string, months: number): string {
  const first = firstOfMonth(startStr);
  if (!first) return '';
  const d = new Date(`${first}T00:00:00Z`);
  if (isNaN(d.getTime())) return '';
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 0)
  );
  return end.toISOString().slice(0, 10);
}

function Ejercicios({
  clientId,
  isOwner,
  onGoToPending,
}: {
  clientId: string;
  isOwner: boolean;
  onGoToPending: () => void;
}) {
  const qc = useQueryClient();
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<PeriodView | null>(null);
  const [closeTarget, setCloseTarget] = useState<PeriodView | null>(null);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });

  // Por defecto se muestra el ejercicio que se está llevando, no uno de
  // referencia: esos solo guardan los saldos de un balance anterior.
  const effectiveFyId =
    selectedFyId !== '' ? selectedFyId : defaultFiscalYearId(fiscalYears);
  const selectedFyIsReference =
    fiscalYears.find((y) => y.id === effectiveFyId)?.soloReferencia ?? false;

  const { data: detail } = useQuery({
    queryKey: ['accounting', 'fy-detail', effectiveFyId],
    queryFn: () =>
      getFiscalYearDetail({ data: { fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const { data: log = [] } = useQuery({
    queryKey: ['accounting', 'fy-log', effectiveFyId],
    queryFn: () => getAccountingLog({ data: { fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const closeMut = useMutation({
    mutationFn: (periodId: string) => closePeriod({ data: { periodId } }),
    onSuccess: () => {
      toast.success('Período cerrado');
      setCloseTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (fiscalYears.length === 0) {
    return (
      <>
        <ArcaCard>
          <div className="px-5 py-12 text-center">
            <CalendarDays
              className="w-8 h-8 mx-auto mb-3 text-[var(--arca-ink-3)]"
              strokeWidth={1.5}
            />
            <p className="text-[13px] text-[var(--arca-ink-2)] mb-1">
              Esta empresa todavía no tiene ningún ejercicio contable.
            </p>
            <p className="text-[12px] text-[var(--arca-ink-3)] mb-4">
              Creá el primer ejercicio para empezar a cargar asientos.
            </p>
            {isOwner && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90"
              >
                <CalendarPlus className="w-3.5 h-3.5" strokeWidth={2} />
                Crear ejercicio
              </button>
            )}
          </div>
        </ArcaCard>
        {showCreate && (
          <CreateFiscalYearDialog
            clientId={clientId}
            onClose={() => setShowCreate(false)}
            onSaved={() => {
              setShowCreate(false);
              invalidate();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* Selector de ejercicios */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {fiscalYears.map((y) => {
          const active = y.id === effectiveFyId;
          return (
            <button
              key={y.id}
              onClick={() => setSelectedFyId(y.id)}
              className={cn(
                'flex h-9 items-center gap-2 rounded-lg border px-3 text-[12.5px] transition-colors duration-[120ms]',
                // Seleccionado = acento tonal, como cualquier chip activo de
                // la plataforma. Antes era borde de tinta sobre gris, que no
                // es un estado activo de este sistema.
                active
                  ? 'border-[var(--arca-accent)] bg-[var(--arca-accent-bg)] text-[var(--arca-accent-hover)]'
                  : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-bg)]'
              )}
            >
              <span className="font-semibold">Ejercicio N°{y.numero}</span>
              <span className="text-[var(--arca-ink-3)]">
                {fmtFecha(y.fechaDesde)} – {fmtFecha(y.fechaHasta)}
              </span>
              {y.soloReferencia ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="info" size="xs">
                      Referencia
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Cargado solo para la columna comparativa. No se cierra ni se
                    ajusta.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <FyStatusBadge status={y.estado} />
                  <span className="text-[11px] text-[var(--arca-ink-3)]">
                    {y.periodsClosed}/{y.periodsTotal} cerrados
                  </span>
                </>
              )}
            </button>
          );
        })}
        {isOwner && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-9 px-3 text-[12.5px] font-medium rounded-lg border border-dashed border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
          >
            <CalendarPlus className="w-3.5 h-3.5" strokeWidth={2} />
            Nuevo ejercicio
          </button>
        )}
      </div>

      {/* Períodos del ejercicio seleccionado */}
      {detail && (
        <ArcaCard>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--arca-border)]">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Períodos · Ejercicio N°{detail.ejercicio.numero}
            </span>
            <FyStatusBadge status={detail.ejercicio.estado} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {detail.periods.map((p) => (
              <PeriodCard
                key={p.id}
                period={p}
                isOwner={isOwner}
                onClose={() => setCloseTarget(p)}
                onReopen={() => setReopenTarget(p)}
                onGoToPending={onGoToPending}
              />
            ))}
          </div>
        </ArcaCard>
      )}

      {/* Checklist de cierre de ejercicio (US 5.1.1). Los ejercicios de
          referencia no se cierran: solo guardan los saldos del balance anterior. */}
      {detail && effectiveFyId && !selectedFyIsReference && (
        <CierreChecklist
          clientId={clientId}
          fiscalYearId={effectiveFyId}
          isOwner={isOwner}
        />
      )}

      {detail && selectedFyIsReference && (
        <>
          <ArcaCard className="mt-4">
            <div className="px-5 py-4 text-[12.5px] text-[var(--arca-ink-2)]">
              <div className="font-semibold text-[var(--arca-ink)]">
                Ejercicio de referencia
              </div>
              <div className="mt-0.5 text-[var(--arca-ink-3)]">
                Se cargó para alimentar la columna comparativa de los Estados
                Contables. No se cierra ni se ajusta por inflación: alcanza con
                transcribir abajo los saldos del balance ya presentado.
              </div>
            </div>
          </ArcaCard>
          <SaldosReferencia
            clientId={clientId}
            fiscalYearId={effectiveFyId}
            canWrite={isOwner}
          />
        </>
      )}

      {/* Log auditable */}
      {log.length > 0 && (
        <ArcaCard className="mt-4">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--arca-border)]">
            <History
              className="w-4 h-4 text-[var(--arca-ink-3)]"
              strokeWidth={1.8}
            />
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Historial de cierres y reaperturas
            </span>
          </div>
          <div className="divide-y divide-[var(--arca-border)]">
            {log.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 px-5 py-2.5 text-[12px]"
              >
                <span
                  className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                  style={{
                    background:
                      e.eventType === 'period_reopened'
                        ? 'color-mix(in oklch, oklch(0.55 0.15 50), transparent 88%)'
                        : 'color-mix(in oklch, oklch(0.45 0.04 250), transparent 88%)',
                    color:
                      e.eventType === 'period_reopened'
                        ? 'oklch(0.45 0.15 50)'
                        : 'oklch(0.40 0.04 250)',
                  }}
                >
                  {e.eventType === 'period_reopened' ? 'Reapertura' : 'Cierre'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[var(--arca-ink)]">
                    {e.eventData?.month
                      ? `${MONTH_NAMES[e.eventData.month]} ${e.eventData.year}`
                      : 'Período'}
                  </span>
                  {e.eventData?.reason && (
                    <span className="text-[var(--arca-ink-3)]">
                      {' '}
                      · Motivo: {e.eventData.reason}
                    </span>
                  )}
                  <span className="text-[var(--arca-ink-3)]">
                    {' '}
                    — {e.userName ?? e.userEmail ?? 'usuario'} ·{' '}
                    {new Date(e.createdAt).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ArcaCard>
      )}

      {showCreate && (
        <CreateFiscalYearDialog
          clientId={clientId}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {/* Confirmar cierre */}
      {closeTarget && (
        <AlertDialog open onOpenChange={(o) => !o && setCloseTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cerrar período</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a cerrar{' '}
                <strong>
                  {MONTH_NAMES[closeTarget.month]} {closeTarget.year}
                </strong>
                . Sus {closeTarget.entryCount} asiento(s) quedarán inmutables y
                se habilitará el período siguiente. Esta acción queda registrada
                en el log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={closeMut.isPending}
                onClick={() => closeMut.mutate(closeTarget.id)}
              >
                Cerrar período
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Reabrir período */}
      {reopenTarget && (
        <ReopenPeriodDialog
          period={reopenTarget}
          onClose={() => setReopenTarget(null)}
          onSaved={() => {
            setReopenTarget(null);
            invalidate();
          }}
        />
      )}
    </>
  );
}

function FyStatusBadge({
  status,
}: {
  status: 'abierto' | 'en_cierre' | 'cerrado';
}) {
  return (
    <Badge
      variant={
        status === 'abierto'
          ? 'success'
          : status === 'en_cierre'
            ? 'warning'
            : 'default'
      }
      size="xs"
      className="shrink-0"
    >
      {FISCAL_YEAR_STATUS_LABELS[status]}
    </Badge>
  );
}

function PeriodCard({
  period,
  isOwner,
  onClose,
  onReopen,
  onGoToPending,
}: {
  period: PeriodView;
  isOwner: boolean;
  onClose: () => void;
  onReopen: () => void;
  onGoToPending: () => void;
}) {
  const closed = period.status === 'cerrado';
  const hasPending = period.pendingCount > 0;
  // El período en curso se marca con el acento de la plataforma, no con un
  // verde crudo en oklch: el verde acá es el estado "cerrado/al día" y se
  // estaba usando para decir "es este".
  const estado = closed
    ? { label: 'Cerrado', variante: 'default' as const }
    : period.isCurrent
      ? { label: 'Abierto · actual', variante: 'secondary' as const }
      : { label: 'Por abrir', variante: 'default' as const };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--arca-r-md)] border p-3',
        period.isCurrent
          ? 'border-[var(--arca-accent)] bg-[var(--arca-accent-bg)]'
          : 'border-[var(--arca-border)] bg-[var(--arca-surface)]'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          {MONTH_NAMES[period.month]} {period.year}
        </span>
        {/* Sobre la card tonal del período en curso, un badge tonal del mismo
          acento se pierde: ahí va sobre la superficie blanca. */}
        <Badge
          variant={estado.variante}
          size="xs"
          className={
            period.isCurrent
              ? 'border-[var(--arca-accent)]/30 bg-[var(--arca-surface)]'
              : undefined
          }
        >
          {closed ? (
            <Lock className="size-2.5" strokeWidth={2} />
          ) : (
            <LockOpen className="size-2.5" strokeWidth={2} />
          )}
          {estado.label}
        </Badge>
      </div>

      <div className="text-[11.5px] text-[var(--arca-ink-3)]">
        {period.entryCount} asiento{period.entryCount === 1 ? '' : 's'} · ${' '}
        {fmtMoney(period.totalAmount)}
      </div>

      {!closed && hasPending && (
        <button
          onClick={onGoToPending}
          className="flex items-center gap-1 text-[11px] text-[var(--arca-accent-warn-fg)] hover:underline text-left"
        >
          <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={2} />
          {period.pendingCount} pendiente{period.pendingCount === 1 ? '' : 's'}{' '}
          de revisión · resolver
        </button>
      )}

      {isOwner && (
        <div className="mt-1">
          {period.isCurrent &&
            (hasPending ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: los botones disabled no disparan hover; el span sí. */}
                  <span className="block cursor-not-allowed">
                    <button
                      disabled
                      className="w-full h-7 text-[11.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white opacity-40 cursor-not-allowed pointer-events-none"
                    >
                      Cerrar período (bloqueado)
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[240px] text-xs leading-snug"
                >
                  No se puede cerrar: hay {period.pendingCount} asiento(s) en
                  pendiente de revisión. Resolvelos en la bandeja de Pendientes.
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={onClose}
                className="w-full h-7 text-[11.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90"
              >
                Cerrar período
              </button>
            ))}
          {closed && (
            <button
              onClick={onReopen}
              className="w-full h-7 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              Reabrir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Checklist de cierre de ejercicio (US 5.1.1) ─── */
function CierreChecklist({
  clientId,
  fiscalYearId,
  isOwner,
}: {
  clientId: string;
  fiscalYearId: string;
  isOwner: boolean;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['accounting', 'year-end-checklist', clientId, fiscalYearId],
    queryFn: () => getYearEndChecklist({ data: { clientId, fiscalYearId } }),
  });
  if (!data) return null;

  if (data.fiscalYearStatus === 'cerrado') {
    return (
      <ArcaCard className="mt-4">
        <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-[var(--arca-ink-2)]">
          <Lock
            className="w-4 h-4 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
          El Ejercicio N°{data.fiscalYearNumber} está <strong>cerrado</strong>.
        </div>
      </ArcaCard>
    );
  }

  return (
    <ArcaCard className="mt-4">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--arca-border)]">
        <Lock className="w-4 h-4 text-[var(--arca-ink-3)]" strokeWidth={1.8} />
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Cierre del ejercicio · Chequeo previo
        </span>
      </div>

      <div className="divide-y divide-[var(--arca-border)]">
        {data.checks.map((c: YearEndCheck) => (
          <div key={c.key} className="flex items-start gap-3 px-5 py-2.5">
            {c.status === 'pass' ? (
              <CheckCircle2
                className="w-4 h-4 shrink-0 mt-0.5 text-[var(--arca-accent-pos-fg)]"
                strokeWidth={2}
              />
            ) : c.status === 'warn' ? (
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5 text-[var(--arca-accent-warn-fg)]"
                strokeWidth={2}
              />
            ) : (
              <XCircle
                className="w-4 h-4 shrink-0 mt-0.5 text-[var(--arca-accent-neg-fg)]"
                strokeWidth={2}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-[var(--arca-ink)]">
                {c.label}
              </div>
              <div
                className="text-[11.5px]"
                style={{
                  color:
                    c.status === 'pass'
                      ? 'var(--arca-ink-3)'
                      : c.status === 'warn'
                        ? 'oklch(0.58 0.13 75)'
                        : 'oklch(0.55 0.18 25)',
                }}
              >
                {c.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--arca-border)]">
        <span className="text-[12px] text-[var(--arca-ink-3)]">
          {!data.canClose
            ? 'Resolvé los puntos en rojo para habilitar el cierre.'
            : data.checks.some((c: YearEndCheck) => c.status === 'warn')
              ? 'Podés iniciar el cierre. Revisá antes los puntos en ámbar: no bloquean, pero conviene resolverlos.'
              : 'Todas las validaciones pasan. Podés iniciar el cierre.'}
        </span>
        {isOwner ? (
          <button
            disabled={!data.canClose}
            onClick={() => setWizardOpen(true)}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={data.canClose ? undefined : 'Hay validaciones sin cumplir'}
          >
            Iniciar cierre
          </button>
        ) : (
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            Solo el Owner puede cerrar
          </span>
        )}
      </div>

      {wizardOpen && (
        <ClosingWizard
          clientId={clientId}
          fiscalYearId={fiscalYearId}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </ArcaCard>
  );
}

/* ─── Wizard de cierre de ejercicio (US 5.3.x) ─── */

interface EditLine {
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
}

/** Tabla de asiento con montos editables; informa al padre líneas + si balancea. */
function EditableEntryTable({
  preview,
  readOnly,
  onChange,
}: {
  preview: ClosingEntryPreview;
  readOnly: boolean;
  onChange?: (lines: EditLine[], balanced: boolean) => void;
}) {
  const [lines, setLines] = useState<EditLine[]>(
    preview.lines.map((l) => ({
      accountId: l.accountId,
      code: l.code,
      name: l.name,
      debit: l.debit > 0 ? String(l.debit) : '',
      credit: l.credit > 0 ? String(l.credit) : '',
    }))
  );

  const totalD = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(totalD - totalC) < 0.005;

  const update = (i: number, field: 'debit' | 'credit', v: string) => {
    const next = lines.map((l, j) => (j === i ? { ...l, [field]: v } : l));
    setLines(next);
    onChange?.(
      next,
      Math.abs(
        next.reduce((s, l) => s + num(l.debit), 0) -
          next.reduce((s, l) => s + num(l.credit), 0)
      ) < 0.005
    );
  };

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
          <th className="py-1.5">Cuenta</th>
          <th className="py-1.5 text-right w-32">Debe</th>
          <th className="py-1.5 text-right w-32">Haber</th>
        </tr>
      </thead>
      <tbody className="bg-[var(--arca-surface)]">
        {lines.map((l, i) => (
          <tr
            key={l.accountId}
            className="border-b border-[var(--arca-border)] last:border-0"
          >
            <td className="py-1.5">
              <span className="text-[var(--arca-ink-3)]">{l.code}</span>{' '}
              {l.name}
            </td>
            <td className="py-1 text-right">
              {readOnly ? (
                <span className="tabular-nums">
                  {num(l.debit) > 0 ? `$ ${fmtMoney(num(l.debit))}` : ''}
                </span>
              ) : (
                <input
                  value={l.debit}
                  onChange={(e) => update(i, 'debit', e.target.value)}
                  disabled={num(l.credit) > 0}
                  className="w-28 h-7 px-2 text-[12px] text-right border border-[var(--arca-border)] rounded-[6px] disabled:opacity-40"
                />
              )}
            </td>
            <td className="py-1 text-right">
              {readOnly ? (
                <span className="tabular-nums">
                  {num(l.credit) > 0 ? `$ ${fmtMoney(num(l.credit))}` : ''}
                </span>
              ) : (
                <input
                  value={l.credit}
                  onChange={(e) => update(i, 'credit', e.target.value)}
                  disabled={num(l.debit) > 0}
                  className="w-28 h-7 px-2 text-[12px] text-right border border-[var(--arca-border)] rounded-[6px] disabled:opacity-40"
                />
              )}
            </td>
          </tr>
        ))}
        <tr className="font-semibold border-t border-[var(--arca-ink-3)]">
          <td className="py-1.5 text-right">
            {balanced ? (
              <span className="text-[var(--arca-accent-pos-fg)]">
                ✓ Balanceado
              </span>
            ) : (
              <span className="text-[var(--arca-accent-neg-fg)]">
                Descuadrado
              </span>
            )}
          </td>
          <td className="py-1.5 text-right tabular-nums [font-family:var(--ff-mono)]">
            $ {fmtMoney(totalD)}
          </td>
          <td className="py-1.5 text-right tabular-nums [font-family:var(--ff-mono)]">
            $ {fmtMoney(totalC)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

type StageKey =
  | 'verificacion'
  | 'ajustes'
  | 'refundicion'
  | 'cierre'
  | 'apertura';
const STAGE_DEFS: { key: StageKey; label: string }[] = [
  { key: 'verificacion', label: 'Verificación' },
  { key: 'ajustes', label: 'Ajustes manuales' },
  { key: 'refundicion', label: 'Refundición' },
  { key: 'cierre', label: 'Cierre patrimonial' },
  { key: 'apertura', label: 'Apertura' },
];

function ClosingWizard({
  clientId,
  fiscalYearId,
  onClose,
}: {
  clientId: string;
  fiscalYearId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<StageKey>('verificacion');
  const [ajustesAck, setAjustesAck] = useState(false);
  const [aperturaWanted, setAperturaWanted] = useState(true);
  const [aperturaSkipped, setAperturaSkipped] = useState(false);

  const { data: checklist } = useQuery({
    queryKey: ['accounting', 'year-end-checklist', clientId, fiscalYearId],
    queryFn: () => getYearEndChecklist({ data: { clientId, fiscalYearId } }),
  });
  const { data: wiz } = useQuery({
    queryKey: ['accounting', 'closing-wizard', clientId, fiscalYearId],
    queryFn: () => getClosingWizard({ data: { clientId, fiscalYearId } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const approveMut = useMutation({
    mutationFn: (v: { stage: StageKey; lines: EditLine[] }) =>
      approveClosingStage({
        data: {
          clientId,
          fiscalYearId,
          stage: v.stage as 'refundicion' | 'cierre' | 'apertura',
          lines: v.lines.map((l) => ({
            accountId: l.accountId,
            debit: num(l.debit),
            credit: num(l.credit),
          })),
        },
      }),
    onSuccess: (_r, v) => {
      toast.success(
        v.stage === 'apertura'
          ? 'Apertura registrada'
          : v.stage === 'refundicion'
            ? 'Refundición registrada'
            : 'Cierre patrimonial registrado'
      );
      // Invalidación dirigida: refrescar solo el wizard (no la lista de ejercicios,
      // para que crear el ejercicio siguiente en la apertura no desmonte el wizard).
      void qc.invalidateQueries({
        queryKey: ['accounting', 'closing-wizard', clientId, fiscalYearId],
      });
      const order: StageKey[] = ['refundicion', 'cierre', 'apertura'];
      const next = order[order.indexOf(v.stage) + 1];
      if (next) setStage(next);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sealMut = useMutation({
    mutationFn: () => sealClosing({ data: { clientId, fiscalYearId } }),
    onSuccess: () => {
      toast.success('Ejercicio sellado. Quedó cerrado.');
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!wiz || !checklist) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <div className="py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const done: Record<StageKey, boolean> = {
    verificacion: checklist.canClose,
    ajustes: ajustesAck,
    refundicion: wiz.refundicion.status === 'done',
    cierre: wiz.cierre.status === 'done',
    apertura: wiz.apertura.status === 'done' || aperturaSkipped,
  };
  const order = STAGE_DEFS.map((s) => s.key);
  const firstIncomplete = order.find((k) => !done[k]) ?? 'apertura';
  const activeIdx = order.indexOf(firstIncomplete);
  const allDone = order.every((k) => done[k]);

  const statusOf = (k: StageKey): 'completada' | 'en curso' | 'pendiente' => {
    if (done[k]) return 'completada';
    if (k === stage) return 'en curso';
    return 'pendiente';
  };

  const goStage = (k: StageKey) => {
    if (order.indexOf(k) <= activeIdx) setStage(k);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Cierre del Ejercicio N°{wiz.fiscalYearNumber}
          </DialogTitle>
          <DialogDescription>
            Seguí las etapas. Podés pausar (cerrá esta ventana) y retomar: lo
            aprobado queda guardado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 flex-wrap">
          {STAGE_DEFS.map((s, i) => {
            const st = statusOf(s.key);
            const navigable = i <= activeIdx;
            return (
              <button
                key={s.key}
                onClick={() => goStage(s.key)}
                disabled={!navigable}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-[8px] text-[12px] transition-colors disabled:cursor-not-allowed"
                style={{
                  background:
                    s.key === stage ? 'var(--arca-surface-2)' : 'transparent',
                  color: navigable ? 'var(--arca-ink)' : 'var(--arca-ink-3)',
                  border:
                    s.key === stage
                      ? '1px solid var(--arca-border)'
                      : '1px solid transparent',
                }}
              >
                {st === 'completada' ? (
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-[var(--arca-accent-pos-fg)]"
                    strokeWidth={2}
                  />
                ) : st === 'en curso' ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--arca-accent)] inline-block" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-[var(--arca-ink-3)] inline-block" />
                )}
                <span className="font-medium">
                  {i + 1}. {s.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 min-h-[200px]">
          {stage === 'verificacion' && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-[var(--arca-ink-3)]">
                Precondiciones para cerrar el ejercicio.
              </p>
              <div className="divide-y divide-[var(--arca-border)] border border-[var(--arca-border)] rounded-xl">
                {checklist.checks.map((c: YearEndCheck) => (
                  <div key={c.key} className="flex items-start gap-2 px-3 py-2">
                    {c.status === 'pass' ? (
                      <CheckCircle2
                        className="w-4 h-4 mt-0.5 text-[var(--arca-accent-pos-fg)] shrink-0"
                        strokeWidth={2}
                      />
                    ) : c.status === 'warn' ? (
                      <AlertTriangle
                        className="w-4 h-4 mt-0.5 text-[var(--arca-accent-warn-fg)] shrink-0"
                        strokeWidth={2}
                      />
                    ) : (
                      <XCircle
                        className="w-4 h-4 mt-0.5 text-[var(--arca-accent-neg-fg)] shrink-0"
                        strokeWidth={2}
                      />
                    )}
                    <div>
                      <div className="text-[12.5px]">{c.label}</div>
                      <div
                        className="text-[11.5px]"
                        style={{
                          color:
                            c.status === 'warn'
                              ? 'oklch(0.58 0.13 75)'
                              : 'var(--arca-ink-3)',
                        }}
                      >
                        {c.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  disabled={!checklist.canClose}
                  onClick={() => setStage('ajustes')}
                  className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-40"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {stage === 'ajustes' && (
            <div className="space-y-3">
              <div className="rounded-[10px] bg-[var(--arca-surface-2)] px-4 py-3 text-[12.5px] text-[var(--arca-ink-2)] leading-relaxed">
                Antes de refundir, cargá los <strong>ajustes manuales</strong>{' '}
                que falten (amortizaciones, provisiones, devengamientos) en la
                pestaña <strong>Asientos</strong>. La amortización sugerida del
                ejercicio está en <strong>Bienes de uso › Anexo I</strong>.
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => setStage('verificacion')}
                  className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                >
                  Atrás
                </button>
                <button
                  onClick={() => {
                    setAjustesAck(true);
                    setStage('refundicion');
                  }}
                  className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white"
                >
                  Ya cargué los ajustes · Continuar
                </button>
              </div>
            </div>
          )}

          {stage === 'refundicion' &&
            !done.refundicion &&
            (!wiz.inflation.applied || wiz.inflation.stale) && (
              <div
                className="flex items-start gap-2.5 px-4 py-3 mb-3 rounded-[12px] border text-[12.5px]"
                style={{
                  background: 'var(--arca-accent-warn-bg)',
                  borderColor: '#fde68a',
                  color: 'var(--arca-accent-warn-fg)',
                }}
              >
                <AlertTriangle
                  className="w-4 h-4 mt-px shrink-0"
                  strokeWidth={1.9}
                />
                <div>
                  <div className="font-semibold">
                    {wiz.inflation.applied
                      ? 'El ajuste por inflación quedó desactualizado'
                      : 'Falta el ajuste por inflación'}
                  </div>
                  <div className="mt-0.5">
                    {wiz.inflation.applied
                      ? 'Se cargaron asientos después de generarlo. Regeneralo en la solapa «Ajuste por inflación» antes de refundir.'
                      : 'El ajuste va antes de la refundición: después las cuentas de resultado quedan refundidas y el balance saldría en valores históricos. Generalo en la solapa «Ajuste por inflación».'}
                  </div>
                </div>
              </div>
            )}

          {stage === 'refundicion' &&
            !done.refundicion &&
            wiz.inflation.applied &&
            !wiz.inflation.stale && (
              <div className="px-4 py-2 mb-3 text-[12px] text-[var(--arca-ink-3)]">
                ✓ Ajuste por inflación aplicado
                {wiz.inflation.journalEntryNumber
                  ? ` · Asiento N°${wiz.inflation.journalEntryNumber}`
                  : ''}
                {wiz.inflation.recpam !== null
                  ? ` · RECPAM $ ${fmtMoney(-wiz.inflation.recpam)}`
                  : ''}
              </div>
            )}

          {stage === 'refundicion' && wiz.refundicion.preview && (
            <StageEntry
              title="Refundición de cuentas de resultado"
              subtitle={`Resultado del ejercicio: ${
                wiz.resultado.tipo === 'ganancia'
                  ? 'Ganancia'
                  : wiz.resultado.tipo === 'perdida'
                    ? 'Pérdida'
                    : 'Neutro'
              } $ ${fmtMoney(Math.abs(wiz.resultado.net))}`}
              preview={wiz.refundicion.preview}
              done={done.refundicion}
              blockedReason={
                !wiz.inflation.applied
                  ? 'Generá el ajuste por inflación antes de refundir'
                  : wiz.inflation.stale
                    ? 'Regenerá el ajuste por inflación: quedó desactualizado'
                    : undefined
              }
              doneLabel={
                wiz.refundicion.entryNumber
                  ? `Registrado · Asiento N°${wiz.refundicion.entryNumber}`
                  : 'Registrado'
              }
              pending={approveMut.isPending}
              onBack={() => setStage('ajustes')}
              onApprove={(lines) =>
                approveMut.mutate({ stage: 'refundicion', lines })
              }
              onContinue={() => setStage('cierre')}
            />
          )}

          {stage === 'cierre' && wiz.cierre.preview && (
            <StageEntry
              title="Asiento de cierre patrimonial"
              preview={wiz.cierre.preview}
              done={done.cierre}
              doneLabel={
                wiz.cierre.entryNumber
                  ? `Registrado · Asiento N°${wiz.cierre.entryNumber}`
                  : 'Registrado'
              }
              pending={approveMut.isPending}
              onBack={() => setStage('refundicion')}
              onApprove={(lines) =>
                approveMut.mutate({ stage: 'cierre', lines })
              }
              onContinue={() => setStage('apertura')}
            />
          )}

          {stage === 'apertura' && (
            <div className="space-y-3">
              {wiz.apertura.status === 'done' ? (
                <div className="rounded-[10px] bg-[var(--arca-surface-2)] px-4 py-3 text-[12.5px]">
                  ✓ Apertura registrada (Asiento N°{wiz.apertura.entryNumber}{' '}
                  del Ejercicio N°{wiz.apertura.nextFy?.number}).
                </div>
              ) : aperturaSkipped ? (
                <div className="rounded-[10px] bg-[var(--arca-surface-2)] px-4 py-3 text-[12.5px] text-[var(--arca-ink-3)]">
                  Apertura omitida. Podés crear el próximo ejercicio manualmente
                  más adelante.
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={aperturaWanted}
                      onChange={(e) => setAperturaWanted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Crear el{' '}
                      <strong>Ejercicio N°{wiz.apertura.nextFy?.number}</strong>{' '}
                      ({fmtFecha(wiz.apertura.nextFy?.startDate ?? '')} –{' '}
                      {fmtFecha(wiz.apertura.nextFy?.endDate ?? '')}) con su
                      asiento de apertura (saldos invertidos).
                    </span>
                  </label>
                  {aperturaWanted && wiz.apertura.preview && (
                    <StageEntry
                      title="Asiento de apertura"
                      preview={wiz.apertura.preview}
                      done={false}
                      pending={approveMut.isPending}
                      onBack={() => setStage('cierre')}
                      onApprove={(lines) =>
                        approveMut.mutate({ stage: 'apertura', lines })
                      }
                      hideContinue
                    />
                  )}
                  {!aperturaWanted && (
                    <div className="flex justify-between">
                      <button
                        onClick={() => setStage('cierre')}
                        className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                      >
                        Atrás
                      </button>
                      <button
                        onClick={() => setAperturaSkipped(true)}
                        className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                      >
                        Omitir apertura
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {done.cierre && (done.apertura || aperturaSkipped) && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-3">
            <span className="text-[12.5px] text-[var(--arca-ink-2)]">
              {allDone
                ? 'Todo listo. Sellá el ejercicio para dejarlo inmutable.'
                : 'Completá las etapas para sellar.'}
            </span>
            <button
              onClick={() => sealMut.mutate()}
              disabled={sealMut.isPending || !done.cierre}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
            >
              {sealMut.isPending ? 'Sellando…' : 'Finalizar y sellar ejercicio'}
            </button>
          </div>
        )}

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          >
            Pausar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageEntry({
  title,
  subtitle,
  preview,
  done,
  doneLabel,
  pending,
  onBack,
  onApprove,
  onContinue,
  hideContinue,
  blockedReason,
}: {
  title: string;
  subtitle?: string;
  preview: ClosingEntryPreview;
  done: boolean;
  doneLabel?: string;
  pending: boolean;
  onBack: () => void;
  onApprove: (lines: EditLine[]) => void;
  onContinue?: () => void;
  hideContinue?: boolean;
  /** Motivo por el que todavía no se puede registrar; deshabilita el botón. */
  blockedReason?: string;
}) {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [balanced, setBalanced] = useState(preview.balanced);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
          {title}
        </div>
        {subtitle && (
          <div className="text-[12px] text-[var(--arca-ink-3)]">{subtitle}</div>
        )}
      </div>

      {done ? (
        <>
          <div className="rounded-[8px] bg-[var(--arca-accent-pos-bg)] border border-[var(--arca-accent-pos)] px-3 py-2 text-[12px] text-[var(--arca-accent-pos-fg)]">
            ✓ {doneLabel ?? 'Registrado'}
          </div>
          <EditableEntryTable preview={preview} readOnly />
          {!hideContinue && onContinue && (
            <div className="flex justify-between">
              <button
                onClick={onBack}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
              >
                Atrás
              </button>
              <button
                onClick={onContinue}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white"
              >
                Continuar
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <EditableEntryTable
            preview={preview}
            readOnly={false}
            onChange={(l, b) => {
              setLines(l);
              setBalanced(b);
            }}
          />
          <div className="flex justify-between">
            <button
              onClick={onBack}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
            >
              Atrás
            </button>
            <button
              onClick={() =>
                onApprove(lines.length ? lines : toEditLines(preview))
              }
              disabled={pending || !balanced || !!blockedReason}
              title={
                blockedReason ??
                (balanced ? undefined : 'El asiento no balancea')
              }
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
            >
              {pending ? 'Registrando…' : 'Aprobar y registrar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function toEditLines(preview: ClosingEntryPreview): EditLine[] {
  return preview.lines.map((l) => ({
    accountId: l.accountId,
    code: l.code,
    name: l.name,
    debit: l.debit > 0 ? String(l.debit) : '',
    credit: l.credit > 0 ? String(l.credit) : '',
  }));
}

function CreateFiscalYearDialog({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState('');
  const [months, setMonths] = useState(12);
  const [referenceOnly, setReferenceOnly] = useState(false);
  const [statementsAdjusted, setStatementsAdjusted] = useState(true);
  const startFirst = firstOfMonth(start);
  const end = computeEnd(start, months);

  const mut = useMutation({
    mutationFn: () =>
      createFiscalYear({
        data: {
          clientId,
          startDate: startFirst,
          endDate: end,
          referenceOnly,
          statementsAdjusted: referenceOnly ? statementsAdjusted : true,
        },
      }),
    onSuccess: () => {
      toast.success(
        referenceOnly
          ? 'Ejercicio de referencia creado. Transcribí abajo los saldos del balance anterior.'
          : `Ejercicio creado con sus ${months} períodos`
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const monthsValid = Number.isInteger(months) && months >= 1 && months <= 12;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Nuevo ejercicio</DialogTitle>
          <DialogDescription>
            Elegí el mes de inicio y la duración. Por defecto son 12 meses, pero
            podés crear ejercicios irregulares (3, 6, 8 meses, etc.). Se crean
            automáticamente los períodos mensuales correspondientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Mes de inicio *
              </label>
              <SelectorFecha
                value={start}
                onChange={(v) => setStart(v)}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Duración (meses) *
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className={`${INPUT_CLASS} w-full h-9`}
              />
            </div>
          </div>

          {startFirst && end && monthsValid && (
            <div className="rounded-[8px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-3 py-2.5 text-[12.5px]">
              <span className="text-[var(--arca-ink-3)]">Ejercicio: </span>
              <span className="font-medium text-[var(--arca-ink)]">
                {fmtFecha(`${startFirst}T00:00:00Z`)} →{' '}
                {fmtFecha(`${end}T00:00:00Z`)}
              </span>
              <span className="text-[var(--arca-ink-3)]">
                {' '}
                ({months} {months === 1 ? 'mes' : 'meses'})
              </span>
            </div>
          )}

          <div className="rounded-[8px] border border-[var(--arca-border)] px-3 py-2.5 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={referenceOnly}
                onChange={(e) => setReferenceOnly(e.target.checked)}
                className="mt-0.5 accent-[var(--arca-accent)]"
              />
              <span>
                <span className="text-[12.5px] font-medium text-[var(--arca-ink)]">
                  Solo para el comparativo
                </span>
                <span className="block text-[11.5px] text-[var(--arca-ink-3)]">
                  Para transcribir los saldos de un balance ya presentado. No
                  hay que cerrarlo ni ajustarlo, y no ocupa el lugar del
                  ejercicio abierto de la empresa.
                </span>
              </span>
            </label>

            {referenceOnly && (
              <label className="flex items-start gap-2 cursor-pointer pl-6">
                <input
                  type="checkbox"
                  checked={statementsAdjusted}
                  onChange={(e) => setStatementsAdjusted(e.target.checked)}
                  className="mt-0.5 accent-[var(--arca-accent)]"
                />
                <span>
                  <span className="text-[12.5px] text-[var(--arca-ink)]">
                    Los saldos ya están ajustados por inflación
                  </span>
                  <span className="block text-[11.5px] text-[var(--arca-ink-3)]">
                    Es lo normal: un balance presentado ya viene en moneda de su
                    cierre. Destildalo solo si vas a cargar valores históricos
                    sin ajustar.
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!startFirst || !end || !monthsValid || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Creando…' : 'Crear ejercicio'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenPeriodDialog({
  period,
  onClose,
  onSaved,
}: {
  period: PeriodView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () =>
      reopenPeriod({ data: { periodId: period.id, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success('Período reabierto');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            Reabrir {MONTH_NAMES[period.month]} {period.year}
          </DialogTitle>
          <DialogDescription>
            El período vuelve a estado abierto y sus asientos se conservan. El
            motivo queda registrado en el log auditable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            Motivo *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ej: corrección de un asiento mal imputado…"
            className="w-full px-2.5 py-2 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none resize-none"
          />
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!reason.trim() || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Reabriendo…' : 'Reabrir período'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════ Asientos / Libro diario (US 1.3.x) ════════════════════ */

interface PostableAccount {
  id: string;
  code: string;
  name: string;
  accountGroup: string | null;
}

function groupedPostable(accounts: PostableAccount[]) {
  const groups: { label: string; items: PostableAccount[] }[] = [];
  const idx = new Map<string, number>();
  for (const a of accounts) {
    const key = a.accountGroup ?? '__none__';
    if (!idx.has(key)) {
      idx.set(key, groups.length);
      const label = a.accountGroup
        ? (ACCOUNT_GROUP_LABELS[a.accountGroup as AccountGroup] ??
          a.accountGroup)
        : 'Sin rubro';
      groups.push({ label, items: [] });
    }
    groups[idx.get(key)!].items.push(a);
  }
  return groups;
}

function AccountCombobox({
  value,
  onChange,
  postable,
  onCreate,
}: {
  value: string;
  onChange: (id: string) => void;
  postable: PostableAccount[];
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = postable.find((a) => a.id === value);
  const groups = groupedPostable(postable);

  return (
    // `modal`: el selector vive dentro del diálogo del asiento, y el popover se
    // portalea al body — o sea, fuera del diálogo. El bloqueo de scroll que el
    // diálogo pone sobre todo lo que está afuera se comía la rueda del mouse y
    // la lista de cuentas no scrolleaba. En modal el popover trae su propio
    // manejo y se exceptúa a sí mismo.
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-8 flex-1 min-w-0 w-0 items-center justify-between gap-1 rounded-[var(--arca-r-sm)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-2 text-[12.5px] hover:bg-[var(--arca-surface-2)] transition-colors',
            selected ? 'text-[var(--arca-ink)]' : 'text-[var(--arca-ink-3)]'
          )}
        >
          <span className="truncate min-w-0">
            {selected
              ? `${selected.code} · ${selected.name}`
              : '— Elegí cuenta —'}
          </span>
          <ChevronsUpDown className="w-3 h-3 shrink-0 text-[var(--arca-ink-4)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput
            placeholder="Buscar cuenta..."
            className="text-[12.5px]"
          />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-4 text-center text-[12px] text-[var(--arca-ink-3)]">
              Sin resultados
            </CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.items.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.code} ${a.name}`}
                    onSelect={() => {
                      onChange(a.id);
                      setOpen(false);
                    }}
                    className="text-[12.5px] gap-2"
                  >
                    <Check
                      className={cn(
                        'w-3 h-3 shrink-0',
                        value === a.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {a.code} · {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="border-t border-[var(--arca-border)] p-1">
            <button
              className="flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} />
              Nueva cuenta
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
  /**
   * El lado que traía el template, cuando la línea vino de uno.
   *
   * Hace falta porque un template no guarda importes: al cargarlo las dos
   * columnas quedan en cero y el lado deja de poder deducirse de ellas. Sin
   * esto, cargar un template y volver a guardarlo era imposible — no quedaba
   * ninguna línea con importe y el guardado las descartaba todas.
   *
   * Es solo el valor de arranque: si el usuario escribe un importe, ese manda.
   */
  lado?: 'debe' | 'haber';
}

/** parseFloat seguro: NaN/'' → 0. */
function num(v: string): number {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

interface EditorInitial {
  id?: string;
  entryDate?: string;
  description?: string;
  lines: LineDraft[];
}
type EditorState =
  | { mode: 'create'; initial?: EditorInitial }
  | { mode: 'edit'; initial: EditorInitial }
  | { mode: 'duplicate'; initial: EditorInitial };

function Asientos({
  clientId,
  canWrite,
  isOwner,
}: {
  clientId: string;
  canWrite: boolean;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [origin, setOrigin] = useState<'' | JournalOrigin>('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [sortBy, setSortBy] = useState<'number' | 'date'>('number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /**
   * Asientos marcados para anular en bloque. Sobrevive al cambio de página
   * —se puede ir marcando de a 25— pero no al de filtros ni de empresa.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [voidOpen, setVoidOpen] = useState(false);
  const filtrosKey = `${clientId}|${from}|${to}|${accountId}|${origin}|${includeVoided}`;
  const [selKey, setSelKey] = useState(filtrosKey);
  if (selKey !== filtrosKey) {
    setSelKey(filtrosKey);
    setSelected(new Set());
  }

  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });

  const filters = {
    clientId,
    from: from || undefined,
    to: to || undefined,
    accountId: accountId || undefined,
    origin: origin || undefined,
    includeVoided,
    sortBy,
    sortDir,
    page,
    pageSize,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'entries', filters],
    queryFn: () => listJournalEntries({ data: filters }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allExpanded = rows.length > 0 && rows.every((r) => expanded.has(r.id));
  const seleccionables = rows.filter((r) => !r.isVoided);
  const paginaMarcada =
    seleccionables.length > 0 &&
    seleccionables.every((r) => selected.has(r.id));
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePagina = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of seleccionables) {
        if (paginaMarcada) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  const toggleExpandAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(rows.map((r) => r.id)));

  const exportLibroDiario = () => {
    getJournalBook({
      data: { clientId, fiscalYearId: data?.fiscalYearId ?? undefined },
    })
      .then((book) => {
        if (!book || book.entries.length === 0) {
          toast.error('No hay asientos para exportar');
          return;
        }
        return exportLibroDiarioPdf({
          empresaName: book.empresaName,
          cuit: book.cuit,
          fiscalYearNumber: book.ejercicio.number,
          from: book.ejercicio.startDate,
          to: book.ejercicio.endDate,
          entries: book.entries,
        });
      })
      .catch((e: Error) => toast.error(e.message));
  };

  /** Cuántos filtros están puestos: si hay alguno, se ofrece limpiarlos. */
  const filtrosPuestos =
    (from ? 1 : 0) +
    (to ? 1 : 0) +
    (accountId ? 1 : 0) +
    (origin ? 1 : 0) +
    (includeVoided ? 1 : 0);

  function openEditorFromDetail(
    action: 'edit' | 'duplicate',
    d: EditorInitial
  ) {
    setEditor({ mode: action, initial: d });
  }

  return (
    <>
      {/* Los filtros van afuera de la card de la tabla, en una sola línea de
        32px: antes vivían adentro, cada control con su micro-rótulo encima y
        tres alturas distintas conviviendo. */}
      <div className="mb-[10px] flex flex-wrap items-center gap-2">
        <SelectorFecha
          size="sm"
          value={from}
          onChange={(v) => {
            setFrom(v);
            setPage(1);
          }}
          placeholder="Desde"
          aria-label="Asientos desde"
          className="w-[132px]"
        />
        <SelectorFecha
          size="sm"
          value={to}
          onChange={(v) => {
            setTo(v);
            setPage(1);
          }}
          placeholder="Hasta"
          aria-label="Asientos hasta"
          className="w-[132px]"
        />

        {/* El plan de cuentas es largo: el select con buscador es el único que
          sirve acá. */}
        <SearchableSelect
          size="sm"
          width={200}
          value={accountId === '' ? 'all' : accountId}
          onValueChange={(v) => {
            setAccountId(v === 'all' ? '' : v);
            setPage(1);
          }}
          placeholder="Cuenta"
          searchPlaceholder="Buscar cuenta…"
          label="Cuenta"
          options={[
            { value: 'all', label: 'Todas las cuentas' },
            ...postable.map((a) => ({
              value: a.id,
              label: `${a.code} · ${a.name}`,
            })),
          ]}
        />

        {/* Origen y Orden son listas cortas: el select simple alcanza, el
          buscador sobra. */}
        <Select
          value={origin === '' ? 'all' : origin}
          onValueChange={(v) => {
            setOrigin(v === 'all' ? '' : (v as JournalOrigin));
            setPage(1);
          }}
        >
          {/* `data-[size=sm]:h-8` y no `h-8` a secas: el selector por
            atributo de la variante le gana en especificidad. */}
          <SelectTrigger size="sm" className="w-[150px] data-[size=sm]:h-8">
            <SelectValue placeholder="Origen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los orígenes</SelectItem>
            {Object.entries(JOURNAL_ORIGIN_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Un interruptor de filtro es un chip, no un checkbox. */}
        <button
          type="button"
          aria-pressed={includeVoided}
          onClick={() => {
            setIncludeVoided(!includeVoided);
            setPage(1);
          }}
          className={chipFiltro(includeVoided)}
        >
          Incluir anulados
        </button>

        <Select
          value={`${sortBy}:${sortDir}`}
          onValueChange={(v) => {
            const [b, d2] = v.split(':');
            setSortBy(b as 'number' | 'date');
            setSortDir(d2 as 'asc' | 'desc');
          }}
        >
          <SelectTrigger size="sm" className="w-[140px] data-[size=sm]:h-8">
            <SelectValue placeholder="Orden" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number:desc">N° desc</SelectItem>
            <SelectItem value="number:asc">N° asc</SelectItem>
            <SelectItem value="date:desc">Fecha desc</SelectItem>
            <SelectItem value="date:asc">Fecha asc</SelectItem>
          </SelectContent>
        </Select>

        {filtrosPuestos > 0 && (
          <LimpiarFiltros
            onLimpiar={() => {
              setFrom('');
              setTo('');
              setAccountId('');
              setOrigin('');
              setIncludeVoided(false);
              setPage(1);
            }}
          />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleExpandAll}
                disabled={rows.length === 0}
                aria-label={
                  allExpanded
                    ? 'Colapsar el detalle de todos los asientos'
                    : 'Expandir el detalle de todos los asientos'
                }
                className={cn(TOOLBAR_ICON_BTN, 'size-8 disabled:opacity-40')}
              >
                {allExpanded ? (
                  <ChevronsDownUp className="w-3.5 h-3.5" strokeWidth={2} />
                ) : (
                  <ChevronsUpDown className="w-3.5 h-3.5" strokeWidth={2} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {allExpanded
                ? 'Colapsar el detalle de todos los asientos'
                : 'Expandir el detalle de todos los asientos'}
            </TooltipContent>
          </Tooltip>

          {isOwner && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={exportLibroDiario}
                  aria-label="Descargar el Libro Diario en PDF"
                  className={cn(TOOLBAR_ICON_BTN, 'size-8')}
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Descargar el Libro Diario en PDF, para rubricar
              </TooltipContent>
            </Tooltip>
          )}

          {canWrite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setEditor({ mode: 'create' })}
                  aria-label="Nuevo asiento"
                  className="flex size-8 items-center justify-center rounded-[8px] bg-[var(--arca-accent)] text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Nuevo asiento</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <ArcaCard>
        {/* Los rótulos llevaban `text-white` al final de la lista de clases
          —resto de una versión con header navy—, así que se dibujaban blancos
          sobre fondo claro: invisibles. */}
        {selected.size > 0 && (
          <BarraSeleccion
            cantidad={selected.size}
            unidad="asiento"
            unidadPlural="asientos"
            onLimpiar={() => setSelected(new Set())}
          >
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-[var(--arca-accent-neg-fg)]"
              onClick={() => setVoidOpen(true)}
            >
              <Ban className="size-3.5" strokeWidth={2} />
              Anular {selected.size}
            </Button>
          </BarraSeleccion>
        )}
        <div className="flex items-center gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-4 py-2 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
          {canWrite && (
            <div className="w-4 shrink-0">
              {seleccionables.length > 0 && (
                <CasillaSeleccion
                  checked={paginaMarcada}
                  onChange={togglePagina}
                  label="Marcar los asientos de esta página"
                />
              )}
            </div>
          )}
          <div className="w-4 shrink-0" />
          <div className="w-12 shrink-0">N°</div>
          <div className="w-24 shrink-0">Fecha</div>
          <div className="flex-1 min-w-0">Descripción</div>
          <div className="w-28 shrink-0 text-right">Total</div>
          <div className="w-28 shrink-0">Origen</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando asientos…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay asientos para los filtros seleccionados.
          </div>
        ) : (
          rows.map((r) => (
            <EntryRow
              key={r.id}
              row={r}
              selectable={canWrite}
              checked={selected.has(r.id)}
              onCheck={() => toggleSelected(r.id)}
              expanded={expanded.has(r.id)}
              onToggle={() => toggleExpand(r.id)}
              canWrite={canWrite}
              onAction={openEditorFromDetail}
              onChanged={invalidate}
            />
          ))
        )}

        {/* El paginado de la plataforma, dentro de la card. */}
        {total > 0 && (
          <Paginador
            className="w-full min-w-0 border-t border-[var(--arca-border)] px-4 py-[11px]"
            pagina={page}
            totalPaginas={totalPages}
            onPagina={setPage}
            total={total}
            unidad="asiento"
            unidadPlural="asientos"
          />
        )}
      </ArcaCard>

      {voidOpen && (
        <AnularEnBloqueDialog
          clientId={clientId}
          entryIds={[...selected]}
          onClose={() => setVoidOpen(false)}
          onDone={() => {
            setVoidOpen(false);
            setSelected(new Set());
            invalidate();
          }}
        />
      )}

      {editor && (
        <AsientoEditor
          clientId={clientId}
          state={editor}
          postable={postable}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            invalidate();
          }}
        />
      )}
    </>
  );
}

function emptyLine(): LineDraft {
  return { accountId: '', debit: '', credit: '', description: '' };
}

function AsientoEditor({
  clientId,
  state,
  postable,
  onClose,
  onSaved,
}: {
  clientId: string;
  state: EditorState;
  postable: PostableAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const init = state.initial;
  const [entryDate, setEntryDate] = useState(init?.entryDate ?? '');
  const [description, setDescription] = useState(init?.description ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    init?.lines && init.lines.length >= 2
      ? init.lines
      : [emptyLine(), emptyLine()]
  );
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  // Un ref y no el estado: el cierre del hijo y el evento que lo disparó no
  // siempre caen en el mismo tick, y para cuando el diálogo de abajo mira el
  // estado ya volvió a false. El ref se libera un tick después del desmonte.
  const hayDialogoEncima = useRef(false);
  /**
   * Marca que hay un diálogo montado sobre el del asiento, para que este
   * ignore su propio cierre. Al cerrarse se libera un tick después, no en el
   * momento: el evento que cerró al hijo todavía está en vuelo.
   */
  const marcarDialogoEncima = (abierto: boolean) => {
    if (abierto) {
      hayDialogoEncima.current = true;
      return;
    }
    setTimeout(() => {
      hayDialogoEncima.current = false;
    }, 0);
  };
  const abrirNuevaCuenta = () => {
    marcarDialogoEncima(true);
    setCreateAccountOpen(true);
  };
  const cerrarNuevaCuenta = () => {
    setCreateAccountOpen(false);
    marcarDialogoEncima(false);
  };
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  /**
   * Qué template se cargó en el editor, para poder actualizarlo después.
   * El guardado pisa por (cliente, nombre), así que sin recordar el nombre el
   * usuario tiene que reescribirlo de memoria y una letra de más crea un
   * duplicado en vez de editar.
   */
  const [templateCargado, setTemplateCargado] = useState<{
    id: string;
    nombre: string;
  } | null>(null);
  /**
   * Template elegido que todavía no se aplicó, porque el asiento ya tenía
   * líneas. Aplicar reemplaza todo y no hay deshacer, así que pisar en
   * silencio lo que el usuario tipeó no es una opción.
   */
  const [templateAConfirmar, setTemplateAConfirmar] =
    useState<JournalTemplate | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const { data: chart } = useQuery({
    queryKey: ['accounting', 'chart', clientId],
    queryFn: () => getChartOfAccounts({ data: { clientId } }),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['accounting', 'templates', clientId],
    queryFn: () => listJournalTemplates({ data: { clientId } }),
  });

  /**
   * Un template guarda cuentas y lados, no importes. El lado sale de en qué
   * columna hay un número, así que una línea sin importe no se puede guardar —
   * y con menos de dos, el asiento no existe. Se explica acá y no después del
   * error del servidor, porque la regla no es adivinable.
   */
  /** Algo más que las dos líneas vacías con las que arranca el editor. */
  const hayContenido = lines.some(
    (l) =>
      l.accountId ||
      num(l.debit) > 0 ||
      num(l.credit) > 0 ||
      l.description.trim()
  );

  function elegirTemplate(t: JournalTemplate) {
    if (hayContenido) {
      marcarDialogoEncima(true);
      setTemplateAConfirmar(t);
      setTemplatePopoverOpen(false);
      return;
    }
    applyTemplate(t);
  }

  function ladoDeLinea(l: LineDraft): 'debe' | 'haber' | null {
    if (num(l.debit) > 0) return 'debe';
    if (num(l.credit) > 0) return 'haber';
    return l.lado ?? null;
  }

  function lineasParaTemplate() {
    return lines
      .map((l) => ({ linea: l, lado: ladoDeLinea(l) }))
      .filter((x) => x.linea.accountId && x.lado !== null);
  }

  const saveTemplateMut = useMutation({
    mutationFn: (args: { nombre: string; id?: string }) =>
      saveJournalTemplate({
        data: {
          clientId,
          nombre: args.nombre,
          id: args.id,
          // Una sola fuente: la misma función que valida antes de mandar.
          // Cuando esto estaba duplicado, la guarda y el payload podían no
          // coincidir y el error salía recién del servidor.
          lineas: lineasParaTemplate().map(({ linea, lado }) => ({
            cuentaId: linea.accountId,
            lado: lado!,
            descripcion: linea.description || undefined,
          })),
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({
        queryKey: ['accounting', 'templates', clientId],
      });
      // Queda apuntando al template guardado, así el siguiente cambio lo
      // vuelve a editar en vez de crear otro.
      setTemplateCargado({ id: res.id, nombre: nombreTipeado });
      setSaveTemplateOpen(false);
      setSaveTemplateName('');
      toast.success(
        accionGuardar === 'renombrar'
          ? `Template renombrado a «${nombreTipeado}»`
          : accionGuardar === 'crear'
            ? 'Template creado'
            : 'Template actualizado'
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: (id: string) => deleteJournalTemplate({ data: { id } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['accounting', 'templates', clientId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Qué va a pasar al guardar. Son tres cosas distintas y antes las tres se
   * veían igual, que es como renombrar terminaba creando un duplicado.
   */
  const nombreTipeado = saveTemplateName.trim();
  const otroConEseNombre = templates.find(
    (t) =>
      t.nombre.toLowerCase() === nombreTipeado.toLowerCase() &&
      t.id !== templateCargado?.id
  );
  const accionGuardar: 'crear' | 'actualizar' | 'renombrar' | 'pisar' =
    templateCargado
      ? nombreTipeado.toLowerCase() === templateCargado.nombre.toLowerCase()
        ? 'actualizar'
        : otroConEseNombre
          ? 'pisar'
          : 'renombrar'
      : otroConEseNombre
        ? 'pisar'
        : 'crear';

  function guardarTemplate(comoCopia = false) {
    const utiles = lineasParaTemplate();
    if (utiles.length < 2) {
      toast.error(
        'Un template necesita al menos dos líneas con una cuenta elegida y un ' +
          'importe en el debe o en el haber. El importe no se guarda: solo ' +
          'define de qué lado va la línea.'
      );
      return;
    }
    saveTemplateMut.mutate({
      nombre: nombreTipeado,
      // Sin id se crea (o se pisa el que tenga ese nombre); con id se edita
      // ese template, que es lo que permite renombrarlo.
      id: comoCopia ? undefined : templateCargado?.id,
    });
  }

  function applyTemplate(t: JournalTemplate) {
    setLines(
      t.lineas.map((l) => ({
        accountId: l.cuentaId,
        debit: l.lado === 'debe' ? '' : '0',
        credit: l.lado === 'haber' ? '' : '0',
        description: l.descripcion ?? '',
        lado: l.lado,
      }))
    );
    setTemplateCargado({ id: t.id, nombre: t.nombre });
    setTemplatePopoverOpen(false);
  }

  const title =
    state.mode === 'edit'
      ? `Editar asiento`
      : state.mode === 'duplicate'
        ? 'Duplicar asiento'
        : 'Nuevo asiento';

  const totalDebit = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;
  const allLinesValid = lines.every(
    (l) => l.accountId && num(l.debit) > 0 !== num(l.credit) > 0
  );
  const canSave = !!entryDate && lines.length >= 2 && balanced && allLinesValid;

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );

  // TIN-1443: detect when the entry date falls outside all fiscal years.
  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
    enabled: state.mode !== 'edit',
  });
  /**
   * Confirmación pendiente por fecha fuera del ejercicio (TIN-1443).
   *
   * El criterio pide un cartel «que el usuario debe confirmar para continuar»,
   * con el caso de prueba «cancelar la advertencia: el asiento no debe
   * guardarse». Un banner informativo no lo cumple: se puede guardar sin
   * haberlo leído, y no hay nada que cancelar.
   */
  const [confirmarFueraDeRango, setConfirmarFueraDeRango] = useState(false);

  const outOfRangeFy = useMemo(() => {
    if (!entryDate || !fiscalYears.length || state.mode === 'edit') return null;
    const inRange = fiscalYears.some(
      (fy) => entryDate >= fy.fechaDesde && entryDate <= fy.fechaHasta
    );
    if (inRange) return null;
    // Find the FY whose boundary is nearest to the entry date.
    return fiscalYears.reduce((prev, curr) => {
      const dist = (fy: (typeof fiscalYears)[0]) =>
        Math.min(
          Math.abs(
            new Date(entryDate).getTime() - new Date(fy.fechaDesde).getTime()
          ),
          Math.abs(
            new Date(entryDate).getTime() - new Date(fy.fechaHasta).getTime()
          )
        );
      return dist(curr) < dist(prev) ? curr : prev;
    });
  }, [entryDate, fiscalYears, state.mode]);

  const mut = useMutation({
    mutationFn: async () => {
      const payloadLines = lines.map((l) => ({
        accountId: l.accountId,
        debit: num(l.debit),
        credit: num(l.credit),
        description: l.description || undefined,
      }));
      if (state.mode === 'edit' && init?.id) {
        await updateJournalEntry({
          data: {
            id: init.id,
            entryDate,
            description: description || undefined,
            lines: payloadLines,
          },
        });
        return null;
      } else {
        return await createJournalEntry({
          data: {
            clientId,
            entryDate,
            description: description || undefined,
            lines: payloadLines,
            fiscalYearId: outOfRangeFy?.id,
          },
        });
      }
    },
    onSuccess: (result) => {
      if (result?.warning) toast.warning(result.warning);
      toast.success(
        state.mode === 'edit' ? 'Asiento actualizado' : 'Asiento guardado'
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {/* El asiento ignora su propio cierre mientras haya un diálogo encima:
          son dos diálogos hermanos y los dos montados con `open`, así que el
          Esc o el click que cerraba el de nueva cuenta cerraba también este y
          se perdía el asiento a medio cargar. */}
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o && !hayDialogoEncima.current) onClose();
        }}
      >
        <DialogContent
          className="sm:max-w-[760px]"
          onEscapeKeyDown={(e) => {
            if (hayDialogoEncima.current) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (hayDialogoEncima.current) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Debe = Haber para poder guardar. Solo cuentas imputables y
              activas. La fecha define el período (no puede estar en un período
              cerrado).
            </DialogDescription>
          </DialogHeader>

          {outOfRangeFy && (
            <div className="flex items-start gap-2 rounded-[8px] border border-[var(--arca-accent-warn)] bg-[var(--arca-accent-warn-bg)] px-3 py-2 text-[12.5px] text-[var(--arca-accent-warn-fg)]">
              <AlertTriangle
                className="w-3.5 h-3.5 mt-0.5 shrink-0"
                strokeWidth={2}
              />
              <span>
                La fecha está fuera del ejercicio vigente. El asiento se
                guardará en el ejercicio N°{outOfRangeFy.numero} (
                {fmtFecha(outOfRangeFy.fechaDesde)} –{' '}
                {fmtFecha(outOfRangeFy.fechaHasta)}).
              </span>
            </div>
          )}

          <div className="space-y-3 py-1">
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 w-44">
                <label className="text-[11px] text-[var(--arca-ink-3)]">
                  Fecha *
                </label>
                <SelectorFecha
                  value={entryDate}
                  onChange={(v) => setEntryDate(v)}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[11px] text-[var(--arca-ink-3)]">
                  Descripción
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Cobro factura A-0001 cliente X"
                  className={`${INPUT_CLASS} w-full h-9`}
                />
              </div>
            </div>

            {/* Template toolbar */}
            <div className="flex items-center justify-between">
              {/* `modal` por lo mismo que el selector de cuentas: portaleado
                fuera del diálogo, sin esto no scrollea. */}
              <Popover
                modal
                open={templatePopoverOpen}
                onOpenChange={setTemplatePopoverOpen}
              >
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] px-2 py-1 rounded-[6px] hover:bg-[var(--arca-surface-2)] transition-colors">
                    <Bookmark className="w-3 h-3" strokeWidth={2} />
                    Cargar template
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-72 p-0"
                  sideOffset={4}
                >
                  {/* Mismo combobox que el selector de cuentas: buscador
                      arriba y lista filtrable. Un estudio con muchos modelos
                      no los encuentra scrolleando. */}
                  <Command>
                    <CommandInput
                      placeholder="Buscar template..."
                      className="text-[12.5px]"
                    />
                    <CommandList className="max-h-60">
                      <CommandEmpty className="py-4 text-center text-[12px] text-[var(--arca-ink-3)]">
                        {templates.length === 0
                          ? 'Todavía no guardaste ningún template'
                          : 'Sin resultados'}
                      </CommandEmpty>
                      {templates.length > 0 && (
                        <CommandGroup heading="Templates">
                          {templates.map((t) => (
                            <CommandItem
                              key={t.id}
                              value={t.nombre}
                              onSelect={() => elegirTemplate(t)}
                              className="group text-[12.5px] gap-2"
                            >
                              <Bookmark
                                className="w-3 h-3 shrink-0 text-[var(--arca-ink-4)]"
                                strokeWidth={2}
                              />
                              <span className="flex-1 truncate">
                                {t.nombre}
                              </span>
                              <span
                                role="button"
                                tabIndex={-1}
                                aria-label={`Borrar ${t.nombre}`}
                                className="shrink-0 p-1 -m-1 rounded-[6px] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[oklch(0.55_0.18_25)] transition-all"
                                onPointerDown={(e) => {
                                  // Solo cortar la propagación: cmdk dispara
                                  // onSelect desde el click del ítem, y un
                                  // preventDefault acá se comería el nuestro.
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  deleteTemplateMut.mutate(t.id);
                                }}
                              >
                                <Trash2 className="w-3 h-3" strokeWidth={1.8} />
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {!saveTemplateOpen && (
                <button
                  className="flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] px-2 py-1 rounded-[6px] hover:bg-[var(--arca-surface-2)] transition-colors"
                  onClick={() => {
                    setSaveTemplateName(templateCargado?.nombre ?? '');
                    setSaveTemplateOpen(true);
                  }}
                >
                  <BookmarkPlus className="w-3 h-3" strokeWidth={2} />
                  {templateCargado
                    ? 'Guardar cambios'
                    : 'Guardar como template'}
                </button>
              )}
            </div>

            {saveTemplateOpen && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    value={saveTemplateName}
                    onChange={(e) => setSaveTemplateName(e.target.value)}
                    placeholder="Nombre del template…"
                    className={`${INPUT_CLASS} flex-1 h-8`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && saveTemplateName.trim())
                        guardarTemplate();
                      if (e.key === 'Escape') {
                        setSaveTemplateOpen(false);
                        setSaveTemplateName('');
                      }
                    }}
                  />
                  <button
                    onClick={() => guardarTemplate()}
                    disabled={
                      !saveTemplateName.trim() || saveTemplateMut.isPending
                    }
                    className="h-8 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
                  >
                    {saveTemplateMut.isPending
                      ? '…'
                      : accionGuardar === 'renombrar'
                        ? 'Renombrar'
                        : accionGuardar === 'crear'
                          ? 'Crear'
                          : 'Actualizar'}
                  </button>
                  <button
                    onClick={() => {
                      setSaveTemplateOpen(false);
                      setSaveTemplateName('');
                    }}
                    className="h-8 px-3 text-[12px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
                  >
                    Cancelar
                  </button>
                </div>

                {/* Decir de antemano qué va a pasar. Los cuatro casos se veían
                    igual, y así es como renombrar terminaba duplicando. */}
                {accionGuardar === 'renombrar' && (
                  <p className="text-[11px] text-[var(--arca-ink-3)] pl-0.5">
                    Se va a renombrar «{templateCargado?.nombre}» a «
                    {nombreTipeado}» y guardar las líneas actuales.{' '}
                    <button
                      type="button"
                      onClick={() => guardarTemplate(true)}
                      className="underline underline-offset-2 hover:text-[var(--arca-ink)]"
                    >
                      Guardar como copia
                    </button>{' '}
                    si preferís conservar los dos.
                  </p>
                )}
                {accionGuardar === 'pisar' && (
                  <p className="text-[11px] text-[oklch(0.55_0.14_60)] pl-0.5">
                    Ya existe un template «{nombreTipeado}»: se va a reemplazar
                    con las líneas que tenés ahora.
                  </p>
                )}
                {accionGuardar === 'actualizar' && (
                  <p className="text-[11px] text-[var(--arca-ink-3)] pl-0.5">
                    Se va a actualizar «{nombreTipeado}» con las líneas que
                    tenés ahora.
                  </p>
                )}
              </div>
            )}

            {/* Líneas */}
            <div className="border border-[var(--arca-border)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[10px] font-semibold">
                <div className="flex-1">Cuenta</div>
                <div className="w-40">Detalle</div>
                <div className="w-24 text-right">Debe</div>
                <div className="w-24 text-right">Haber</div>
                <div className="w-6" />
              </div>
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)]"
                >
                  <AccountCombobox
                    value={l.accountId}
                    onChange={(v) => updateLine(i, { accountId: v })}
                    postable={postable}
                    onCreate={abrirNuevaCuenta}
                  />
                  <input
                    value={l.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                    placeholder="opcional"
                    className={`${INPUT_CLASS} w-40 h-8`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.debit}
                    onChange={(e) =>
                      updateLine(i, { debit: e.target.value, credit: '' })
                    }
                    className={`${INPUT_CLASS} w-24 h-8 text-right`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.credit}
                    onChange={(e) =>
                      updateLine(i, { credit: e.target.value, debit: '' })
                    }
                    className={`${INPUT_CLASS} w-24 h-8 text-right`}
                  />
                  <button
                    onClick={() =>
                      setLines((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    disabled={lines.length <= 2}
                    className="w-6 h-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:text-[oklch(0.55_0.18_25)] disabled:opacity-30"
                    title="Eliminar línea"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
              {/* Totales */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[12px] font-semibold">
                <button
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                  className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} /> Agregar línea
                </button>
                <div className="flex-1" />
                <div className="w-40" />
                <div className="w-24 text-right text-[var(--arca-ink)]">
                  $ {fmtMoney(totalDebit)}
                </div>
                <div className="w-24 text-right text-[var(--arca-ink)]">
                  $ {fmtMoney(totalCredit)}
                </div>
                <div className="w-6" />
              </div>
            </div>

            <div className="flex items-center justify-end text-[12px]">
              {balanced ? (
                <span className="text-[oklch(0.40_0.14_145)]">
                  ✓ Asiento balanceado
                </span>
              ) : (
                <span className="text-[oklch(0.55_0.18_25)]">
                  Diferencia: $ {fmtMoney(Math.abs(totalDebit - totalCredit))} —
                  Debe debe ser igual a Haber
                </span>
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={onClose}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (outOfRangeFy) {
                  marcarDialogoEncima(true);
                  setConfirmarFueraDeRango(true);
                  return;
                }
                mut.mutate();
              }}
              disabled={!canSave || mut.isPending}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
            >
              {mut.isPending ? 'Guardando…' : 'Guardar asiento'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {createAccountOpen && (
        <AccountFormDialog
          mode={{ kind: 'custom' }}
          clientId={clientId}
          accounts={chart?.accounts ?? []}
          onClose={cerrarNuevaCuenta}
          onSaved={() => {
            cerrarNuevaCuenta();
            void qc.invalidateQueries({
              queryKey: ['accounting', 'postable', clientId],
            });
            void qc.invalidateQueries({
              queryKey: ['accounting', 'chart', clientId],
            });
          }}
        />
      )}

      {/* Fecha fuera del ejercicio: el criterio de TIN-1443 pide confirmar
          para continuar, y que cancelar NO guarde el asiento. */}
      <AlertDialog
        open={confirmarFueraDeRango}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmarFueraDeRango(false);
            marcarDialogoEncima(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              La fecha está fuera del ejercicio vigente
            </AlertDialogTitle>
            <AlertDialogDescription>
              El asiento del {entryDate ? fmtFecha(entryDate) : ''} se va a
              guardar en el ejercicio N°{outOfRangeFy?.numero} (
              {outOfRangeFy ? fmtFecha(outOfRangeFy.fechaDesde) : ''} –{' '}
              {outOfRangeFy ? fmtFecha(outOfRangeFy.fechaHasta) : ''}), que es
              el más cercano a esa fecha. Revisá que sea el ejercicio correcto
              antes de continuar: el asiento va a numerarse dentro de ese
              ejercicio y va a impactar en sus estados contables.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmarFueraDeRango(false);
                marcarDialogoEncima(false);
                mut.mutate();
              }}
            >
              Guardar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reemplazar las líneas cargadas no se puede deshacer, así que va en un
          diálogo y no en un cartel dentro del popover: ahí es fácil apretar de
          más sin leer. `marcarDialogoEncima` evita que este cierre arrastre al
          del asiento, que es el problema que tuvimos con «nueva cuenta». */}
      <AlertDialog
        open={templateAConfirmar !== null}
        onOpenChange={(o) => {
          if (!o) {
            setTemplateAConfirmar(null);
            marcarDialogoEncima(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Este asiento ya tiene líneas cargadas
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cargar «{templateAConfirmar?.nombre}» reemplaza las{' '}
              {lines.filter((l) => l.accountId).length} líneas actuales por las
              del template. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (templateAConfirmar) applyTemplate(templateAConfirmar);
                setTemplateAConfirmar(null);
                marcarDialogoEncima(false);
              }}
            >
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Cuerpo del detalle de un asiento (líneas + log + acciones). Compartido por la
 * fila expandible del libro diario y por el diálogo de drill-down (Mayor/Balance).
 */
function EntryDetailBody({
  entryId,
  canWrite,
  readOnly,
  onAction,
  onDone,
}: {
  entryId: string;
  canWrite: boolean;
  /** Solo lectura: oculta las acciones (Duplicar/Anular/Editar). Se usa en el
   * drill-down del Mayor/Balance, donde el asiento se consulta, no se edita. */
  readOnly?: boolean;
  onAction: (action: 'edit' | 'duplicate', initial: EditorInitial) => void;
  onDone: () => void;
}) {
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'entry', entryId],
    queryFn: () => getJournalEntry({ data: { id: entryId } }),
  });

  const voidMut = useMutation({
    mutationFn: () =>
      voidJournalEntry({ data: { id: entryId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success('Asiento anulado');
      setVoidOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="py-6 text-center text-[12.5px] text-[var(--arca-ink-3)]">
        Cargando…
      </div>
    );
  }

  const toInitial = (): EditorInitial => ({
    id: data.entry.id,
    entryDate: new Date(data.entry.fecha).toISOString().slice(0, 10),
    description: data.entry.descripcion ?? '',
    lines: data.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit > 0 ? String(l.debit) : '',
      credit: l.credit > 0 ? String(l.credit) : '',
      description: l.description ?? '',
    })),
  });

  const editable = !data.entry.anulado && data.entry.periodStatus === 'abierto';

  return (
    <div className="space-y-3">
      {data.entry.anulado && data.entry.motivoAnulacion && (
        <div className="text-[12px] rounded-[8px] bg-[color-mix(in_oklch,oklch(0.55_0.18_25),transparent_92%)] text-[oklch(0.45_0.16_25)] px-3 py-2">
          Motivo de anulación: {data.entry.motivoAnulacion}
        </div>
      )}

      {/* Comprobante origen + regla aplicada (asientos automáticos) — US 1.3.5 */}
      {(data.source != null || data.rule != null) && (
        <div className="text-[12px] rounded-[8px] bg-[var(--arca-surface-2)] px-3 py-2 space-y-1">
          {data.source && (
            <div className="flex flex-wrap items-center gap-x-1.5">
              <span className="text-[var(--arca-ink-3)]">
                Comprobante origen:
              </span>
              <Link
                to="/invoices"
                search={{ open: data.source.id }}
                className="font-medium text-[var(--arca-accent)] underline underline-offset-2 hover:opacity-80"
              >
                {data.source.label}
              </Link>
              <span className="text-[var(--arca-ink-3)]">
                · {data.source.counterparty} · $ {fmtMoney(data.source.amount)}
              </span>
            </div>
          )}
          {data.rule && (
            <div>
              <span className="text-[var(--arca-ink-3)]">Regla aplicada: </span>
              <span className="font-medium text-[var(--arca-ink)]">
                {data.rule.name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Líneas */}
      <div className="border border-[var(--arca-border)] rounded-xl overflow-hidden bg-[var(--arca-surface)]">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[10px] font-semibold">
          <div className="flex-1">Cuenta</div>
          <div className="w-28 text-right">Debe</div>
          <div className="w-28 text-right">Haber</div>
        </div>
        {data.lines.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)] text-[12.5px]"
          >
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[11px] text-[var(--arca-ink-3)]">
                {l.accountCode}
              </span>{' '}
              <span className="text-[var(--arca-ink)]">{l.accountName}</span>
              {l.description && (
                <span className="text-[var(--arca-ink-3)]">
                  {' '}
                  · {l.description}
                </span>
              )}
            </div>
            <div className="w-28 text-right text-[var(--arca-ink)]">
              {l.debit > 0 ? `$ ${fmtMoney(l.debit)}` : ''}
            </div>
            <div className="w-28 text-right text-[var(--arca-ink)]">
              {l.credit > 0 ? `$ ${fmtMoney(l.credit)}` : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Log adjunto */}
      {data.log.length > 0 && (
        <div className="text-[11.5px] text-[var(--arca-ink-3)] space-y-1">
          {data.log.map((e) => (
            <div key={e.id}>
              {e.eventType === 'journal_entry_voided' ? 'Anulado' : 'Editado'}{' '}
              por {e.userName ?? e.userEmail ?? 'usuario'} ·{' '}
              {new Date(e.createdAt).toLocaleString('es-AR')}
              {e.eventData?.reason ? ` · Motivo: ${e.eventData.reason}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Acciones */}
      {canWrite && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            onClick={() =>
              onAction('duplicate', {
                ...toInitial(),
                id: undefined,
                entryDate: '',
              })
            }
            className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.8} /> Duplicar
          </button>
          {editable && (
            <>
              <button
                onClick={() => setVoidOpen((v) => !v)}
                className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[oklch(0.50_0.16_25)] hover:bg-[color-mix(in_oklch,oklch(0.55_0.18_25),transparent_92%)]"
              >
                <Ban className="w-3.5 h-3.5" strokeWidth={1.8} /> Anular
              </button>
              <button
                onClick={() => onAction('edit', toInitial())}
                className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} /> Editar
              </button>
            </>
          )}
        </div>
      )}

      {/* Anular: confirmación inline con motivo */}
      {voidOpen && (
        <div className="rounded-[10px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-3 space-y-2">
          <p className="text-[12px] text-[var(--arca-ink-3)]">
            El asiento no se borra: queda marcado como anulado y conserva su
            número. El motivo queda en el log.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Motivo de la anulación…"
            className="w-full px-2.5 py-2 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setVoidOpen(false)}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
            >
              Cancelar
            </button>
            <button
              onClick={() => voidMut.mutate()}
              disabled={!reason.trim() || voidMut.isPending}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[oklch(0.50_0.16_25)] text-white disabled:opacity-50"
            >
              Anular asiento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Diálogo de detalle de un asiento (drill-down desde Mayor/Balance). */
function AsientoDetail({
  entryId,
  canWrite,
  readOnly,
  onClose,
  onAction,
  onChanged,
}: {
  entryId: string;
  canWrite: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onAction: (action: 'edit' | 'duplicate', initial: EditorInitial) => void;
  onChanged: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['accounting', 'entry', entryId],
    queryFn: () => getJournalEntry({ data: { id: entryId } }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data ? `Asiento N°${data.entry.numero}` : 'Asiento'}
            {data?.entry.anulado && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_oklch,oklch(0.55_0.18_25),transparent_88%)] text-[oklch(0.50_0.18_25)]">
                Anulado
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${fmtFecha(data.entry.fecha)} · ${
                  JOURNAL_ORIGIN_LABELS[data.entry.origenTipo] ??
                  data.entry.origenTipo
                } · Ejercicio N°${data.entry.fyNumber}${
                  data.entry.createdByName
                    ? ` · cargado por ${data.entry.createdByName}`
                    : ''
                }`
              : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>
        {data?.entry.descripcion && (
          <p className="text-[13px] text-[var(--arca-ink)] -mt-1">
            {data.entry.descripcion}
          </p>
        )}
        <EntryDetailBody
          entryId={entryId}
          canWrite={canWrite}
          readOnly={readOnly}
          onAction={onAction}
          onDone={() => {
            onChanged();
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Fila expandible del libro diario: resumen clickeable + detalle inline. */
/** Casilla de selección de una fila (cuadrado vacío / tildado). */
function CasillaSeleccion({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="inline-flex"
    >
      {checked ? (
        <CheckSquare
          className="w-4 h-4 text-[var(--arca-accent)]"
          strokeWidth={2}
        />
      ) : (
        <Square className="w-4 h-4 text-[var(--arca-ink-3)]" strokeWidth={2} />
      )}
    </button>
  );
}

/** Franja que aparece arriba de una tabla cuando hay filas marcadas. */
function BarraSeleccion({
  cantidad,
  unidad,
  unidadPlural,
  onLimpiar,
  children,
}: {
  cantidad: number;
  unidad: string;
  unidadPlural: string;
  onLimpiar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--arca-border)] bg-[var(--arca-accent-bg)] px-4 py-2 text-[12.5px]">
      <span className="font-medium text-[var(--arca-ink)]">
        {cantidad} {cantidad === 1 ? unidad : unidadPlural}{' '}
        {cantidad === 1 ? 'marcado' : 'marcados'}
      </span>
      <button
        type="button"
        onClick={onLimpiar}
        className="text-[12px] text-[var(--arca-ink-3)] underline-offset-2 hover:underline"
      >
        Desmarcar
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

/** Lo que el contador pregunta antes de anular: que no borra ni mueve saldos. */
function QueHaceAnular() {
  return (
    <>
      <p>
        Un asiento anulado <strong>deja de sumar</strong> en el mayor, el
        balance y los estados contables. No se borra: queda en el Libro Diario
        tachado, con el motivo, y conserva su número.
      </p>
      <p>
        Si era un asiento automático de una factura, la factura vuelve a quedar
        pendiente en <strong>Contabilizar</strong>. Los asientos de períodos
        cerrados no se tocan.
      </p>
    </>
  );
}

/** Anula varios asientos de una vez, con un motivo. */
function AnularEnBloqueDialog({
  clientId,
  entryIds,
  onClose,
  onDone,
}: {
  clientId: string;
  entryIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () =>
      voidJournalEntries({
        data: { clientId, ids: entryIds, reason: reason.trim() },
      }),
    onSuccess: (r) => {
      const partes = [`${r.voided} asiento(s) anulado(s)`];
      if (r.skippedClosed > 0)
        partes.push(`${r.skippedClosed} en período cerrado, sin tocar`);
      toast.success(partes.join(' · '));
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Anular {entryIds.length}{' '}
            {entryIds.length === 1 ? 'asiento' : 'asientos'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <QueHaceAnular />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (ej. reglas mal configuradas)"
          className={`${INPUT_CLASS} w-full h-9`}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Anulando…' : 'Anular'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Reinicia la contabilización automática de facturas del ejercicio: anula sus
 * asientos generados y las facturas quedan listas para volver a generarse con
 * las reglas corregidas. Primero muestra cuántos va a tocar.
 */
function ReiniciarEjercicioDialog({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [includeEdited, setIncludeEdited] = useState(false);
  const { data: preview, isLoading } = useQuery({
    queryKey: ['accounting', 'reset-preview', clientId, includeEdited],
    queryFn: () =>
      resetFiscalYearInvoiceEntries({
        data: { clientId, includeEdited, dryRun: true },
      }),
  });
  const mut = useMutation({
    mutationFn: () =>
      resetFiscalYearInvoiceEntries({
        data: {
          clientId,
          fiscalYearId: preview?.fiscalYear.id,
          includeEdited,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.voided} asiento(s) anulado(s). Las facturas quedaron pendientes para volver a generarlas.`
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reiniciar asientos de facturas</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Anula{' '}
                <strong>todos los asientos automáticos de facturas</strong> del
                ejercicio
                {preview
                  ? ` ${fmtFecha(preview.fiscalYear.from)} – ${fmtFecha(preview.fiscalYear.to)}`
                  : ''}
                . Los asientos manuales, de sueldos, de apertura y de cierre no
                se tocan.
              </p>
              <QueHaceAnular />
              <p>
                Después corregí las reglas y generá de nuevo desde esta misma
                pantalla.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-[8px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 text-[12.5px]">
          {isLoading || !preview ? (
            'Contando asientos…'
          ) : (
            <>
              Se van a anular <strong>{preview.voided}</strong> asiento(s).
              {preview.skippedClosed > 0 && (
                <>
                  {' '}
                  {preview.skippedClosed} están en períodos cerrados y quedan
                  como están.
                </>
              )}
              {!includeEdited && preview.skippedEdited > 0 && (
                <>
                  {' '}
                  {preview.skippedEdited} fueron editados a mano y se conservan.
                </>
              )}
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--arca-ink-2)]">
          <Checkbox
            checked={includeEdited}
            onCheckedChange={(v) => setIncludeEdited(v === true)}
          />
          Anular también los que se editaron a mano
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!preview || preview.voided === 0 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending
              ? 'Reiniciando…'
              : `Anular ${preview?.voided ?? ''} asientos`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EntryRow({
  row,
  selectable,
  checked,
  onCheck,
  expanded,
  onToggle,
  canWrite,
  onAction,
  onChanged,
}: {
  row: JournalEntryListRow;
  selectable: boolean;
  checked: boolean;
  onCheck: () => void;
  expanded: boolean;
  onToggle: () => void;
  canWrite: boolean;
  onAction: (action: 'edit' | 'duplicate', initial: EditorInitial) => void;
  onChanged: () => void;
}) {
  return (
    <div className="border-b border-[var(--arca-border)]">
      {/* La casilla va afuera del botón de la fila: un control dentro de otro
        no es HTML válido, y el clic en la casilla no debe abrir el detalle. */}
      <div
        className={cn(
          'flex items-center hover:bg-[var(--arca-surface-2)] transition-colors',
          checked && 'bg-[var(--arca-accent-bg)]'
        )}
      >
        {selectable && (
          <div className="w-4 shrink-0 ml-4">
            {!row.isVoided && (
              <CasillaSeleccion
                checked={checked}
                onChange={onCheck}
                label={`Marcar el asiento ${row.number}`}
              />
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            'flex-1 min-w-0 flex items-center gap-3 py-2.5 pr-4 text-left',
            selectable ? 'pl-3' : 'pl-4'
          )}
        >
          <span className="w-4 shrink-0 text-[var(--arca-ink-3)]">
            {expanded ? (
              <ChevronDown className="w-4 h-4" strokeWidth={1.8} />
            ) : (
              <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
            )}
          </span>
          <div className="w-12 shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
            {row.number}
          </div>
          <div className="w-24 shrink-0 text-[12px] text-[var(--arca-ink-2)]">
            {fmtFecha(row.entryDate)}
          </div>
          <div
            className={`flex-1 min-w-0 truncate text-[13px] ${
              row.isVoided
                ? 'line-through text-[var(--arca-ink-3)]'
                : 'text-[var(--arca-ink)]'
            }`}
          >
            {row.description?.trim() ? (
              row.description
            ) : (
              <span className="text-[var(--arca-ink-3)] italic">
                (sin descripción)
              </span>
            )}
            {row.isVoided && (
              <span className="ml-2 text-[10px] not-italic no-underline text-[oklch(0.55_0.18_25)]">
                ANULADO
              </span>
            )}
          </div>
          <div className="w-28 shrink-0 text-right text-[12.5px] font-medium text-[var(--arca-ink)]">
            $ {fmtMoney(row.total)}
          </div>
          <div className="w-28 shrink-0">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
              {JOURNAL_ORIGIN_LABELS[row.origin] ?? row.origin}
            </span>
          </div>
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 pl-11 bg-[color-mix(in_oklch,var(--arca-surface-2),transparent_45%)]">
          <EntryDetailBody
            entryId={row.id}
            canWrite={canWrite}
            onAction={onAction}
            onDone={onChanged}
          />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════ Mayor / Libro Mayor (US 2.1.x) ════════════════════════ */

function saldoLabel(n: number): string {
  if (Math.abs(n) < 0.005) return '$ 0,00';
  return `$ ${fmtMoney(Math.abs(n))} ${n >= 0 ? 'D' : 'H'}`;
}

/**
 * Anchos de las columnas del mayor consolidado. Van en constantes porque los
 * comparten el encabezado, la fila de cada cuenta y la de totales: cuando cada
 * uno traía su propio ancho, los totales no caían debajo de su columna.
 *
 * Las de importes son anchas a propósito. Con `w-24` un saldo de nueve cifras
 * partía el «$» en un renglón y el número en el siguiente, y la «D»/«H» del
 * saldo se iba sola a un tercero.
 */
const MAYOR_COL_CODE = 'w-24 shrink-0';
const MAYOR_COL_MONEY =
  'w-32 shrink-0 text-right tabular-nums whitespace-nowrap';
const MAYOR_COL_SALDO =
  'w-36 shrink-0 text-right tabular-nums whitespace-nowrap';

function Mayor({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const [mode, setMode] = useState<'cuenta' | 'consolidado'>('consolidado');
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [origin, setOrigin] = useState<'' | JournalOrigin>('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId =
    fiscalYearId !== '' ? fiscalYearId : defaultFiscalYearId(fiscalYears);

  const { data: chart } = useQuery({
    queryKey: ['accounting', 'chart', clientId],
    queryFn: () => getChartOfAccounts({ data: { clientId } }),
  });
  const imputables = (chart?.accounts ?? []).filter(
    (a) => a.type === 'imputable'
  );

  const originArg = origin || undefined;

  const { data: ledger, isLoading: loadingLedger } = useQuery({
    queryKey: [
      'accounting',
      'ledger-account',
      clientId,
      accountId,
      effectiveFyId,
      from,
      to,
      origin,
    ],
    queryFn: () =>
      getLedgerAccount({
        data: {
          clientId,
          accountId,
          fiscalYearId: effectiveFyId || undefined,
          from: from || undefined,
          to: to || undefined,
          origin: originArg,
        },
      }),
    enabled: mode === 'cuenta' && !!accountId && !!effectiveFyId,
  });

  const { data: consol, isLoading: loadingConsol } = useQuery({
    queryKey: [
      'accounting',
      'ledger-consol',
      clientId,
      effectiveFyId,
      from,
      to,
      origin,
    ],
    queryFn: () =>
      getLedgerConsolidated({
        data: {
          clientId,
          fiscalYearId: effectiveFyId || undefined,
          from: from || undefined,
          to: to || undefined,
          origin: originArg,
        },
      }),
    enabled: mode === 'consolidado' && !!effectiveFyId,
  });

  function buildExportData(): MayorExportData | null {
    if (mode === 'cuenta') {
      if (!ledger) return null;
      const section: MayorSection = {
        code: ledger.cuenta.code,
        name: ledger.cuenta.name,
        saldoInicial: ledger.saldoInicial,
        rows: ledger.rows,
        totalDebit: ledger.totalDebit,
        totalCredit: ledger.totalCredit,
        saldoFinal: ledger.saldoFinal,
      };
      return {
        empresaName: clientName,
        fiscalYearNumber: ledger.ejercicio.number,
        from: ledger.from,
        to: ledger.to,
        sections: [section],
      };
    }
    if (!consol?.ejercicio) return null;
    return {
      empresaName: clientName,
      fiscalYearNumber: consol.ejercicio.number,
      from: consol.from,
      to: consol.to,
      sections: consol.accounts.map((a) => ({
        code: a.code,
        name: a.name,
        saldoInicial: a.saldoInicial,
        rows: a.movements,
        totalDebit: a.totalDebit,
        totalCredit: a.totalCredit,
        saldoFinal: a.saldoFinal,
      })),
    };
  }

  /** Cuántos filtros propios están puestos (el ejercicio y el modo no son
   *  filtros: son en qué se está parado). */
  const filtrosPuestos = (from ? 1 : 0) + (to ? 1 : 0) + (origin ? 1 : 0);

  const exportXlsx = (sheetPerAccount: boolean) => {
    const data = buildExportData();
    if (!data || data.sections.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportMayorExcel(data, { sheetPerAccount }).catch((e: Error) =>
      toast.error(e.message)
    );
  };
  const exportPdf = () => {
    const data = buildExportData();
    if (!data || data.sections.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportMayorPdf(data).catch((e: Error) => toast.error(e.message));
  };

  const toggleAcc = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa no tiene ejercicios. Creá uno en la pestaña Ejercicios
          para ver el mayor.
        </div>
      </ArcaCard>
    );
  }

  return (
    <>
      {/* Los filtros, afuera de la card. Arriba las descargas —así nunca se
        caen de renglón cuando aparece "Limpiar"— y debajo los filtros, todos
        de la misma altura. */}
      <div className="mb-[10px] flex flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="size-3.5" strokeWidth={1.8} />
              Excel
            </Button>
          </DropdownMenuTrigger>
          {/* "Excel: hoja por cuenta" era un checkbox al lado del botón, y no
            se entendía qué cambiaba. Ahora la pregunta aparece al tocar
            Excel, que es cuando importa. */}
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-[12.5px]"
              onSelect={() => exportXlsx(false)}
            >
              Una sola hoja
            </DropdownMenuItem>
            {mode === 'consolidado' && (
              <DropdownMenuItem
                className="text-[12.5px]"
                onSelect={() => exportXlsx(true)}
              >
                Una hoja por cuenta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={exportPdf}
        >
          <Download className="size-3.5" strokeWidth={1.8} />
          PDF
        </Button>
      </div>

      <div className="mb-[10px] flex flex-wrap items-center gap-2">
        {/* Segmentado del sistema, el mismo de "14 días · Mes · Trimestre". */}
        <div
          role="tablist"
          className="flex items-center gap-0.5 rounded-lg bg-[var(--arca-surface-2)] p-[3px]"
        >
          {(['cuenta', 'consolidado'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'flex h-[26px] items-center rounded-md px-3 text-[12.5px] font-medium transition-colors duration-[120ms]',
                mode === m
                  ? 'bg-[var(--arca-surface)] text-[var(--arca-ink)] shadow-[0_1px_2px_rgba(16,23,32,0.08)]'
                  : 'text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]'
              )}
            >
              {m === 'cuenta' ? 'Por cuenta' : 'Consolidado'}
            </button>
          ))}
        </div>

        {fiscalYears.length > 1 && (
          <Select
            value={effectiveFyId}
            onValueChange={(v) => setFiscalYearId(v)}
          >
            {/* Al ancho del rótulo más largo: "Ejercicio N°12" entraba justo
              y se truncaba. */}
            <SelectTrigger size="sm" className="w-[160px] data-[size=sm]:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  Ejercicio N°{y.numero}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {mode === 'cuenta' && (
          <SearchableSelect
            size="sm"
            width={230}
            value={accountId}
            onValueChange={(v) => setAccountId(v)}
            placeholder="— Elegí una cuenta —"
            searchPlaceholder="Buscar cuenta…"
            label="Cuenta"
            options={imputables.map((a) => ({
              value: a.id,
              label: `${a.code} · ${a.name}`,
            }))}
          />
        )}

        <SelectorFecha
          size="sm"
          value={from}
          onChange={(v) => setFrom(v)}
          placeholder="Desde"
          aria-label="Mayor desde"
          className="w-[132px]"
        />
        <SelectorFecha
          size="sm"
          value={to}
          onChange={(v) => setTo(v)}
          placeholder="Hasta"
          aria-label="Mayor hasta"
          className="w-[132px]"
        />

        <Select
          value={origin === '' ? 'all' : origin}
          onValueChange={(v) =>
            setOrigin(v === 'all' ? '' : (v as JournalOrigin))
          }
        >
          <SelectTrigger size="sm" className="w-[180px] data-[size=sm]:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los orígenes</SelectItem>
            {Object.entries(JOURNAL_ORIGIN_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtrosPuestos > 0 && (
          <LimpiarFiltros
            onLimpiar={() => {
              setFrom('');
              setTo('');
              setOrigin('');
            }}
          />
        )}
      </div>

      <ArcaCard>
        {/* Body */}
        {mode === 'cuenta' ? (
          !accountId ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Elegí una cuenta para ver su mayor.
            </div>
          ) : loadingLedger ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Cargando…
            </div>
          ) : !ledger ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Sin datos.
            </div>
          ) : (
            <LedgerTable
              saldoInicial={ledger.saldoInicial}
              rows={ledger.rows}
              totalDebit={ledger.totalDebit}
              totalCredit={ledger.totalCredit}
              saldoFinal={ledger.saldoFinal}
              onRowClick={(id) => setDetailId(id)}
            />
          )
        ) : loadingConsol ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : !consol || consol.accounts.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay movimientos en el rango seleccionado.
          </div>
        ) : (
          <div>
            {/* Sin encabezado, las tres columnas de plata no decían cuál era
                el Debe, cuál el Haber y cuál el saldo. */}
            {/* Misma altura que el header de la tabla del sistema (38px): a
              py-1.5 el rótulo quedaba aplastado contra las filas. */}
            <div className="flex h-[38px] items-center gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-4 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
              <span className="w-4 shrink-0" aria-hidden />
              <span className={MAYOR_COL_CODE}>Código</span>
              <span className="flex-1 min-w-0">Cuenta</span>
              <span className={MAYOR_COL_MONEY}>Debe</span>
              <span className={MAYOR_COL_MONEY}>Haber</span>
              <span className={MAYOR_COL_SALDO}>Saldo</span>
            </div>
            {consol.accounts.map((a) => (
              <ConsolidatedAccountRow
                key={a.accountId}
                acc={a}
                expanded={expanded.has(a.accountId)}
                onToggle={() => toggleAcc(a.accountId)}
                onRowClick={(id) => setDetailId(id)}
              />
            ))}
            <div className="flex items-center gap-3 px-4 py-3 border-t-2 border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[13px] font-semibold">
              <span className="w-4 shrink-0" aria-hidden />
              <span className={MAYOR_COL_CODE} />
              <span className="flex-1 min-w-0">Totales generales</span>
              <span className={MAYOR_COL_MONEY}>
                $ {fmtMoney(consol.grandTotalDebit)}
              </span>
              <span className={MAYOR_COL_MONEY}>
                $ {fmtMoney(consol.grandTotalCredit)}
              </span>
              <span className={MAYOR_COL_SALDO} />
            </div>
          </div>
        )}
      </ArcaCard>

      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          readOnly
          onClose={() => setDetailId(null)}
          onAction={() => setDetailId(null)}
          onChanged={() => {
            /* el mayor se recalcula al cerrar por invalidación de queries */
          }}
        />
      )}
    </>
  );
}

function LedgerTable({
  saldoInicial,
  rows,
  totalDebit,
  totalCredit,
  saldoFinal,
  onRowClick,
}: {
  saldoInicial: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  saldoFinal: number;
  onRowClick: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex h-[38px] items-center gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-4 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
        <div className="w-24 shrink-0">Fecha</div>
        <div className="w-12 shrink-0">N°</div>
        <div className="flex-1 min-w-0">Descripción</div>
        <div className="w-24 shrink-0 text-right">Debe</div>
        <div className="w-24 shrink-0 text-right">Haber</div>
        <div className="w-28 shrink-0 text-right">Saldo</div>
      </div>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] text-[12.5px] italic text-[var(--arca-ink-3)]">
        <div className="flex-1">Saldo inicial</div>
        <div className="w-28 shrink-0 text-right not-italic font-medium text-[var(--arca-ink)]">
          {saldoLabel(saldoInicial)}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
          Sin movimientos en el rango.
        </div>
      ) : (
        rows.map((r, i) => (
          <button
            key={`${r.entryId}-${i}`}
            onClick={() => onRowClick(r.entryId)}
            className="w-full flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-left text-[12.5px]"
          >
            <div className="w-24 shrink-0 text-[var(--arca-ink-2)]">
              {fmtFecha(r.entryDate)}
            </div>
            <div className="w-12 shrink-0 font-mono text-[var(--arca-ink-3)]">
              {r.number}
            </div>
            <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
              {r.description ?? r.lineDescription ?? ''}
            </div>
            <div className="w-24 shrink-0 text-right">
              {r.debit ? fmtMoney(r.debit) : ''}
            </div>
            <div className="w-24 shrink-0 text-right">
              {r.credit ? fmtMoney(r.credit) : ''}
            </div>
            <div className="w-28 shrink-0 text-right font-medium">
              {saldoLabel(r.balance)}
            </div>
          </button>
        ))
      )}
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[12.5px] font-semibold">
        <div className="flex-1">Totales del período</div>
        <div className="w-24 shrink-0 text-right">$ {fmtMoney(totalDebit)}</div>
        <div className="w-24 shrink-0 text-right">
          $ {fmtMoney(totalCredit)}
        </div>
        <div className="w-28 shrink-0 text-right">{saldoLabel(saldoFinal)}</div>
      </div>
    </div>
  );
}

function ConsolidatedAccountRow({
  acc,
  expanded,
  onToggle,
  onRowClick,
}: {
  acc: ConsolidatedAccount;
  expanded: boolean;
  onToggle: () => void;
  onRowClick: (id: string) => void;
}) {
  return (
    <div className="border-b border-[var(--arca-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--arca-surface-2)] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown
            className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
        ) : (
          <ChevronRight
            className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
        )}
        <span
          className={`${MAYOR_COL_CODE} text-[12px] font-mono text-[var(--arca-ink-3)]`}
        >
          {acc.code}
        </span>
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-[var(--arca-ink)]">
          {acc.name}
        </span>
        <span className={`${MAYOR_COL_MONEY} text-[12px]`}>
          $ {fmtMoney(acc.totalDebit)}
        </span>
        <span className={`${MAYOR_COL_MONEY} text-[12px]`}>
          $ {fmtMoney(acc.totalCredit)}
        </span>
        <span className={`${MAYOR_COL_SALDO} text-[12.5px] font-medium`}>
          {saldoLabel(acc.saldoFinal)}
        </span>
      </button>
      {expanded && (
        <div className="bg-[var(--arca-surface-2)] pl-6">
          <div className="flex items-center gap-3 px-4 py-1.5 text-[11.5px] italic text-[var(--arca-ink-3)]">
            <div className="flex-1 min-w-0">Saldo inicial</div>
            <div className={`${MAYOR_COL_SALDO} not-italic`}>
              {saldoLabel(acc.saldoInicial)}
            </div>
          </div>
          {acc.movements.map((r, i) => (
            <button
              key={`${r.entryId}-${i}`}
              onClick={() => onRowClick(r.entryId)}
              className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-[var(--arca-surface)] transition-colors text-left text-[12px] border-t border-[var(--arca-border)]"
            >
              <div className="w-24 shrink-0 text-[var(--arca-ink-2)]">
                {fmtFecha(r.entryDate)}
              </div>
              <div className="w-12 shrink-0 font-mono text-[var(--arca-ink-3)]">
                {r.number}
              </div>
              <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
                {r.description ?? r.lineDescription ?? ''}
              </div>
              <div className={MAYOR_COL_MONEY}>
                {r.debit ? fmtMoney(r.debit) : ''}
              </div>
              <div className={MAYOR_COL_MONEY}>
                {r.credit ? fmtMoney(r.credit) : ''}
              </div>
              <div className={MAYOR_COL_SALDO}>{saldoLabel(r.balance)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════ Balance de sumas y saldos (US 2.2.x) ════════════════════ */

function toISODate(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

interface LedgerDrill {
  accountId: string;
  code: string;
  name: string;
  from: string;
  to: string;
}

/**
 * Columna de importes del balance de sumas y saldos. Compartida por
 * encabezado, filas y totales: cada uno traía su propio ancho y los totales
 * podían no caer debajo de su columna.
 */
const BALANCE_COL_MONEY =
  'w-28 shrink-0 text-right tabular-nums whitespace-nowrap';

function Balance({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [asOf, setAsOf] = useState('');
  const [drill, setDrill] = useState<LedgerDrill | null>(null);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId =
    fiscalYearId !== '' ? fiscalYearId : defaultFiscalYearId(fiscalYears);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'trial-balance', clientId, effectiveFyId, asOf],
    queryFn: () =>
      getTrialBalance({
        data: {
          clientId,
          fiscalYearId: effectiveFyId || undefined,
          asOf: asOf || undefined,
        },
      }),
    enabled: !!effectiveFyId,
  });

  function doExport(kind: 'xlsx' | 'pdf') {
    if (!data || data.rows.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const payload = {
      empresaName: clientName,
      fiscalYearNumber: data.ejercicio.number,
      asOf: data.asOf,
      rows: data.rows,
      totals: data.totals,
      balanced: data.balanced,
    };
    const p =
      kind === 'xlsx' ? exportBalanceExcel(payload) : exportBalancePdf(payload);
    p.catch((e: Error) => toast.error(e.message));
  }

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa no tiene ejercicios. Creá uno para generar el balance.
        </div>
      </ArcaCard>
    );
  }

  return (
    <>
      {/* Descargas arriba a la derecha y filtros debajo, como en Mayor. */}
      <div className="mb-[10px] flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => doExport('xlsx')}
        >
          <Download className="size-3.5" strokeWidth={1.8} />
          Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => doExport('pdf')}
        >
          <Download className="size-3.5" strokeWidth={1.8} />
          PDF
        </Button>
      </div>

      <div className="mb-[10px] flex flex-wrap items-center gap-2">
        {fiscalYears.length > 1 && (
          <Select
            value={effectiveFyId}
            onValueChange={(v) => setFiscalYearId(v)}
          >
            <SelectTrigger size="sm" className="w-[150px] data-[size=sm]:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  Ejercicio N°{y.numero}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <SelectorFecha
          size="sm"
          value={asOf}
          onChange={(v) => setAsOf(v)}
          placeholder="Fecha de corte"
          aria-label="Fecha de corte"
          className="w-[150px]"
        />
        {data && (
          <span className="text-[12.5px] text-[var(--arca-ink-3)]">
            al {fmtFecha(data.asOf)}
          </span>
        )}
      </div>

      {/* Que cuadre o no es el resultado de la pantalla, no una nota al pie de
        la tabla: va como banner tonal arriba, verde cuando cuadra y rojo
        cuando no. Antes el "no cuadra" era una franja dentro de la card con
        colores propios en oklch, y el "cuadra" una línea suelta abajo de
        todo. */}
      {data && (
        <div
          role="status"
          className={cn(
            'mb-[10px] flex items-start gap-2 rounded-[var(--arca-r-md)] border px-3 py-2 text-[12.5px]',
            data.balanced
              ? 'border-[var(--arca-accent-pos)]/25 bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)]'
              : 'border-[var(--arca-accent-neg)]/25 bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]'
          )}
        >
          {data.balanced ? (
            <Check className="mt-px size-3.5 shrink-0" strokeWidth={2.4} />
          ) : (
            <AlertTriangle
              className="mt-px size-3.5 shrink-0"
              strokeWidth={2}
            />
          )}
          <span>
            {data.balanced ? (
              <>
                El balance cuadra: débitos = créditos y saldos deudores =
                acreedores.
              </>
            ) : (
              <>
                El balance <strong>no cuadra</strong>. Débitos ${' '}
                {fmtMoney(data.totals.sumaDebe)} vs créditos ${' '}
                {fmtMoney(data.totals.sumaHaber)} (dif. ${' '}
                {fmtMoney(
                  Math.abs(data.totals.sumaDebe - data.totals.sumaHaber)
                )}
                ) · saldos deudores $ {fmtMoney(data.totals.saldoDeudor)} vs
                acreedores $ {fmtMoney(data.totals.saldoAcreedor)}.
              </>
            )}
          </span>
        </div>
      )}

      <ArcaCard>
        {/* Column headers */}
        <div className="flex h-[38px] items-center gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-4 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
          <div className="w-24 shrink-0">Código</div>
          <div className="flex-1 min-w-0">Cuenta</div>
          <div className={BALANCE_COL_MONEY}>Suma Debe</div>
          <div className={BALANCE_COL_MONEY}>Suma Haber</div>
          <div className={BALANCE_COL_MONEY}>Saldo Deudor</div>
          <div className={BALANCE_COL_MONEY}>Saldo Acreedor</div>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay movimientos hasta la fecha de corte.
          </div>
        ) : (
          <>
            {data.rows.map((r) => (
              <button
                key={r.accountId}
                onClick={() =>
                  setDrill({
                    accountId: r.accountId,
                    code: r.code,
                    name: r.name,
                    from: toISODate(data.fiscalYearStart),
                    to: toISODate(data.asOf),
                  })
                }
                className="w-full flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-left text-[12.5px]"
              >
                <div className="w-24 shrink-0 font-mono text-[12px] text-[var(--arca-ink-3)]">
                  {r.code}
                </div>
                <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
                  {r.name}
                </div>
                <div className={BALANCE_COL_MONEY}>{fmtMoney(r.sumaDebe)}</div>
                <div className={BALANCE_COL_MONEY}>{fmtMoney(r.sumaHaber)}</div>
                <div className={BALANCE_COL_MONEY}>
                  {r.saldoDeudor ? fmtMoney(r.saldoDeudor) : ''}
                </div>
                <div className={BALANCE_COL_MONEY}>
                  {r.saldoAcreedor ? fmtMoney(r.saldoAcreedor) : ''}
                </div>
              </button>
            ))}
            {/* Gris, como los "Totales generales" del Mayor. */}
            <div className="flex items-center gap-3 border-t-2 border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-3 text-[13px] font-semibold">
              <div className="w-24 shrink-0" />
              <div className="flex-1 min-w-0">Totales</div>
              {/* Sin el «$» que traía de más: el cuerpo de la tabla va sin
                  símbolo y era justo lo que hacía desbordar la columna. */}
              <div className={BALANCE_COL_MONEY}>
                {fmtMoney(data.totals.sumaDebe)}
              </div>
              <div className={BALANCE_COL_MONEY}>
                {fmtMoney(data.totals.sumaHaber)}
              </div>
              <div className={BALANCE_COL_MONEY}>
                {fmtMoney(data.totals.saldoDeudor)}
              </div>
              <div className={BALANCE_COL_MONEY}>
                {fmtMoney(data.totals.saldoAcreedor)}
              </div>
            </div>
          </>
        )}
      </ArcaCard>

      {drill && (
        <LedgerDialog
          clientId={clientId}
          drill={drill}
          canWrite={canWrite}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function LedgerDialog({
  clientId,
  drill,
  canWrite,
  onClose,
}: {
  clientId: string;
  drill: LedgerDrill;
  canWrite: boolean;
  onClose: () => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: [
      'accounting',
      'ledger-account',
      clientId,
      drill.accountId,
      '',
      drill.from,
      drill.to,
      '',
    ],
    queryFn: () =>
      getLedgerAccount({
        data: {
          clientId,
          accountId: drill.accountId,
          from: drill.from,
          to: drill.to,
        },
      }),
  });

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>
              Mayor · {drill.code} · {drill.name}
            </DialogTitle>
            <DialogDescription>
              Movimientos del {fmtFecha(drill.from)} al {fmtFecha(drill.to)}.
              Click en un movimiento abre el asiento.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto border border-[var(--arca-border)] rounded-lg">
            {isLoading || !data ? (
              <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
                Cargando…
              </div>
            ) : (
              <LedgerTable
                saldoInicial={data.saldoInicial}
                rows={data.rows}
                totalDebit={data.totalDebit}
                totalCredit={data.totalCredit}
                saldoFinal={data.saldoFinal}
                onRowClick={(id) => setDetailId(id)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          readOnly
          onClose={() => setDetailId(null)}
          onAction={() => setDetailId(null)}
          onChanged={() => {
            /* no-op */
          }}
        />
      )}
    </>
  );
}

/* ════════════════════ Reglas de mapeo (US 3.1.x) ════════════════════ */

interface AccClient {
  id: string;
  name: string;
  identityNumber: string;
}
interface RuleLineDraft {
  accountId: string;
  side: 'debe' | 'haber';
  amountBasis: RuleAmountBasis;
  fixedAmount: string;
  description: string;
}
type RuleEditorState = { mode: 'create' } | { mode: 'edit'; ruleId: string };

type RuleAmountBasis =
  | 'total'
  | 'neto'
  | 'iva'
  | 'otros_tributos'
  | 'valor_concepto'
  | 'fijo';

/**
 * Las bases se ofrecen según el módulo: una factura tiene total, neto, IVA y
 * otros tributos; un concepto de sueldos, su propio valor. Antes se ofrecían
 * las seis en todos, y elegir una que no aplica dejaba la línea en cero.
 */
const basesDelModulo = (modulo: ModuloRegla): RuleAmountBasis[] =>
  BASES_POR_MODULO[modulo] as RuleAmountBasis[];

/** La base que queda al cambiar de módulo, si la elegida ya no aplica. */
const baseValidaEnModulo = (
  base: RuleAmountBasis,
  modulo: ModuloRegla
): RuleAmountBasis =>
  basesDelModulo(modulo).includes(base) ? base : basesDelModulo(modulo)[0];

/** Letras de comprobante soportadas por la condición (clave "type"). */
const INVOICE_TYPE_OPTIONS = ['A', 'B', 'C', 'M', 'E'];

/** Tipos de concepto de sueldos que puede filtrar una regla condicional. */
const PAYROLL_CONCEPT_TIPO_OPTIONS = [
  { value: 'remunerativo', label: 'Remunerativo' },
  { value: 'no_remunerativo', label: 'No remunerativo' },
  { value: 'descuento', label: 'Descuento' },
  { value: 'retencion', label: 'Retención' },
];

/**
 * Normaliza el valor leído de `condicion.direccion`. El vocabulario lo define
 * `reglaMatchea()` en `@/lib/accounting-invoice-posting`: una clave o un valor
 * que no entienda hace que la regla NO matchee, en silencio.
 */
function normalizeCondDirection(raw: unknown): '' | 'emitido' | 'recibido' {
  const v = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return v === 'emitido' || v === 'recibido' ? v : '';
}

function emptyRuleLine(side: 'debe' | 'haber'): RuleLineDraft {
  return {
    accountId: '',
    side,
    amountBasis: 'total',
    fixedAmount: '',
    description: '',
  };
}

/** Aviso sobre cómo se va a comportar una regla (solapada, sin cuadre…). */
function AvisoRegla({
  tono,
  texto,
}: {
  tono: 'error' | 'warn' | 'info';
  texto: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-[8px] border px-3 py-2 text-[12px]',
        tono === 'error' &&
          'border-[var(--arca-accent-neg)] bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
        tono === 'warn' &&
          'border-[var(--arca-accent-warn)] bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]',
        tono === 'info' &&
          'border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)]'
      )}
    >
      <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={2} />
      <div>{texto}</div>
    </div>
  );
}

/**
 * Una regla en la lista, arrastrable para cambiar su lugar en la cola.
 *
 * El orden es la prioridad: el motor toma la primera regla aplicable del
 * módulo, así que arriba es "se prueba antes". Antes eso se editaba escribiendo
 * un número —100, 200, 150 para meter una en el medio— y para saber qué corría
 * primero había que leer la columna y ordenar mentalmente.
 *
 * El agarre es una manija aparte y no la fila entera: la fila abre el detalle,
 * y si arrastrar y abrir compartieran el mismo gesto uno de los dos perdería.
 */
function FilaRegla({
  r,
  isOwner,
  ordenable,
  onAbrir,
  onToggle,
}: {
  r: MappingRuleListRow;
  isOwner: boolean;
  /** Con una sola regla en el módulo no hay nada que ordenar. */
  ordenable: boolean;
  onAbrir: () => void;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: r.id, disabled: !ordenable });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onAbrir}
      role="button"
      tabIndex={0}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-[12.5px] cursor-pointer',
        isDragging &&
          'relative z-10 bg-[var(--arca-surface)] shadow-[var(--arca-shadow-2,0_6px_16px_rgba(0,0,0,0.10))]'
      )}
    >
      <div className="w-8 shrink-0 flex justify-center">
        {ordenable ? (
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Mover ${r.name} en el orden`}
            title="Arrastrar para cambiar el orden en que se prueba"
            className="grid size-6 touch-none place-items-center rounded-[6px] text-[var(--arca-ink-4)] hover:bg-[var(--arca-border)] hover:text-[var(--arca-ink-2)] cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : (
          <span
            className="block size-6"
            aria-hidden
            title={
              isOwner
                ? 'Única regla del módulo: no hay orden que cambiar'
                : undefined
            }
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium text-[var(--arca-ink)]">
          {r.name}
        </div>
        {r.sourceModule === 'comprobante' && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {r.scope && (
              <span className="text-[var(--arca-ink-3)]">{r.scope}</span>
            )}
            {r.isActive && r.shadowedBy && (
              <Badge
                variant="warning"
                size="sm"
                title={`Todo lo que tomaría esta regla ya lo toma «${r.shadowedBy.name}», que está antes en la lista.`}
              >
                Nunca se aplica: la tapa «{r.shadowedBy.name}»
              </Badge>
            )}
            {r.missingDirection && (
              <Badge
                variant="warning"
                size="sm"
                title="Sin dirección, la regla se aplica a ventas y a compras. Editala y elegí una."
              >
                Sin ventas/compras
              </Badge>
            )}
            {r.balance?.status === 'descuadra' && (
              <Badge
                variant="error"
                size="sm"
                title={r.balance.message ?? undefined}
              >
                No cuadra
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="w-24 shrink-0">
        {/* Píldora de 10px en gris sobre gris: era ilegible. El badge del
          sistema, neutro, con el tamaño de celda. */}
        <Badge variant="default" size="sm">
          {MAPPING_SOURCE_LABELS[r.sourceModule as ModuloRegla]}
        </Badge>
      </div>
      <div className="w-28 shrink-0 text-[11.5px] text-[var(--arca-ink-3)]">
        {MAPPING_RULE_TYPE_LABELS[r.ruleType as 'default' | 'condicional']}
      </div>
      <div className="w-16 shrink-0 text-center text-[var(--arca-ink-2)]">
        {r.lineCount}
      </div>
      <div className="w-24 shrink-0 flex justify-center">
        {isOwner ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                asChild
                variant={r.isActive ? 'success' : 'default'}
                size="sm"
                className="cursor-pointer hover:opacity-80"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                >
                  <Power className="size-2.5" strokeWidth={2} />
                  {r.isActive ? 'Activa' : 'Inactiva'}
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {r.isActive ? 'Clic para desactivar' : 'Clic para activar'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[10.5px] text-[var(--arca-ink-3)]">
            {r.isActive ? 'Activa' : 'Inactiva'}
          </span>
        )}
      </div>
    </div>
  );
}

function Reglas({
  clientId,
  isOwner,
  clients,
}: {
  clientId: string;
  isOwner: boolean;
  clients: AccClient[];
}) {
  const qc = useQueryClient();
  const [moduleFilter, setModuleFilter] = useState<
    '' | 'comprobante' | 'recibo' | 'movimiento_bancario'
  >('');
  const [editor, setEditor] = useState<RuleEditorState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const queryKey = ['accounting', 'rules', clientId, moduleFilter];
  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      listMappingRules({
        data: { clientId, sourceModule: moduleFilter || undefined },
      }),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting', 'rules'] });
  };

  const toggleMut = useMutation({
    mutationFn: (args: { id: string; isActive: boolean }) =>
      setMappingRuleActive({ data: args }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Orden manual ─────────────────────────────────────────────────────────

  /**
   * La prioridad sólo ordena dentro de un módulo: el motor busca la primera
   * regla aplicable de ese módulo y nunca compara una de facturas contra una
   * de sueldos. Por eso la lista va agrupada y se arrastra dentro del grupo:
   * mover una regla de facturas debajo de una de sueldos no significaría nada.
   */
  const grupos = useMemo(() => {
    const porModulo = new Map<ModuloRegla, MappingRuleListRow[]>();
    for (const r of rules) {
      const m = r.sourceModule as ModuloRegla;
      const lista = porModulo.get(m) ?? [];
      lista.push(r);
      porModulo.set(m, lista);
    }
    return [...porModulo.entries()];
  }, [rules]);

  const reorderMut = useMutation({
    mutationFn: (args: { sourceModule: ModuloRegla; orderedIds: string[] }) =>
      reorderMappingRules({ data: { clientId, ...args } }),
    onError: (e: Error) => {
      toast.error(e.message);
      // El orden optimista ya no vale: que la lista vuelva a lo que hay guardado.
      invalidate();
    },
    onSuccess: invalidate,
  });

  const sensors = useSensors(
    // 6px de umbral: sin esto, un clic sobre la manija empieza un arrastre
    // fantasma y la fila tiembla cada vez que la tocás.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const grupo = grupos.find(([, rs]) => rs.some((r) => r.id === active.id));
    if (!grupo) return;
    const [modulo, delModulo] = grupo;

    const desde = delModulo.findIndex((r) => r.id === active.id);
    const hasta = delModulo.findIndex((r) => r.id === over.id);
    // `over` de otro grupo: el arrastre cruzó módulos y no hay nada que hacer.
    if (desde === -1 || hasta === -1) return;

    const ordenadas = arrayMove(delModulo, desde, hasta);
    const orderedIds = ordenadas.map((r) => r.id);

    // Optimista: la fila se queda donde la soltaste mientras el servidor
    // renumera. Sin esto pega un salto al lugar viejo y vuelve.
    qc.setQueryData<MappingRuleListRow[]>(queryKey, (prev) => {
      if (!prev) return prev;
      const nuevas = new Map(ordenadas.map((r, i) => [r.id, (i + 1) * 10]));
      return prev
        .map((r) => ({ ...r, priority: nuevas.get(r.id) ?? r.priority }))
        .sort(
          (x, y) => x.priority - y.priority || x.name.localeCompare(y.name)
        );
    });

    reorderMut.mutate({ sourceModule: modulo, orderedIds });
  };

  return (
    <>
      {/* Los filtros, afuera de la card: a la izquierda el módulo con su
        rótulo al lado —no encima, que obligaba a la barra a tener dos
        renglones— y a la derecha lo que se hace. */}
      <div className="mb-[10px] flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-[var(--arca-ink-3)]">Módulo</span>
        <Select
          value={moduleFilter === '' ? 'all' : moduleFilter}
          onValueChange={(v) =>
            setModuleFilter(
              v === 'all'
                ? ''
                : (v as 'comprobante' | 'recibo' | 'movimiento_bancario')
            )
          }
        >
          {/* 30px, la altura de los botones `sm` que lo acompañan en la fila. */}
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="comprobante">Facturas</SelectItem>
            <SelectItem value="recibo">Sueldos</SelectItem>
            <SelectItem value="movimiento_bancario">Banco</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <TutorialReglas />
          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="size-3.5" strokeWidth={1.8} />
                Importar de otra empresa
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setEditor({ mode: 'create' })}
                data-tour="reglas-nueva"
              >
                <Plus className="size-3.5" strokeWidth={2.5} />
                Nueva regla
              </Button>
            </>
          )}
        </div>
      </div>

      <div data-tour="reglas-lista">
        <ArcaCard>
          {/* Mismo `text-white` colgado que en Asientos: los rótulos se
          dibujaban blancos sobre fondo claro. Abajo, la fila gris con el
          nombre del módulo no es un segundo header: separa los grupos
          —arrastrar reordena dentro de un módulo, no entre módulos— y por eso
          va más chica, sin mayúsculas anchas y sobre otro fondo. */}
          <div className="flex items-center gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-4 py-2 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
            <div className="w-8 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">Nombre</div>
            <div className="w-24 shrink-0">Módulo</div>
            <div className="w-28 shrink-0">Tipo</div>
            <div className="w-16 shrink-0 text-center">Líneas</div>
            <div className="w-24 shrink-0 text-center">Estado</div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            {isLoading ? (
              <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
                Cargando…
              </div>
            ) : rules.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Workflow
                  className="w-8 h-8 mx-auto mb-3 text-[var(--arca-ink-3)]"
                  strokeWidth={1.5}
                />
                <p className="text-[13px] text-[var(--arca-ink-2)] mb-1">
                  No hay reglas de mapeo configuradas.
                </p>
                <p className="text-[12px] text-[var(--arca-ink-3)]">
                  Las reglas le enseñan al sistema cómo armar los asientos
                  automáticos desde facturas y sueldos.
                </p>
              </div>
            ) : (
              grupos.map(([modulo, delModulo]) => (
                <SortableContext
                  key={modulo}
                  items={delModulo.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {/* El encabezado sólo aparece con el filtro en "Todos": es lo
                  que deja claro que arrastrar mueve dentro del módulo y no
                  contra las reglas de otro. */}
                  {!moduleFilter && (
                    <div className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-1.5 text-[11px] font-medium text-[var(--arca-ink-3)]">
                      {MAPPING_SOURCE_LABELS[modulo]}
                    </div>
                  )}
                  {delModulo.map((r) => (
                    <FilaRegla
                      key={r.id}
                      r={r}
                      isOwner={isOwner}
                      ordenable={isOwner && delModulo.length > 1}
                      onAbrir={() => setDetailId(r.id)}
                      onToggle={() =>
                        toggleMut.mutate({ id: r.id, isActive: !r.isActive })
                      }
                    />
                  ))}
                </SortableContext>
              ))
            )}
          </DndContext>
        </ArcaCard>
      </div>

      {editor && (
        <RuleEditorDialog
          clientId={clientId}
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            invalidate();
          }}
        />
      )}
      {detailId && (
        <RuleDetailDialog
          ruleId={detailId}
          isOwner={isOwner}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            setDetailId(null);
            setEditor({ mode: 'edit', ruleId: id });
          }}
          onChanged={invalidate}
        />
      )}
      {importOpen && (
        <ImportRulesDialog
          clientId={clientId}
          clients={clients}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            invalidate();
          }}
        />
      )}
    </>
  );
}

function RuleEditorDialog({
  clientId,
  state,
  onClose,
  onSaved,
}: {
  clientId: string;
  state: RuleEditorState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const qc = useQueryClient();
  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });
  const { data: existing } = useQuery({
    queryKey: ['accounting', 'rule', isEdit ? state.ruleId : 'new'],
    queryFn: () =>
      getMappingRule({ data: { id: (state as { ruleId: string }).ruleId } }),
    enabled: isEdit,
  });

  const [name, setName] = useState('');
  const [sourceModule, setSourceModule] = useState<
    'comprobante' | 'recibo' | 'movimiento_bancario'
  >('comprobante');
  const [ruleType, setRuleType] = useState<'default' | 'condicional'>(
    'default'
  );
  const [condDirection, setCondDirection] = useState<
    '' | 'emitido' | 'recibido'
  >('');
  /**
   * La dirección se sugiere a partir del nombre ("Compras A" → compras)
   * mientras el usuario no la elija a mano. Elegida, el nombre ya no la toca.
   */
  const [directionTouched, setDirectionTouched] = useState(false);
  const [condTypes, setCondTypes] = useState<string[]>([]);
  /** Sueldos: tipos de concepto a los que aplica la regla. */
  const [condConceptTipos, setCondConceptTipos] = useState<string[]>([]);
  /** Sueldos: códigos SOS exactos, separados por coma (ej. "101, 102"). */
  const [condSosCodes, setCondSosCodes] = useState('');
  /** Banco: categorías de movimiento a las que aplica la regla. */
  const [condCategorias, setCondCategorias] = useState<string[]>([]);
  /** Banco: si aplica solo a lo que entra, solo a lo que sale, o a los dos. */
  const [condMovDireccion, setCondMovDireccion] = useState<
    '' | 'ingreso' | 'egreso'
  >('');
  /**
   * Los conceptos son 21 y ocupaban cinco renglones, que empujaban las líneas
   * del asiento fuera de la pantalla. Se muestran dos renglones y el resto a
   * pedido. Arranca plegado cada vez que se abre el formulario: el diálogo se
   * desmonta al cerrarse, así que no hay nada que resetear a mano.
   */
  const [verTodosConceptos, setVerTodosConceptos] = useState(false);
  const [lines, setLines] = useState<RuleLineDraft[]>([
    emptyRuleLine('debe'),
    emptyRuleLine('haber'),
  ]);
  const [loaded, setLoaded] = useState(!isEdit);

  if (isEdit && existing && !loaded) {
    setName(existing.rule.nombre);
    setSourceModule(existing.rule.modulo);
    setRuleType(existing.rule.tipo);
    {
      const cond = (existing.rule.condition ?? {}) as Record<string, unknown>;
      const dir = normalizeCondDirection(cond.direccion);
      // Una regla vieja sin dirección: se sugiere por el nombre, sin darla
      // por elegida, para que el aviso de "sugerido" quede a la vista.
      setCondDirection(
        dir !== '' || existing.rule.modulo !== 'comprobante'
          ? dir
          : (direccionSugeridaPorNombre(existing.rule.nombre) ?? '')
      );
      setDirectionTouched(dir !== '');
      const rawLetra = cond.letra;
      const typeArr = Array.isArray(rawLetra)
        ? rawLetra
        : rawLetra != null
          ? [rawLetra]
          : [];
      setCondTypes(
        typeArr.map((t) => String(t).trim().toUpperCase()).filter(Boolean)
      );
      const rawTipo = cond.tipo;
      const tipoArr = Array.isArray(rawTipo)
        ? rawTipo
        : rawTipo != null
          ? [rawTipo]
          : [];
      setCondConceptTipos(
        tipoArr.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      );
      const rawSos = cond.sosCode ?? cond.codigo;
      const sosArr = Array.isArray(rawSos)
        ? rawSos
        : rawSos != null
          ? [rawSos]
          : [];
      setCondSosCodes(sosArr.map((c) => String(c).trim()).join(', '));
      const rawCat = cond.categoria;
      const catArr = Array.isArray(rawCat)
        ? rawCat
        : rawCat != null
          ? [rawCat]
          : [];
      setCondCategorias(
        catArr.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
      );
      const rawDirMov = cond.direccion;
      setCondMovDireccion(
        existing.rule.modulo === 'movimiento_bancario' &&
          (rawDirMov === 'ingreso' || rawDirMov === 'egreso')
          ? rawDirMov
          : ''
      );
    }
    setLines(
      existing.lines.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountBasis: l.amountBasis,
        fixedAmount: l.fixedAmount != null ? String(l.fixedAmount) : '',
        description: l.description ?? '',
      }))
    );
    setLoaded(true);
  }

  const updateLine = (i: number, patch: Partial<RuleLineDraft>) =>
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );

  const hasDebit = lines.some((l) => l.side === 'debe');
  const hasCredit = lines.some((l) => l.side === 'haber');
  const linesOk =
    lines.length >= 2 &&
    hasDebit &&
    hasCredit &&
    lines.every(
      (l) => l.accountId && (l.amountBasis !== 'fijo' || num(l.fixedAmount) > 0)
    );
  const needsDirection = sourceModule === 'comprobante';
  const cuadre =
    sourceModule === 'comprobante'
      ? analizarCuadreRegla(
          lines.map((l) => ({ lado: l.side, base: l.amountBasis }))
        )
      : null;
  // Una regla que no cuadra manda la diferencia a "Pendiente de revisión" y
  // traba el cierre del período: no se guarda.
  const canSave =
    !!name.trim() &&
    linesOk &&
    (!needsDirection || condDirection !== '') &&
    cuadre?.estado !== 'descuadra';

  const onNameChange = (v: string) => {
    setName(v);
    if (sourceModule === 'comprobante' && !directionTouched) {
      setCondDirection(direccionSugeridaPorNombre(v) ?? '');
    }
  };

  const mut = useMutation({
    mutationFn: async () => {
      let condition: unknown = undefined;
      if (sourceModule === 'comprobante') {
        // La dirección va siempre, también en una default: es el fallback
        // de ventas o de compras, nunca de los dos.
        const c: Record<string, unknown> = { direccion: condDirection };
        if (ruleType === 'condicional' && condTypes.length) c.letra = condTypes;
        condition = c;
      } else if (ruleType === 'condicional' && sourceModule === 'recibo') {
        const c: Record<string, unknown> = {};
        const codes = condSosCodes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (codes.length) c.sosCode = codes;
        if (condConceptTipos.length) c.tipo = condConceptTipos;
        condition = Object.keys(c).length ? c : undefined;
      } else if (
        ruleType === 'condicional' &&
        sourceModule === 'movimiento_bancario'
      ) {
        const c: Record<string, unknown> = {};
        if (condCategorias.length) c.categoria = condCategorias;
        if (condMovDireccion) c.direccion = condMovDireccion;
        condition = Object.keys(c).length ? c : undefined;
      }
      const payloadLines = lines.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountBasis: l.amountBasis,
        fixedAmount: l.amountBasis === 'fijo' ? num(l.fixedAmount) : null,
        description: l.description || undefined,
      }));
      const base = {
        name,
        sourceModule,
        ruleType,
        condition,
        lines: payloadLines,
      };
      if (isEdit) {
        await updateMappingRule({ data: { id: state.ruleId, ...base } });
      } else {
        await createMappingRule({ data: { clientId, ...base } });
      }
    },
    onSuccess: () => {
      const generados = isEdit ? (existing?.generatedOpenCount ?? 0) : 0;
      // Editar la regla no rehace lo ya contabilizado: se ofrece hacerlo acá
      // mismo, que antes había que buscarlo a mano en Contabilizar.
      if (generados > 0 && sourceModule === 'comprobante') {
        toast.success('Regla actualizada', {
          description: `${generados} asiento(s) del período abierto se generaron con la versión anterior.`,
          action: {
            label: 'Regenerarlos',
            onClick: () => regenerarMut.mutate(),
          },
          duration: 10000,
        });
      } else {
        toast.success(isEdit ? 'Regla actualizada' : 'Regla creada');
      }
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerarMut = useMutation({
    mutationFn: () =>
      regenerateEntriesForRule({
        data: { ruleId: (state as { ruleId: string }).ruleId },
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.regenerated} asiento(s) regenerado(s)` +
          (r.skippedEdited > 0
            ? ` · ${r.skippedEdited} editado(s) a mano se conservan`
            : '')
      );
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Con los avisos y varias líneas el formulario pasa el alto de una
        notebook: scrollea el contenido y el pie queda pegado abajo, para que
        Guardar no quede fuera de la pantalla. */}
      <DialogContent
        className="sm:max-w-[780px] max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-tour="regla-editor"
        // Con el tutorial abierto, tocar su tarjeta no cierra el formulario.
        onInteractOutside={(e) => {
          if (esClicEnTutorial(e.target)) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar regla de mapeo' : 'Nueva regla de mapeo'}
          </DialogTitle>
          <DialogDescription>
            Una regla le enseña al sistema cómo armar un asiento automático.
          </DialogDescription>
        </DialogHeader>

        {/* La explicación va detrás del botón de ayuda, como en el resto de
          la plataforma: ocupaba cinco renglones arriba del formulario y se
          lee una sola vez. */}
        <Ayuda titulo="Cómo funciona una regla" etiqueta="Cómo funciona">
          <p>
            Cuando entra un comprobante del módulo elegido (una factura o una
            liquidación de sueldos), el sistema arma un asiento usando estas
            líneas. Cada línea define <strong>qué cuenta</strong> tocar, si va
            al <strong>Debe o Haber</strong>, y de{' '}
            <strong>qué monto del comprobante</strong> sale (el total, el neto,
            el IVA…).
          </p>
          <p className="text-[var(--arca-ink-3)]">
            Ejemplo (factura de venta): Deudores por ventas → Debe → Total ·
            Ventas → Haber → Neto · IVA débito → Haber → IVA.
          </p>
        </Ayuda>

        {isEdit && existing && existing.generatedOpenCount > 0 && (
          <div
            className="text-[12px] rounded-[8px] px-3 py-2"
            style={{
              background:
                'color-mix(in oklch, oklch(0.55 0.15 50), transparent 90%)',
              color: 'oklch(0.45 0.15 50)',
            }}
          >
            ⚠ {existing.generatedOpenCount} asiento(s) del período abierto se
            generaron con la versión anterior. Al guardar te ofrecemos
            regenerarlos.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 py-1">
          <Field label="Nombre *" full>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              data-tour="regla-nombre"
              placeholder="Ej: Ventas A · Compras C (gastos)"
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>
          <Field
            label={
              <>
                Módulo origen *
                <HelpTip text="Qué dispara la regla: una factura, un concepto de un recibo de sueldo, o un movimiento del banco." />
              </>
            }
          >
            <Select
              value={sourceModule}
              onValueChange={(v) => {
                const modulo = v as ModuloRegla;
                setSourceModule(modulo);
                // Las bases cambian con el módulo: "Total del comprobante" no
                // existe en sueldos. Sin esto, la línea quedaba sin base.
                setLines((prev) =>
                  prev.map((l) => ({
                    ...l,
                    amountBasis: baseValidaEnModulo(l.amountBasis, modulo),
                  }))
                );
              }}
            >
              <SelectTrigger className="w-full text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comprobante">Facturas</SelectItem>
                <SelectItem value="recibo">Sueldos</SelectItem>
                <SelectItem value="movimiento_bancario">Banco</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={
              <>
                Tipo
                <HelpTip text="Default: la que se usa cuando ninguna otra aplica (en facturas, una para ventas y otra para compras). Condicional: sólo si el comprobante cumple lo que marques abajo, por ejemplo la letra." />
              </>
            }
          >
            <Select
              value={ruleType}
              onValueChange={(v) => setRuleType(v as 'default' | 'condicional')}
            >
              <SelectTrigger
                className="w-full text-[12.5px]"
                data-tour="regla-tipo"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (fallback)</SelectItem>
                <SelectItem value="condicional">Condicional</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {sourceModule === 'comprobante' && (
            <Field
              label={
                <>
                  ¿Ventas o compras? *
                  <HelpTip text="La regla sólo se aplica a los comprobantes de esa dirección. El nombre de la regla no filtra nada: esto sí." />
                </>
              }
              full
            >
              <div
                role="radiogroup"
                aria-label="Dirección"
                className="grid grid-cols-2 gap-2"
                data-tour="regla-direccion"
              >
                {(
                  [
                    ['emitido', 'Ventas', 'Facturas emitidas'],
                    ['recibido', 'Compras', 'Facturas recibidas'],
                  ] as const
                ).map(([value, label, hint]) => {
                  const on = condDirection === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setCondDirection(value);
                        setDirectionTouched(true);
                      }}
                      className={cn(
                        'flex flex-col items-start rounded-[8px] border px-3 py-2 text-left transition-colors',
                        on
                          ? 'border-[var(--arca-accent)] bg-[var(--arca-accent-bg)]'
                          : 'border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)]'
                      )}
                    >
                      <span className="text-[13px] font-medium text-[var(--arca-ink)]">
                        {label}
                      </span>
                      <span className="text-[11px] text-[var(--arca-ink-3)]">
                        {hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-[var(--arca-ink-3)]">
                {condDirection === ''
                  ? 'Elegí una para poder guardar.'
                  : !directionTouched
                    ? 'Sugerido por el nombre de la regla. Cambialo si no corresponde.'
                    : null}
              </p>
            </Field>
          )}
          {ruleType === 'condicional' && sourceModule === 'comprobante' && (
            <>
              <Field
                label={
                  <>
                    Tipo de comprobante
                    <HelpTip text="Marcá las letras a las que aplica la regla. Si no marcás ninguna, aplica a cualquier letra. La regla aplica solo si el comprobante cumple dirección Y tipo." />
                  </>
                }
                full
              >
                <div className="flex flex-wrap gap-1.5">
                  {INVOICE_TYPE_OPTIONS.map((t) => {
                    const on = condTypes.includes(t);
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() =>
                          setCondTypes((prev) =>
                            prev.includes(t)
                              ? prev.filter((x) => x !== t)
                              : [...prev, t]
                          )
                        }
                        className={`h-8 min-w-[2.5rem] px-2.5 text-[12.5px] font-medium rounded-[8px] border transition-colors ${
                          on
                            ? 'bg-[var(--arca-accent)] text-white border-[var(--arca-accent)]'
                            : 'border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-[var(--arca-ink-3)]">
                  {condTypes.length ? (
                    <>
                      Aplica a{' '}
                      {condDirection === 'emitido'
                        ? 'ventas'
                        : condDirection === 'recibido'
                          ? 'compras'
                          : 'comprobantes'}{' '}
                      letra {condTypes.join(', ')}.
                    </>
                  ) : (
                    'Sin letras marcadas: aplica a cualquier letra.'
                  )}
                </p>
              </Field>
            </>
          )}
          {ruleType === 'condicional' && sourceModule === 'recibo' && (
            <>
              <Field
                label={
                  <>
                    Tipo de concepto
                    <HelpTip text="Marcá los tipos de concepto a los que aplica la regla. Si no marcás ninguno, no filtra por tipo." />
                  </>
                }
                full
              >
                <div className="flex flex-wrap gap-1.5">
                  {PAYROLL_CONCEPT_TIPO_OPTIONS.map((t) => {
                    const on = condConceptTipos.includes(t.value);
                    return (
                      <button
                        type="button"
                        key={t.value}
                        onClick={() =>
                          setCondConceptTipos((prev) =>
                            prev.includes(t.value)
                              ? prev.filter((x) => x !== t.value)
                              : [...prev, t.value]
                          )
                        }
                        className={`h-8 px-2.5 text-[12.5px] font-medium rounded-[8px] border transition-colors ${
                          on
                            ? 'bg-[var(--arca-accent)] text-white border-[var(--arca-accent)]'
                            : 'border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field
                label={
                  <>
                    Códigos SOS
                    <HelpTip text="Códigos de concepto exactos, separados por coma (ej. 101, 102). Dejalo vacío para no filtrar por código. La regla aplica solo si el concepto cumple código Y tipo." />
                  </>
                }
                full
              >
                <input
                  value={condSosCodes}
                  onChange={(e) => setCondSosCodes(e.target.value)}
                  placeholder="101, 102"
                  className={`${INPUT_CLASS} w-full h-9`}
                />
                <p className="mt-1 text-[11px] text-[var(--arca-ink-3)]">
                  {condSosCodes.trim() || condConceptTipos.length ? (
                    <>
                      Aplica a conceptos
                      {condConceptTipos.length
                        ? ` ${condConceptTipos
                            .map(
                              (t) =>
                                PAYROLL_CONCEPT_TIPO_OPTIONS.find(
                                  (o) => o.value === t
                                )?.label ?? t
                            )
                            .join(', ')
                            .toLowerCase()}`
                        : ''}
                      {condSosCodes.trim()
                        ? ` con código ${condSosCodes.trim()}`
                        : ''}
                      .
                    </>
                  ) : (
                    'Sin filtros: esta regla condicional aplicaría a cualquier concepto.'
                  )}
                </p>
              </Field>
            </>
          )}
          {ruleType === 'condicional' &&
            sourceModule === 'movimiento_bancario' && (
              <>
                <Field
                  label={
                    <>
                      Concepto del movimiento
                      <HelpTip text="Marcá los conceptos a los que aplica la regla. El concepto sale del texto del extracto: impuesto al cheque, retención de IIBB, comisiones, sueldos… Si no marcás ninguno, no filtra por concepto." />
                    </>
                  }
                  full
                >
                  <div
                    className={`flex flex-wrap gap-1.5 ${
                      verTodosConceptos ? '' : 'max-h-[70px] overflow-hidden'
                    }`}
                  >
                    {CATEGORIAS_MOVIMIENTO.map((c) => {
                      const on = condCategorias.includes(c);
                      return (
                        <button
                          type="button"
                          key={c}
                          onClick={() =>
                            setCondCategorias((prev) =>
                              prev.includes(c)
                                ? prev.filter((x) => x !== c)
                                : [...prev, c]
                            )
                          }
                          className={`h-8 px-2.5 text-[12.5px] font-medium rounded-[8px] border transition-colors ${
                            on
                              ? 'bg-[var(--arca-accent)] text-white border-[var(--arca-accent)]'
                              : 'border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]'
                          }`}
                        >
                          {CATEGORIA_MOVIMIENTO_LABEL[c]}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerTodosConceptos((v) => !v)}
                    className="mt-1.5 text-[11.5px] font-medium text-[var(--arca-accent)] hover:underline"
                  >
                    {verTodosConceptos
                      ? 'Ver menos'
                      : `Ver los ${CATEGORIAS_MOVIMIENTO.length} conceptos`}
                  </button>
                </Field>
                <Field
                  label={
                    <>
                      Entra o sale
                      <HelpTip text="El mismo concepto puede tener las dos puntas: una transferencia que entra es un cobro y una que sale, un pago, y no van a la misma cuenta." />
                    </>
                  }
                  full
                >
                  <Select
                    value={condMovDireccion === '' ? 'ambas' : condMovDireccion}
                    onValueChange={(v) =>
                      setCondMovDireccion(
                        v === 'ambas' ? '' : (v as 'ingreso' | 'egreso')
                      )
                    }
                  >
                    <SelectTrigger className="w-full text-[12.5px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambas">Las dos</SelectItem>
                      <SelectItem value="ingreso">Solo lo que entra</SelectItem>
                      <SelectItem value="egreso">Solo lo que sale</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-[var(--arca-ink-3)]">
                    {condCategorias.length === 0 && condMovDireccion === ''
                      ? 'Sin filtros: esta regla condicional aplicaría a cualquier movimiento.'
                      : `Aplica a ${
                          condCategorias.length
                            ? condCategorias
                                .map(
                                  (c) =>
                                    CATEGORIA_MOVIMIENTO_LABEL[
                                      c as keyof typeof CATEGORIA_MOVIMIENTO_LABEL
                                    ] ?? c
                                )
                                .join(', ')
                            : 'cualquier movimiento'
                        }${
                          condMovDireccion === 'ingreso'
                            ? ', solo cuando entra'
                            : condMovDireccion === 'egreso'
                              ? ', solo cuando sale'
                              : ''
                        }.`}
                  </p>
                </Field>
              </>
            )}
        </div>

        {/* Líneas-plantilla */}
        <div
          className="border border-[var(--arca-border)] rounded-xl overflow-hidden"
          data-tour="regla-lineas"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[10px] font-semibold">
            <div className="flex-1">Cuenta</div>
            <div className="w-20 flex items-center gap-1">
              Lado
              <HelpTip text="Si el importe va al Debe o al Haber del asiento." />
            </div>
            <div className="w-44 flex items-center gap-1">
              Base del monto
              <HelpTip text="De qué importe del comprobante sale esta línea: Total, Neto (sin IVA), IVA, otros impuestos, el valor de un concepto (sueldos) o un monto fijo." />
            </div>
            <div className="w-24 flex items-center gap-1">
              Monto fijo
              <HelpTip text="Solo si la base es 'Monto fijo': el importe exacto a usar. En los demás casos queda deshabilitado." />
            </div>
            <div className="w-6" />
          </div>
          {lines.map((l, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)]"
            >
              {/* Con un plan de cuentas largo, bajar por la lista hasta
                  encontrar la cuenta era lo más lento de escribir una regla:
                  este trae buscador por código y por nombre. */}
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  size="sm"
                  width="100%"
                  value={l.accountId}
                  onValueChange={(v) => updateLine(i, { accountId: v })}
                  placeholder="— Cuenta —"
                  searchPlaceholder="Buscar por código o nombre..."
                  options={postable.map((a) => ({
                    value: a.id,
                    label: `${a.code} · ${a.name}`,
                  }))}
                />
              </div>
              <Select
                value={l.side}
                onValueChange={(v) =>
                  updateLine(i, { side: v as 'debe' | 'haber' })
                }
              >
                <SelectTrigger size="sm" className="w-24 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debe">Debe</SelectItem>
                  <SelectItem value="haber">Haber</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={l.amountBasis}
                onValueChange={(v) =>
                  updateLine(i, { amountBasis: v as RuleAmountBasis })
                }
              >
                <SelectTrigger size="sm" className="w-44 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {basesDelModulo(sourceModule).map((b) => (
                    <SelectItem key={b} value={b}>
                      {etiquetaBase(b, sourceModule)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="number"
                step="0.01"
                value={l.fixedAmount}
                disabled={l.amountBasis !== 'fijo'}
                onChange={(e) => updateLine(i, { fixedAmount: e.target.value })}
                className={`${INPUT_CLASS} w-24 h-8 text-right disabled:opacity-40`}
              />
              <button
                onClick={() =>
                  setLines((prev) => prev.filter((_, idx) => idx !== i))
                }
                disabled={lines.length <= 2}
                className="w-6 h-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:text-[oklch(0.55_0.18_25)] disabled:opacity-30"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 px-3 py-2 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <button
              onClick={() =>
                setLines((prev) => [...prev, emptyRuleLine('debe')])
              }
              className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Agregar línea
            </button>
            <span className="ml-auto text-[11.5px]">
              {linesOk && cuadre?.estado === 'descuadra' ? (
                <span className="text-[var(--arca-accent-neg-fg)]">
                  Las líneas no cuadran (ver abajo)
                </span>
              ) : linesOk ? (
                <span className="text-[oklch(0.40_0.14_145)]">
                  ✓ Líneas válidas
                </span>
              ) : (
                <span className="text-[var(--arca-ink-3)]">
                  Requiere ≥2 líneas, al menos una al Debe y una al Haber
                </span>
              )}
            </span>
          </div>
        </div>

        {cuadre?.mensaje && (
          <AvisoRegla
            tono={cuadre.estado === 'descuadra' ? 'error' : 'info'}
            texto={cuadre.mensaje}
          />
        )}

        <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 bg-[var(--arca-surface)] px-6 pb-6">
          <button
            data-tour="regla-cancelar"
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!canSave || mut.isPending}
            data-tour="regla-guardar"
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Guardando…' : 'Guardar regla'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDetailDialog({
  ruleId,
  isOwner,
  onClose,
  onEdit,
  onChanged,
}: {
  ruleId: string;
  isOwner: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onChanged: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'rule', ruleId],
    queryFn: () => getMappingRule({ data: { id: ruleId } }),
  });
  const toggleMut = useMutation({
    mutationFn: (isActive: boolean) =>
      setMappingRuleActive({ data: { id: ruleId, isActive } }),
    onSuccess: () => {
      toast.success('Estado actualizado');
      onChanged();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px] max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {isLoading || !data ? (
          <div className="py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {data.rule.nombre}
                {!data.rule.activa && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                    Inactiva
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                Módulo: {MAPPING_SOURCE_LABELS[data.rule.modulo]} ·{' '}
                {MAPPING_RULE_TYPE_LABELS[data.rule.tipo]}
              </DialogDescription>
            </DialogHeader>

            {data.scope ? (
              <div className="rounded-[8px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 text-[12.5px] text-[var(--arca-ink-2)]">
                Aplica a: <strong>{data.scope}</strong>
              </div>
            ) : (
              data.rule.tipo === 'condicional' &&
              data.rule.condition && (
                <div className="text-[11.5px] font-mono rounded-[8px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-3 py-2 text-[var(--arca-ink-2)]">
                  {JSON.stringify(data.rule.condition)}
                </div>
              )
            )}
            {data.missingDirection && (
              <AvisoRegla
                tono="warn"
                texto="Esta regla no dice si es de ventas o de compras, así que se aplica a las dos. Editala y elegí una."
              />
            )}
            {data.balance?.message && (
              <AvisoRegla
                tono={data.balance.status === 'descuadra' ? 'error' : 'info'}
                texto={data.balance.message}
              />
            )}

            <div className="border border-[var(--arca-border)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[10px] font-semibold">
                <div className="flex-1">Cuenta</div>
                <div className="w-16">Lado</div>
                <div className="w-48">Base del monto</div>
              </div>
              {data.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)] text-[12.5px]"
                >
                  <div className="flex-1 min-w-0 truncate">
                    <span className="font-mono text-[11px] text-[var(--arca-ink-3)]">
                      {l.accountCode}
                    </span>{' '}
                    {l.accountName}
                  </div>
                  <div className="w-16 font-medium">
                    {MAPPING_SIDE_LABELS[l.side]}
                  </div>
                  <div className="w-48 text-[var(--arca-ink-2)]">
                    {MAPPING_AMOUNT_BASIS_LABELS[l.amountBasis]}
                    {l.amountBasis === 'fijo' && l.fixedAmount
                      ? ` ($ ${fmtMoney(l.fixedAmount)})`
                      : ''}
                  </div>
                </div>
              ))}
            </div>

            {isOwner && (
              <DialogFooter>
                <button
                  onClick={() => toggleMut.mutate(!data.rule.activa)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
                >
                  <Power className="w-3.5 h-3.5" strokeWidth={1.8} />
                  {data.rule.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => onEdit(ruleId)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90"
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} /> Editar
                </button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportRulesDialog({
  clientId,
  clients,
  onClose,
  onDone,
}: {
  clientId: string;
  clients: AccClient[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState('');

  // Sólo empresas que tengan algo para copiar: listar la cartera entera era
  // pedirle al usuario que adivine cuál de 130 tiene reglas.
  const { data: conReglas = [], isLoading: cargandoOrigenes } = useQuery({
    queryKey: ['accounting', 'clientes-con-reglas'],
    queryFn: () => listClientesConReglasActivas(),
  });
  const activasPorCliente = new Map(
    conReglas.map((c) => [c.clienteId, c.activas])
  );
  const others = clients.filter(
    (c) => c.id !== clientId && activasPorCliente.has(c.id)
  );

  const { data: preview = [] } = useQuery({
    queryKey: ['accounting', 'rules', fromId, ''],
    queryFn: () => listMappingRules({ data: { clientId: fromId } }),
    enabled: !!fromId,
  });

  const mut = useMutation({
    mutationFn: () =>
      importMappingRules({
        data: { fromClientId: fromId, toClientId: clientId },
      }),
    onSuccess: (res) => {
      toast.success(
        `${res.created} regla(s) importada(s), inactivas y al final de la cola`
      );
      // Antes solo se decía cuántas quedaron afuera y siempre por el mismo
      // motivo. Ahora cada una dice el suyo, con las cuentas que faltan.
      for (const r of res.skipped) {
        const motivo =
          r.motivo === 'ya_existe'
            ? 'la empresa ya tiene una regla con ese nombre'
            : r.motivo === 'sin_lineas'
              ? 'la regla de origen no tiene líneas suficientes'
              : `faltan cuentas en el plan: ${(r.cuentas ?? []).join(', ')}`;
        toast.warning(`«${r.nombre}» no se importó: ${motivo}`);
      }
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Importar reglas de otra empresa</DialogTitle>
          <DialogDescription>
            Se copian las reglas a esta empresa como <strong>inactivas</strong>.
            Las cuentas se resuelven por código; las reglas con cuentas que no
            existan acá se omiten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--arca-ink-3)]">
              Empresa origen
            </label>
            <Select
              value={fromId}
              onValueChange={(v) => setFromId(v)}
              disabled={cargandoOrigenes || others.length === 0}
            >
              <SelectTrigger className="w-full text-[12.5px]">
                <SelectValue
                  placeholder={
                    cargandoOrigenes
                      ? 'Buscando empresas con reglas…'
                      : others.length === 0
                        ? 'Ninguna otra empresa tiene reglas activas'
                        : '— Elegí la empresa origen —'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {others.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    <span className="ml-2 text-[var(--arca-ink-3)]">
                      {activasPorCliente.get(c.id)}{' '}
                      {activasPorCliente.get(c.id) === 1
                        ? 'regla activa'
                        : 'reglas activas'}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!cargandoOrigenes && others.length === 0 && (
              <p className="text-[11.5px] text-[var(--arca-ink-3)]">
                Sólo se puede importar de una empresa que ya tenga reglas
                activas. Todavía no hay ninguna otra.
              </p>
            )}
          </div>

          {fromId && (
            <div className="border border-[var(--arca-border)] rounded-[8px] max-h-[240px] overflow-y-auto">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--arca-ink-3)] bg-[var(--arca-surface-2)]">
                Reglas a copiar ({preview.length})
              </div>
              {preview.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-[var(--arca-ink-3)] text-center">
                  Esa empresa no tiene reglas.
                </div>
              ) : (
                preview.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)] text-[12px]"
                  >
                    <span className="flex-1 min-w-0 truncate">{r.name}</span>
                    <span className="text-[var(--arca-ink-3)]">
                      {
                        MAPPING_SOURCE_LABELS[
                          r.sourceModule as
                            | 'comprobante'
                            | 'recibo'
                            | 'movimiento_bancario'
                        ]
                      }{' '}
                      · {r.lineCount} líneas
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!fromId || preview.length === 0 || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Importando…' : 'Importar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════ Contabilizar facturas (US 3.2.x) ════════════════════ */

type PostingInvoice = Awaited<
  ReturnType<typeof getInvoicePostingPreview>
>['invoices'][number];

function Contabilizar({
  clientId,
  canWrite,
  isOwner,
}: {
  clientId: string;
  canWrite: boolean;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'all' | 'emitido' | 'recibido'>(
    'all'
  );
  const [includePosted, setIncludePosted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmReg, setConfirmReg] = useState<{
    invoiceId: string;
    number: number;
  } | null>(null);
  /** Regeneración en bloque que se salteó asientos editados a mano. */
  const [confirmBulkForce, setConfirmBulkForce] = useState<{
    invoiceIds: string[];
    edited: number;
  } | null>(null);
  const [voidIds, setVoidIds] = useState<string[] | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [
      'accounting',
      'posting-preview',
      clientId,
      direction,
      includePosted,
    ],
    queryFn: () =>
      getInvoicePostingPreview({
        data: { clientId, direction, includePosted },
      }),
  });

  const invoices = data?.invoices ?? [];
  const hasFy = data?.hasFiscalYear ?? true;
  /** El backend cortó la lista: hay más comprobantes que el tope que trae. */
  const truncado = data?.truncado ?? false;

  // Se marca cualquier factura de un período abierto: las pendientes para
  // generar, las contabilizadas para regenerar o anular.
  const selectable = useMemo(
    () => invoices.filter((i) => i.periodStatus !== 'cerrado'),
    [invoices]
  );
  const marcadas = useMemo(
    () => selectable.filter((i) => selected.has(i.id)),
    [selectable, selected]
  );
  const marcadasPendientes = marcadas.filter((i) => !i.posted);
  const marcadasContabilizadas = marcadas.filter((i) => i.posted);
  const cambiarian = invoices.filter((i) => i.posted && i.ruleWouldChange);

  // Otra empresa u otro filtro: lo marcado ya no está a la vista.
  const selKey = `${clientId}|${direction}|${includePosted}`;
  const [prevSelKey, setPrevSelKey] = useState(selKey);
  if (prevSelKey !== selKey) {
    setPrevSelKey(selKey);
    setSelected(new Set());
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const genMut = useMutation({
    mutationFn: (ids: string[]) =>
      generateInvoiceEntries({ data: { clientId, invoiceIds: ids } }),
    onSuccess: (r) => {
      const parts = [`${r.created} asiento(s) generado(s)`];
      if (r.pendingReview > 0)
        parts.push(`${r.pendingReview} con pendiente de revisión`);
      const skipped =
        r.skippedExists +
        r.skippedNoFy +
        r.skippedClosed +
        r.skippedNonPositive;
      if (skipped > 0) parts.push(`${skipped} omitida(s)`);
      if (r.created > 0) toast.success(parts.join(' · '));
      else toast.message(parts.join(' · '));
      if (r.errors.length > 0)
        toast.error(`${r.errors.length} con error (revisá las reglas)`);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regMut = useMutation({
    mutationFn: (v: { invoiceId: string; number: number; force: boolean }) =>
      regenerateInvoiceEntry({
        data: { clientId, invoiceId: v.invoiceId, force: v.force },
      }),
    onSuccess: (r, v) => {
      if ('needsConfirmation' in r && r.needsConfirmation) {
        setConfirmReg({
          invoiceId: v.invoiceId,
          number: r.entryNumber ?? v.number,
        });
        return;
      }
      toast.success('Asiento regenerado');
      setConfirmReg(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkRegMut = useMutation({
    mutationFn: (v: { invoiceIds: string[]; force: boolean }) =>
      regenerateInvoiceEntries({ data: { clientId, ...v } }),
    onSuccess: (r, v) => {
      if (r.regenerated > 0)
        toast.success(`${r.regenerated} asiento(s) regenerado(s)`);
      if (r.errors.length > 0)
        toast.error(
          `${r.errors.length} no se pudieron regenerar: ${r.errors[0].reason}`
        );
      if (r.skippedEdited > 0 && !v.force) {
        setConfirmBulkForce({
          invoiceIds: v.invoiceIds,
          edited: r.skippedEdited,
        });
      } else {
        setConfirmBulkForce(null);
      }
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected =
    selectable.length > 0 && marcadas.length === selectable.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)));

  if (!hasFy) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa todavía no tiene un ejercicio contable. Creá uno en la
          pestaña <strong>Ejercicios</strong> para poder contabilizar
          comprobantes.
        </div>
      </ArcaCard>
    );
  }

  const ocupado = genMut.isPending || bulkRegMut.isPending;

  return (
    <div className="space-y-4">
      {truncado && (
        <ArcaCard>
          <div className="px-4 py-2.5 text-[12.5px] text-[var(--arca-ink-2)]">
            Esta empresa tiene más comprobantes de los que entran en la
            previsualización: se muestran los más antiguos del ejercicio.
            Contabilizá por tandas, o acotá con el filtro de ventas y compras.
          </div>
        </ArcaCard>
      )}

      {/* Los filtros afuera de la tabla y la explicación detrás del botón de
        ayuda: eran cuatro renglones fijos arriba de todo. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={direction}
          onValueChange={(v) =>
            setDirection(v as 'all' | 'emitido' | 'recibido')
          }
        >
          <SelectTrigger size="sm" className="w-[176px] data-[size=sm]:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ventas y compras</SelectItem>
            <SelectItem value="emitido">Solo ventas</SelectItem>
            <SelectItem value="recibido">Solo compras</SelectItem>
          </SelectContent>
        </Select>

        {/* Chip, como "Incluir anulados" y "Ocultar bajas": en esta
          plataforma un filtro de sí/no es un chip, no un checkbox. */}
        <button
          type="button"
          aria-pressed={includePosted}
          onClick={() => setIncludePosted(!includePosted)}
          className={chipFiltro(includePosted)}
        >
          Mostrar ya contabilizadas
        </button>

        <Ayuda titulo="Contabilizar comprobantes" etiqueta="Cómo funciona">
          <p>
            Acá generás los asientos automáticos de las facturas aplicando las{' '}
            <strong>reglas de mapeo</strong>. La columna «Regla» dice cuál se va
            a usar; en las ya contabilizadas, cuál se usó.
          </p>
          <p>
            Si cambiaste las reglas, marcá las contabilizadas y tocá{' '}
            <strong>Regenerar</strong>: se anula el asiento viejo y se crea uno
            nuevo con las reglas de hoy.
          </p>
          <p>
            Si una factura no tiene regla (o la regla no cubre el total), el
            asiento se crea con la cuenta <strong>Pendiente de revisión</strong>
            , que bloquea el cierre hasta que la corrijas a mano.
          </p>
        </Ayuda>

        <div className="ml-auto flex items-center gap-2">
          {isOwner && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="size-3.5" strokeWidth={2} />
              Reiniciar ejercicio
            </Button>
          )}
          {canWrite && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => genMut.mutate(marcadasPendientes.map((i) => i.id))}
              disabled={marcadasPendientes.length === 0 || ocupado}
            >
              <Zap className="size-3.5" strokeWidth={2} />
              {genMut.isPending
                ? 'Generando…'
                : `Generar ${marcadasPendientes.length > 0 ? `(${marcadasPendientes.length})` : 'seleccionadas'}`}
            </Button>
          )}
        </div>
      </div>

      {cambiarian.length > 0 && (
        <AvisoRegla
          tono="warn"
          texto={
            <>
              {cambiarian.length}{' '}
              {cambiarian.length === 1
                ? 'factura contabilizada usaría'
                : 'facturas contabilizadas usarían'}{' '}
              otra regla con la configuración de hoy.{' '}
              {canWrite && (
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() =>
                    setSelected(new Set(cambiarian.map((i) => i.id)))
                  }
                >
                  Marcarlas
                </button>
              )}{' '}
              y regenerarlas.
            </>
          }
        />
      )}

      <ArcaCard>
        {canWrite && marcadas.length > 0 && (
          <BarraSeleccion
            cantidad={marcadas.length}
            unidad="factura"
            unidadPlural="facturas"
            onLimpiar={() => setSelected(new Set())}
          >
            {marcadasContabilizadas.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={ocupado}
                  onClick={() =>
                    bulkRegMut.mutate({
                      invoiceIds: marcadasContabilizadas.map((i) => i.id),
                      force: false,
                    })
                  }
                >
                  <RefreshCw className="size-3.5" strokeWidth={2} />
                  {bulkRegMut.isPending
                    ? 'Regenerando…'
                    : `Regenerar ${marcadasContabilizadas.length}`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-[var(--arca-accent-neg-fg)]"
                  disabled={ocupado}
                  onClick={() =>
                    setVoidIds(
                      marcadasContabilizadas
                        .map((i) => i.entryId)
                        .filter((x): x is string => !!x)
                    )
                  }
                >
                  <Ban className="size-3.5" strokeWidth={2} />
                  Anular {marcadasContabilizadas.length}
                </Button>
              </>
            )}
          </BarraSeleccion>
        )}
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando comprobantes…
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            {includePosted
              ? 'No hay comprobantes en el rango de los ejercicios.'
              : 'No hay comprobantes pendientes de contabilizar.'}
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                <th className="w-9 py-2 pl-4">
                  {canWrite && selectable.length > 0 && (
                    <CasillaSeleccion
                      checked={allSelected}
                      onChange={toggleAll}
                      label="Marcar todas"
                    />
                  )}
                </th>
                <th className="py-2">Fecha</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Contraparte</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 pl-4">Regla / Estado</th>
                <th className="py-2 pr-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--arca-surface)]">
              {invoices.map((inv) => (
                <PostingRow
                  key={inv.id}
                  inv={inv}
                  canWrite={canWrite}
                  checked={selected.has(inv.id)}
                  onToggle={() => toggle(inv.id)}
                  onRegenerate={() =>
                    regMut.mutate({
                      invoiceId: inv.id,
                      number: inv.entryNumber ?? 0,
                      force: false,
                    })
                  }
                  regenerating={regMut.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </ArcaCard>

      {/* Confirmación de sobreescritura de asiento editado a mano */}
      <AlertDialog
        open={!!confirmReg}
        onOpenChange={(o) => !o && setConfirmReg(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este asiento fue editado a mano</AlertDialogTitle>
            <AlertDialogDescription>
              El asiento N°{confirmReg?.number} se editó manualmente después de
              generarse. Si lo regenerás, se anulará y se reemplazará por uno
              nuevo según las reglas actuales, perdiendo los cambios manuales.
              ¿Querés sobreescribirlo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmReg(null)}>
              Mantener manual
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmReg)
                  regMut.mutate({
                    invoiceId: confirmReg.invoiceId,
                    number: confirmReg.number,
                    force: true,
                  });
              }}
            >
              Sobreescribir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lo mismo, para la regeneración en bloque */}
      <AlertDialog
        open={!!confirmBulkForce}
        onOpenChange={(o) => !o && setConfirmBulkForce(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulkForce?.edited} asiento(s) editados a mano
            </AlertDialogTitle>
            <AlertDialogDescription>
              No se regeneraron porque alguien los corrigió después de
              generarlos. Si los regenerás, se pierden esas correcciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Dejarlos como están</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmBulkForce)
                  bulkRegMut.mutate({
                    invoiceIds: confirmBulkForce.invoiceIds,
                    force: true,
                  });
              }}
            >
              Regenerarlos también
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {voidIds && (
        <AnularEnBloqueDialog
          clientId={clientId}
          entryIds={voidIds}
          onClose={() => setVoidIds(null)}
          onDone={() => {
            setVoidIds(null);
            setSelected(new Set());
            refresh();
          }}
        />
      )}
      {resetOpen && (
        <ReiniciarEjercicioDialog
          clientId={clientId}
          onClose={() => setResetOpen(false)}
          onDone={() => {
            setResetOpen(false);
            setSelected(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PostingRow({
  inv,
  canWrite,
  checked,
  onToggle,
  onRegenerate,
  regenerating,
}: {
  inv: PostingInvoice;
  canWrite: boolean;
  checked: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const closed = inv.periodStatus === 'cerrado';
  const dirLabel =
    inv.direction === 'emitido'
      ? 'Venta'
      : inv.direction === 'recibido'
        ? 'Compra'
        : '—';

  return (
    <tr
      className={cn(
        'border-b border-[var(--arca-border)] last:border-0 hover:bg-[var(--arca-surface-2)]',
        checked && 'bg-[var(--arca-accent-bg)]'
      )}
    >
      <td className="py-2 pl-4">
        {canWrite && !closed && (
          <CasillaSeleccion
            checked={checked}
            onChange={onToggle}
            label={`Marcar ${dirLabel.toLowerCase()} ${inv.type} de ${inv.counterparty}`}
          />
        )}
      </td>
      <td className="py-2 whitespace-nowrap">{fmtFecha(inv.emitionDate)}</td>
      <td className="py-2">
        <span className="text-[var(--arca-ink-3)]">{dirLabel}</span> {inv.type}
      </td>
      <td className="py-2 max-w-[220px] truncate" title={inv.counterparty}>
        {inv.counterparty}
      </td>
      <td className="py-2 text-right tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap">
        $ {fmtMoney(inv.total)}
      </td>
      <td className="py-2 pl-4">
        {inv.posted ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="px-1.5 py-px rounded-full text-[11px] bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)] border border-[var(--arca-accent-pos)]">
              Asiento N°{inv.entryNumber}
            </span>
            <span className="text-[var(--arca-ink-2)]">
              {inv.appliedRuleName ?? 'Sin regla'}
            </span>
            {inv.entryEdited && (
              <span className="px-1.5 py-px rounded-full text-[11px] bg-[var(--arca-accent-bg)] text-[var(--arca-accent-hover)] border border-[var(--arca-accent)]">
                editado
              </span>
            )}
            {inv.ruleWouldChange && !closed && (
              <span
                className="px-1.5 py-px rounded-full text-[11px] bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)] border border-[var(--arca-accent-warn)]"
                title="Con las reglas de hoy este comprobante usaría otra regla. Regeneralo para aplicarla."
              >
                hoy: {inv.ruleName ?? 'sin regla'}
              </span>
            )}
          </span>
        ) : closed ? (
          <span className="text-[var(--arca-ink-3)]">Período cerrado</span>
        ) : inv.ruleName ? (
          <span className="inline-flex items-center gap-1.5">
            <span>{inv.ruleName}</span>
            {inv.willUsePendingReview && (
              <span
                className="px-1.5 py-px rounded-full text-[11px] bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)] border border-[var(--arca-accent-warn)]"
                title="La regla no cubre todo el importe (percepciones sin mapear o bases que no cuadran): la diferencia irá a Pendiente de revisión"
              >
                + pendiente
              </span>
            )}
          </span>
        ) : (
          <span className="px-1.5 py-px rounded-full text-[11px] bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)] border border-[var(--arca-accent-warn)]">
            Sin regla → Pendiente de revisión
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-right">
        {inv.posted && canWrite && !closed && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--arca-ink-2)] hover:text-[var(--arca-accent)] disabled:opacity-50"
            title="Anular el asiento actual y regenerarlo con las reglas vigentes"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
            Regenerar
          </button>
        )}
      </td>
    </tr>
  );
}

/* ════════════════ Bandeja de pendientes de revisión (US 3.4.x) ════════════════ */

function Pendientes({
  clientId,
  canWrite,
  onGoToReglas,
}: {
  clientId: string;
  canWrite: boolean;
  onGoToReglas: () => void;
}) {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['accounting', 'pending-review', clientId],
    queryFn: () => getPendingReviewEntries({ data: { clientId } }),
  });
  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const openEditorFromDetail = (
    _action: 'edit' | 'duplicate',
    initial: EditorInitial
  ) => {
    setDetailId(null);
    setEditor({ mode: 'edit', initial });
  };

  return (
    <div className="space-y-4">
      {/* Es un aviso de verdad —bloquea el cierre— así que se queda como
        banner y no como botón de ayuda. Lo que cambia es el color: el texto
        va en el `-fg` del estado, no en `ink-2`, y el borde a un cuarto de
        opacidad como el resto de los banners tonales. */}
      <div
        role="status"
        className="flex gap-2 rounded-[var(--arca-r-md)] border border-[var(--arca-accent-warn)]/25 bg-[var(--arca-accent-warn-bg)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--arca-accent-warn-fg)]"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
        <div>
          <strong>Pendientes de revisión.</strong> Asientos automáticos que el
          sistema no pudo imputar del todo a una cuenta concreta (falta una
          regla, o hay impuestos/conceptos sin mapear). Quedan en la cuenta{' '}
          <strong>Pendiente de revisión</strong> y{' '}
          <strong>bloquean el cierre</strong> del período hasta resolverlos.
          Abrí cada uno para corregir las cuentas, o configurá una regla para
          que se mapee bien la próxima vez.
        </div>
      </div>

      <ArcaCard>
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay asientos pendientes de revisión.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                <th className="py-2 pl-4">N°</th>
                <th className="py-2">Fecha</th>
                <th className="py-2">Período</th>
                <th className="py-2">Origen</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">A revisar</th>
                <th className="py-2 pl-4">Qué falta</th>
                <th className="py-2 pr-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--arca-surface)]">
              {entries.map((e) => (
                <PendingRow
                  key={e.id}
                  entry={e}
                  canWrite={canWrite}
                  onOpen={() => setDetailId(e.id)}
                  onCreateRule={onGoToReglas}
                />
              ))}
            </tbody>
          </table>
        )}
      </ArcaCard>

      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onAction={openEditorFromDetail}
          onChanged={invalidate}
        />
      )}

      {editor && (
        <AsientoEditor
          clientId={clientId}
          state={editor}
          postable={postable}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function PendingRow({
  entry,
  canWrite,
  onOpen,
  onCreateRule,
}: {
  entry: PendingReviewEntry;
  canWrite: boolean;
  onOpen: () => void;
  onCreateRule: () => void;
}) {
  const closed = entry.periodStatus === 'cerrado';
  return (
    <tr className="border-b border-[var(--arca-border)] last:border-0 hover:bg-[var(--arca-surface-2)]">
      <td className="py-2 pl-4 tabular-nums [font-family:var(--ff-mono)]">
        {entry.number}
      </td>
      <td className="py-2 whitespace-nowrap">{fmtFecha(entry.entryDate)}</td>
      <td className="py-2 whitespace-nowrap">
        {MONTH_NAMES[entry.periodMonth]} {entry.periodYear}
        {closed && (
          <span className="ml-1 text-[10px] text-[var(--arca-ink-3)]">
            (cerrado)
          </span>
        )}
      </td>
      <td className="py-2">
        {JOURNAL_ORIGIN_LABELS[entry.origin] ?? entry.origin}
      </td>
      <td className="py-2 text-right tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap">
        $ {fmtMoney(entry.total)}
      </td>
      <td className="py-2 text-right tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap text-[var(--arca-accent-warn-fg)] font-medium">
        $ {fmtMoney(entry.pendingAmount)}
      </td>
      <td className="py-2 pl-4 max-w-[280px]">
        <span className="text-[var(--arca-ink-2)]">
          {entry.motivos.length > 0 ? entry.motivos.join(' · ') : 'Sin detalle'}
        </span>
      </td>
      <td className="py-2 pr-4 text-right whitespace-nowrap">
        <button
          onClick={onOpen}
          className="text-[12px] text-[var(--arca-accent)] hover:underline"
        >
          {canWrite ? 'Resolver' : 'Ver'}
        </button>
        {canWrite && (
          <button
            onClick={onCreateRule}
            className="ml-3 text-[12px] text-[var(--arca-ink-2)] hover:text-[var(--arca-accent)]"
            title="Ir a Reglas para configurar el mapeo y evitar que vuelva a pasar"
          >
            Crear regla
          </button>
        )}
      </td>
    </tr>
  );
}

/* ════════════════════════ Bienes de uso (US 4.1.x) ════════════════════════ */

function BienesDeUso({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<'inventario' | 'anexo'>('inventario');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'' | 'activo' | 'vendido' | 'baja'>(
    'activo'
  );
  const [showEditor, setShowEditor] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<FixedAssetRow | null>(
    null
  );

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['accounting', 'fixed-assets', clientId, category, status],
    queryFn: () =>
      listFixedAssets({
        data: {
          clientId,
          category: category || undefined,
          status: status || undefined,
        },
      }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting', 'fixed-assets'] });
  };

  return (
    <div className="space-y-4">
      {/* Sub-toggle Inventario | Anexo I */}
      <div className="inline-flex rounded-[8px] border border-[var(--arca-border)] p-0.5 bg-[var(--arca-surface-2)]">
        {(['inventario', 'anexo'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-3 h-7 text-[12.5px] font-medium rounded-[6px] transition-colors"
            style={{
              background: view === v ? 'var(--arca-surface)' : 'transparent',
              color: view === v ? 'var(--arca-ink)' : 'var(--arca-ink-3)',
              boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {v === 'inventario' ? 'Inventario' : 'Anexo I'}
          </button>
        ))}
      </div>

      {view === 'anexo' ? (
        <AnexoIView
          clientId={clientId}
          canWrite={canWrite}
          clientName={clientName}
        />
      ) : (
        <ArcaCard>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--arca-border)]">
            <Select
              value={category === '' ? 'all' : category}
              onValueChange={(v) => setCategory(v === 'all' ? '' : v)}
            >
              <SelectTrigger size="sm" className="w-48 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {Object.entries(FIXED_ASSET_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status === '' ? 'all' : status}
              onValueChange={(v) =>
                setStatus(
                  v === 'all' ? '' : (v as 'activo' | 'vendido' | 'baja')
                )
              }
            >
              <SelectTrigger size="sm" className="w-44 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="vendido">Vendidos</SelectItem>
                <SelectItem value="baja">Dados de baja</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {canWrite && (
              <button
                onClick={() => setShowEditor(true)}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white inline-flex items-center gap-1.5"
              >
                <Boxes className="w-3.5 h-3.5" strokeWidth={2} />
                Nuevo bien
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Cargando…
            </div>
          ) : assets.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              No hay bienes de uso para este filtro.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  <th className="py-2 pl-4">Nombre</th>
                  <th className="py-2">Categoría</th>
                  <th className="py-2">Fecha adq.</th>
                  <th className="py-2 text-right">Valor origen</th>
                  <th className="py-2 text-right">Amort. acum.</th>
                  <th className="py-2 text-right">Valor residual</th>
                  <th className="py-2 pl-3">Estado</th>
                  <th className="py-2 pr-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--arca-surface)]">
                {assets.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--arca-border)] last:border-0 hover:bg-[var(--arca-surface-2)]"
                  >
                    <td className="py-2 pl-4 font-medium text-[var(--arca-ink)]">
                      {a.name}
                    </td>
                    <td className="py-2">
                      {FIXED_ASSET_CATEGORY_LABELS[a.category] ?? a.category}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {fmtFecha(a.acquisitionDate)}
                    </td>
                    <td className="py-2 text-right tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap">
                      $ {fmtMoney(a.originalValue)}
                    </td>
                    <td className="py-2 text-right tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap text-[var(--arca-ink-3)]">
                      $ {fmtMoney(a.accumulatedDepreciation)}
                    </td>
                    <td className="py-2 text-right tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap font-medium">
                      $ {fmtMoney(a.bookValue)}
                    </td>
                    <td className="py-2 pl-3">
                      <FixedAssetStatusBadge
                        status={a.status}
                        reason={a.disposalReason}
                      />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {canWrite && a.status === 'activo' && (
                        <button
                          onClick={() => setDisposeTarget(a)}
                          className="text-[12px] text-[var(--arca-ink-2)] hover:text-[var(--arca-accent-neg-fg)]"
                        >
                          Dar de baja
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ArcaCard>
      )}

      {showEditor && (
        <FixedAssetEditor
          clientId={clientId}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false);
            invalidate();
          }}
        />
      )}

      {disposeTarget && (
        <DisposeAssetDialog
          asset={disposeTarget}
          onClose={() => setDisposeTarget(null)}
          onSaved={() => {
            setDisposeTarget(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function FixedAssetStatusBadge({
  status,
  reason,
}: {
  status: string;
  reason: string | null;
}) {
  const color =
    status === 'activo' ? 'oklch(0.45 0.14 145)' : 'oklch(0.50 0.02 260)';
  const label = FIXED_ASSET_STATUS_LABELS[status] ?? status;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 86%)`,
        color,
      }}
      title={reason ? FIXED_ASSET_DISPOSAL_REASON_LABELS[reason] : undefined}
    >
      {label}
      {reason ? ` · ${FIXED_ASSET_DISPOSAL_REASON_LABELS[reason]}` : ''}
    </span>
  );
}

function FixedAssetEditor({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('rodados');
  const [assetAccountId, setAssetAccountId] = useState('');
  const [accumDeprAccountId, setAccumDeprAccountId] = useState('');
  const [deprExpenseAccountId, setDeprExpenseAccountId] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [usefulLifeYears, setUsefulLifeYears] = useState('');
  const [residualValue, setResidualValue] = useState('0');

  const { data: accounts } = useQuery({
    queryKey: ['accounting', 'fixed-asset-accounts', clientId],
    queryFn: () => getFixedAssetAccounts({ data: { clientId } }),
  });

  const ov = num(originalValue);
  const rv = num(residualValue);
  const life = parseInt(usefulLifeYears, 10);
  const monthly =
    ov > 0 && life > 0 && rv < ov
      ? monthlyDepreciation({
          acquisitionDate: acquisitionDate || '2000-01-01',
          originalValue: ov,
          usefulLifeYears: life,
          residualValue: rv,
          status: 'activo',
        })
      : 0;

  const mut = useMutation({
    mutationFn: async () => {
      await createFixedAsset({
        data: {
          clientId,
          name: name.trim(),
          category: category as 'rodados',
          assetAccountId,
          accumDeprAccountId,
          deprExpenseAccountId,
          acquisitionDate,
          originalValue: ov,
          usefulLifeYears: life,
          residualValue: rv,
        },
      });
    },
    onSuccess: () => {
      toast.success('Bien de uso registrado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid =
    name.trim() &&
    assetAccountId &&
    accumDeprAccountId &&
    deprExpenseAccountId &&
    acquisitionDate &&
    ov > 0 &&
    life > 0 &&
    rv < ov;

  const accSelect = (
    value: string,
    onChange: (v: string) => void,
    opts: { id: string; code: string; name: string }[] | undefined,
    placeholder: string
  ) => (
    <Select value={value} onValueChange={(v) => onChange(v)}>
      <SelectTrigger size="sm" className="w-0 min-w-0 flex-1 text-[12.5px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(opts ?? []).map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.code} · {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo bien de uso</DialogTitle>
          <DialogDescription>
            El sistema calculará la amortización lineal automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre *" full>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Toyota Hilux 2024"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Categoría *">
            <Select value={category} onValueChange={(v) => setCategory(v)}>
              <SelectTrigger size="sm" className="w-full text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FIXED_ASSET_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Fecha de adquisición *">
            <SelectorFecha
              value={acquisitionDate}
              onChange={(v) => setAcquisitionDate(v)}
            />
          </Field>

          <Field
            label={
              <>
                Cuenta del activo *
                <HelpTip text="Dónde se registra el bien en el activo. Solo cuentas de Bienes de uso (saldo deudor)." />
              </>
            }
            full
          >
            <div className="flex">
              {accSelect(
                assetAccountId,
                setAssetAccountId,
                accounts?.assetAccounts,
                'Elegí la cuenta del activo…'
              )}
            </div>
          </Field>

          <Field
            label={
              <>
                Cuenta de amortización acumulada *
                <HelpTip text="Regularizadora del activo. Solo cuentas '(-) Amortización acumulada…' (saldo acreedor)." />
              </>
            }
            full
          >
            <div className="flex">
              {accSelect(
                accumDeprAccountId,
                setAccumDeprAccountId,
                accounts?.accumAccounts,
                'Elegí la cuenta de amort. acumulada…'
              )}
            </div>
          </Field>

          <Field
            label={
              <>
                Cuenta de gasto de amortización *
                <HelpTip text="A qué gasto impacta la amortización del período. Solo cuentas de resultado negativo (gastos)." />
              </>
            }
            full
          >
            <div className="flex">
              {accSelect(
                deprExpenseAccountId,
                setDeprExpenseAccountId,
                accounts?.expenseAccounts,
                'Elegí la cuenta de gasto…'
              )}
            </div>
          </Field>

          <Field label="Valor de origen *">
            <input
              type="number"
              value={originalValue}
              onChange={(e) => setOriginalValue(e.target.value)}
              placeholder="0.00"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Valor residual">
            <input
              type="number"
              value={residualValue}
              onChange={(e) => setResidualValue(e.target.value)}
              placeholder="0.00"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Vida útil (años) *">
            <input
              type="number"
              value={usefulLifeYears}
              onChange={(e) => setUsefulLifeYears(e.target.value)}
              placeholder="Ej: 5"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Método">
            <input
              value="Lineal"
              disabled
              className={`${INPUT_CLASS} opacity-60`}
            />
          </Field>
        </div>

        {/* Preview de amortización mensual */}
        <div className="mt-1 flex items-center justify-between rounded-[8px] bg-[var(--arca-surface-2)] px-4 py-2.5 text-[12.5px]">
          <span className="text-[var(--arca-ink-2)]">
            Amortización mensual (lineal)
          </span>
          <span className="font-semibold tabular-nums text-[var(--arca-ink)]">
            $ {fmtMoney(monthly)}
            <span className="ml-2 text-[11px] font-normal text-[var(--arca-ink-3)]">
              {life > 0 ? `· $ ${fmtMoney(monthly * 12)} / año` : ''}
            </span>
          </span>
        </div>
        {rv >= ov && ov > 0 && (
          <p className="text-[11px] text-[var(--arca-accent-neg-fg)]">
            El valor residual debe ser menor al valor de origen.
          </p>
        )}

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!valid || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Guardando…' : 'Registrar bien'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeAssetDialog({
  asset,
  onClose,
  onSaved,
}: {
  asset: FixedAssetRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [disposalDate, setDisposalDate] = useState('');
  const [reason, setReason] = useState<'venta' | 'desuso' | 'destruccion'>(
    'venta'
  );

  const mut = useMutation({
    mutationFn: async () => {
      await disposeFixedAsset({ data: { id: asset.id, disposalDate, reason } });
    },
    onSuccess: () => {
      toast.success('Bien dado de baja');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dar de baja: {asset.name}</DialogTitle>
          <DialogDescription>
            A partir de la fecha de baja deja de amortizarse. No se borra el
            historial.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de baja *">
            <SelectorFecha
              value={disposalDate}
              onChange={(v) => setDisposalDate(v)}
            />
          </Field>
          <Field label="Motivo *">
            <Select
              value={reason}
              onValueChange={(v) =>
                setReason(v as 'venta' | 'desuso' | 'destruccion')
              }
            >
              <SelectTrigger size="sm" className="w-full text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FIXED_ASSET_DISPOSAL_REASON_LABELS).map(
                  ([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!disposalDate || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent-neg-fg)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Procesando…' : 'Confirmar baja'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tabla que no entra a lo ancho: la primera columna —la que nombra la partida—
 * queda congelada mientras el resto scrollea de costado. Se aplica al `<table>`.
 *
 * Cada fila tiene que traer su propio fondo opaco: la celda fija hereda el de
 * su `<tr>` (`bg-inherit`) y, si es transparente, se transparenta encima lo que
 * pasa por debajo al scrollear. Por eso los `<tr>` de estas tablas llevan
 * `bg-[var(--arca-surface)]` explícito en vez de quedar sin fondo.
 */
const COL_FIJA = [
  // Solo la primera fila del encabezado: en las cabeceras de dos y tres niveles
  // la celda de la partida va con `rowSpan`, así que las filas siguientes ya no
  // tienen celda en la columna 1 y congelarlas correría la que sí está.
  '[&_thead_tr:first-child_th:first-child]:sticky',
  '[&_thead_tr:first-child_th:first-child]:left-0',
  '[&_thead_tr:first-child_th:first-child]:z-20',
  '[&_thead_tr:first-child_th:first-child]:bg-inherit',
  '[&_thead_tr:first-child_th:first-child]:shadow-[inset_-1px_0_0_var(--arca-border)]',
  '[&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0',
  '[&_tbody_td:first-child]:z-10',
  '[&_tbody_td:first-child]:bg-inherit',
  '[&_tbody_td:first-child]:shadow-[inset_-1px_0_0_var(--arca-border)]',
].join(' ');

/* ════════════════════════ Anexo I (US 4.2.x) ════════════════════════ */

// Clases compartidas por la tabla del Anexo I (vista web).
const ANEXO_NUM_TD = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
const ANEXO_GROUP_BORDER = 'border-l border-[var(--arca-border)]';

function AnexoIView({
  clientId,
  canWrite,
  clientName,
  fiscalYearId,
  readOnly = false,
  conComparativo = true,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
  /**
   * Ejercicio impuesto desde afuera. Lo usa la solapa de Estados Contables,
   * que ya tiene su propio selector: dos selectores en pantalla se
   * desincronizan y el contador termina mirando ejercicios distintos.
   */
  fiscalYearId?: string;
  /** Sin edición ni sugerencia de asiento: el anexo como parte del balance. */
  readOnly?: boolean;
  /** El balance puede exponerlo sin la columna del ejercicio anterior. */
  conComparativo?: boolean;
}) {
  const [selectedFyId, setSelectedFyId] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: fiscalYears = [], isLoading: cargandoEjercicios } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId =
    fiscalYearId ?? (selectedFyId || defaultFiscalYearId(fiscalYears));

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['accounting', 'anexo-i', clientId, effectiveFyId],
    queryFn: () =>
      getAnexoI({ data: { clientId, fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  // Apagar el comparativo es una decisión de exposición: se saca acá y ni la
  // tabla ni los exportes tienen que enterarse.
  const data =
    rawData && !conComparativo ? { ...rawData, prior: null } : rawData;

  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });

  const { data: membrete } = useQuery({
    queryKey: ['accounting', 'membrete', clientId],
    queryFn: () => getMembreteData({ data: { clientId } }),
  });

  // Distinguir «todavía no llegó la lista» de «no hay ejercicios»: contra una
  // base remota la consulta tarda, y afirmar que no existe ninguno mientras
  // carga manda al usuario a crear un ejercicio que ya existe.
  if (cargandoEjercicios) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Cargando ejercicios…
        </div>
      </ArcaCard>
    );
  }

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Creá un ejercicio en la pestaña <strong>Ejercicios</strong> para
          generar el Anexo I.
        </div>
      </ArcaCard>
    );
  }

  const periodLabel = data
    ? `${fmtFecha(data.ejercicio.startDate)} – ${fmtFecha(data.ejercicio.endDate)}`
    : '';

  const buildExportData = (): AnexoIExportData => ({
    empresaName: clientName,
    fiscalYearNumber: data!.ejercicio.number,
    periodLabel,
    categories: data!.categories.map((c) => ({
      category: FIXED_ASSET_CATEGORY_LABELS[c.category] ?? c.category,
      assets: c.assets.map((a) => ({
        name: a.name,
        valorInicio: a.valorInicio,
        altas: a.altas,
        bajas: a.bajas,
        valorCierre: a.valorCierre,
        accumStart: a.accumStart,
        amortBajas: a.amortBajas,
        rate: a.rate,
        amortYear: a.amortYear,
        accumEnd: a.accumEnd,
        residualEnd: a.residualEnd,
        priorResidualEnd: data!.prior?.residualByAsset[a.id] ?? null,
      })),
      totals: {
        ...c.totals,
        priorResidualEnd: data!.prior?.residualByCategory[c.category] ?? null,
      },
    })),
    grandTotals: data!.grandTotals,
    priorResidualEnd: data!.prior?.grandTotals.residualEnd ?? null,
    priorNumber: data!.prior?.number ?? null,
    membrete: membrete
      ? {
          cuit: membrete.cuit,
          domicilio: membrete.domicilio,
          actividadPrincipal: membrete.actividadPrincipal,
          fechaConstitucion: membrete.fechaConstitucion
            ? fmtFecha(membrete.fechaConstitucion)
            : '',
          fechaInscripcion: membrete.fechaInscripcion
            ? fmtFecha(membrete.fechaInscripcion)
            : '',
          numeroInscripcion: membrete.numeroInscripcion,
          inicioLabel: fmtFechaLarga(data!.ejercicio.startDate),
          cierreLabel: fmtFechaLarga(data!.ejercicio.endDate),
          accountant: membrete.accountant,
        }
      : null,
  });

  const copyToEditor = () => {
    if (!data) return;
    const lines: LineDraft[] = data.suggestion.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.side === 'debe' ? String(l.amount) : '',
      credit: l.side === 'haber' ? String(l.amount) : '',
      description: 'Amortización del ejercicio',
    }));
    setEditor({
      mode: 'create',
      initial: {
        entryDate: new Date(data.ejercicio.endDate).toISOString().slice(0, 10),
        description: `Amortización del ejercicio N°${data.ejercicio.number}`,
        lines,
      },
    });
  };

  return (
    <div className="space-y-4">
      <ArcaCard>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--arca-border)]">
          {fiscalYearId ? (
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Anexo I · Bienes de uso
            </span>
          ) : (
            <>
              <span className="text-[12px] text-[var(--arca-ink-3)]">
                Ejercicio
              </span>
              <Select
                value={effectiveFyId}
                onValueChange={(v) => setSelectedFyId(v)}
              >
                <SelectTrigger size="sm" className="w-44 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      N°{y.numero} (
                      {y.estado === 'abierto' ? 'abierto' : 'cerrado'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <div className="flex-1" />
          {data && data.categories.length > 0 && (
            <>
              <button
                onClick={() => void exportAnexoIExcel(buildExportData())}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> Excel
              </button>
              <button
                onClick={() => void exportAnexoIPdf(buildExportData())}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> PDF
              </button>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Calculando…
          </div>
        ) : !data || data.categories.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay bienes de uso en este ejercicio.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className={`w-full min-w-[1000px] text-[11.5px] ${COL_FIJA}`}
            >
              <thead>
                <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  <th
                    className="py-2 pl-4 text-left align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Cuenta principal
                  </th>
                  <th
                    className="px-3 py-2 text-right align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Valor al inicio
                  </th>
                  <th
                    className="px-3 py-2 text-right align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Altas
                  </th>
                  <th
                    className="px-3 py-2 text-right align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Bajas
                  </th>
                  <th
                    className="px-3 py-2 text-right align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Valor al cierre
                  </th>
                  <th
                    className="px-3 py-1.5 text-center bg-[var(--arca-surface-2)] border-l border-b border-[var(--arca-border)]"
                    colSpan={4}
                  >
                    Amortizaciones
                  </th>
                  <th
                    className="px-3 py-2 text-right align-bottom border-l border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Acum. al cierre
                  </th>
                  <th
                    className="px-3 py-2 text-right align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={3}
                  >
                    Neto al cierre
                  </th>
                  {data.prior && (
                    <th
                      className="px-3 py-2 pr-4 text-right align-bottom border-l border-b border-[var(--arca-border)]"
                      rowSpan={3}
                    >
                      Neto al cierre
                      <br />
                      ej. N°{data.prior.number}
                    </th>
                  )}
                </tr>
                <tr className="text-[9.5px] uppercase tracking-wide bg-[var(--arca-surface-2)]">
                  <th
                    className="px-3 py-1.5 text-right align-bottom border-l border-b border-[var(--arca-border)]"
                    rowSpan={2}
                  >
                    Acum. inicio
                  </th>
                  <th
                    className="px-3 py-1.5 text-right align-bottom border-b border-[var(--arca-border)]"
                    rowSpan={2}
                  >
                    Bajas
                  </th>
                  <th
                    className="px-3 py-1.5 text-center border-b border-[var(--arca-border)]"
                    colSpan={2}
                  >
                    Del ejercicio
                  </th>
                </tr>
                <tr className="text-[9.5px] uppercase tracking-wide bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)]">
                  <th className="px-3 py-1.5 text-right">%</th>
                  <th className="px-3 py-1.5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--arca-surface)]">
                {data.categories.map((cat) => (
                  <AnexoICategoryRows
                    key={cat.category}
                    cat={cat}
                    prior={data.prior}
                  />
                ))}
                <tr className="border-t-2 border-[var(--arca-ink-2)] font-semibold bg-[var(--arca-surface)]">
                  <td className="py-2.5 pl-4 whitespace-nowrap">
                    TOTAL GENERAL
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.valorInicio)}
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.altas)}
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.bajas)}
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.valorCierre)}
                  </td>
                  <td className={`${ANEXO_NUM_TD} ${ANEXO_GROUP_BORDER}`}>
                    {fmtMoney(data.grandTotals.accumStart)}
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.amortBajas)}
                  </td>
                  <td className={`${ANEXO_NUM_TD} text-[var(--arca-ink-3)]`}>
                    —
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.amortYear)}
                  </td>
                  <td className={`${ANEXO_NUM_TD} ${ANEXO_GROUP_BORDER}`}>
                    {fmtMoney(data.grandTotals.accumEnd)}
                  </td>
                  <td className={ANEXO_NUM_TD}>
                    {fmtMoney(data.grandTotals.residualEnd)}
                  </td>
                  {data.prior && (
                    <td
                      className={`${ANEXO_NUM_TD} pr-4 border-l border-[var(--arca-border)]`}
                    >
                      {fmtMoney(data.prior.grandTotals.residualEnd)}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </ArcaCard>

      {/* Sugerencia de asiento de amortización (US 4.2.2) */}
      {!readOnly && data && data.suggestion.lines.length > 0 && (
        <ArcaCard>
          <div className="px-4 py-3 border-b border-[var(--arca-border)] flex items-center gap-2">
            <Lightbulb
              className="w-4 h-4 text-[var(--arca-accent)]"
              strokeWidth={1.8}
            />
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Sugerencia de asiento de amortización del ejercicio
            </span>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-[var(--arca-ink-3)] mb-3">
              Cálculo sugerido para que lo cargues como asiento manual al
              cierre. El asiento no se genera automáticamente en esta versión.
            </p>
            <table className="w-full text-[12.5px] mb-3">
              <thead>
                <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  <th className="py-1.5">Cuenta</th>
                  <th className="py-1.5 text-right">Debe</th>
                  <th className="py-1.5 text-right">Haber</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--arca-surface)]">
                {data.suggestion.lines.map((l, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--arca-border)] last:border-0"
                  >
                    <td className="py-1.5">
                      <span className="text-[var(--arca-ink-3)]">{l.code}</span>{' '}
                      {l.name}
                    </td>
                    <td className="py-1.5 text-right tabular-nums [font-family:var(--ff-mono)]">
                      {l.side === 'debe' ? `$ ${fmtMoney(l.amount)}` : ''}
                    </td>
                    <td className="py-1.5 text-right tabular-nums [font-family:var(--ff-mono)]">
                      {l.side === 'haber' ? `$ ${fmtMoney(l.amount)}` : ''}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t border-[var(--arca-ink-3)]">
                  <td className="py-1.5 text-right">Total</td>
                  <td className="py-1.5 text-right tabular-nums [font-family:var(--ff-mono)]">
                    $ {fmtMoney(data.suggestion.total)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums [font-family:var(--ff-mono)]">
                    $ {fmtMoney(data.suggestion.total)}
                  </td>
                </tr>
              </tbody>
            </table>
            {canWrite && (
              <button
                onClick={copyToEditor}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" strokeWidth={2} />
                Copiar al editor de asientos
              </button>
            )}
          </div>
        </ArcaCard>
      )}

      {editor && (
        <AsientoEditor
          clientId={clientId}
          state={editor}
          postable={postable}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function AnexoICategoryRows({
  cat,
  prior,
}: {
  cat: Awaited<ReturnType<typeof getAnexoI>>['categories'][number];
  prior: Awaited<ReturnType<typeof getAnexoI>>['prior'];
}) {
  /** Un bien incorporado en el ejercicio no tenía neto al cierre anterior. */
  const priorAsset = (id: string) => prior?.residualByAsset[id] ?? 0;
  return (
    <>
      {/* La banda del rubro ocupa todo el ancho, así que como celda no tiene
          hacia dónde quedarse fija y se iba con el scroll: el clasificador se
          perdía justo cuando hace falta. Se congela el rótulo adentro, y la
          banda se saca de la columna fija para no arrastrar su borde al
          extremo derecho. */}
      <tr className="bg-[var(--arca-surface-2)]">
        <td
          className="py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--arca-ink-2)] static! shadow-none!"
          colSpan={prior ? 12 : 11}
        >
          <span className="sticky left-0 inline-block pl-4">
            {FIXED_ASSET_CATEGORY_LABELS[cat.category] ?? cat.category}
          </span>
        </td>
      </tr>
      {cat.assets.map((a) => (
        <tr
          key={a.id}
          className="border-b border-[var(--arca-border)] last:border-0 bg-[var(--arca-surface)] hover:bg-[var(--arca-surface-2)]"
        >
          <td className="py-2 pl-4 pr-3">
            {a.name}
            {a.disposed && (
              <span className="ml-1 text-[10px] text-[var(--arca-ink-3)]">
                (baja)
              </span>
            )}
          </td>
          <td className={ANEXO_NUM_TD}>{fmtMoney(a.valorInicio)}</td>
          <td className={ANEXO_NUM_TD}>{fmtMoney(a.altas)}</td>
          <td className={ANEXO_NUM_TD}>{fmtMoney(a.bajas)}</td>
          <td className={`${ANEXO_NUM_TD} font-medium`}>
            {fmtMoney(a.valorCierre)}
          </td>
          <td
            className={`${ANEXO_NUM_TD} text-[var(--arca-ink-3)] ${ANEXO_GROUP_BORDER}`}
          >
            {fmtMoney(a.accumStart)}
          </td>
          <td className={`${ANEXO_NUM_TD} text-[var(--arca-ink-3)]`}>
            {fmtMoney(a.amortBajas)}
          </td>
          <td className={`${ANEXO_NUM_TD} text-[var(--arca-ink-3)]`}>
            {a.rate ? `${fmtMoney(a.rate)}%` : '—'}
          </td>
          <td className={ANEXO_NUM_TD}>{fmtMoney(a.amortYear)}</td>
          <td
            className={`${ANEXO_NUM_TD} text-[var(--arca-ink-3)] ${ANEXO_GROUP_BORDER}`}
          >
            {fmtMoney(a.accumEnd)}
          </td>
          <td className={`${ANEXO_NUM_TD} pr-4 font-medium`}>
            {fmtMoney(a.residualEnd)}
          </td>
          {prior && (
            <td
              className={`${ANEXO_NUM_TD} pr-4 border-l border-[var(--arca-border)]`}
            >
              {fmtMoney(priorAsset(a.id))}
            </td>
          )}
        </tr>
      ))}
      <tr className="border-b border-[var(--arca-border)] font-medium bg-[var(--arca-surface-2)]">
        <td className="py-2 pl-4 pr-3 text-[var(--arca-ink-2)] whitespace-nowrap">
          Subtotal {FIXED_ASSET_CATEGORY_LABELS[cat.category] ?? cat.category}
        </td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.valorInicio)}</td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.altas)}</td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.bajas)}</td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.valorCierre)}</td>
        <td className={`${ANEXO_NUM_TD} ${ANEXO_GROUP_BORDER}`}>
          {fmtMoney(cat.totals.accumStart)}
        </td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.amortBajas)}</td>
        <td className={`${ANEXO_NUM_TD} text-[var(--arca-ink-3)]`}>—</td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.amortYear)}</td>
        <td className={`${ANEXO_NUM_TD} ${ANEXO_GROUP_BORDER}`}>
          {fmtMoney(cat.totals.accumEnd)}
        </td>
        <td className={ANEXO_NUM_TD}>{fmtMoney(cat.totals.residualEnd)}</td>
        {prior && (
          <td
            className={`${ANEXO_NUM_TD} pr-4 border-l border-[var(--arca-border)]`}
          >
            {fmtMoney(prior.residualByCategory[cat.category] ?? 0)}
          </td>
        )}
      </tr>
    </>
  );
}

/* ════════════════════ Estados Contables — ESP (US 6.1.x) ════════════════════ */

type FyOption = Awaited<ReturnType<typeof getFiscalYears>>[number];

function EstadosContables({
  clientId,
  clientName,
  clientCuit,
  isOwner,
}: {
  clientId: string;
  clientName: string;
  clientCuit: string;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<
    | 'esp'
    | 'er'
    | 'eepn'
    | 'efe'
    | 'nota3'
    | 'inventario'
    | 'cmv'
    | 'anexoI'
    | 'anexo'
    | 'notas'
    | 'informe'
    | 'orden'
    | 'export'
    | 'datos'
  >('esp');
  /**
   * Los EECC se presentan ajustados por inflación (RT 6). "Histórico" excluye el
   * asiento de ajuste y queda como papel de trabajo.
   */
  const [valuation, setValuation] = useState<'ajustado' | 'historico'>(
    'ajustado'
  );
  const [selectedFyId, setSelectedFyId] = useState('');

  const { data: fiscalYears = [], isLoading: cargandoEjercicios } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId = selectedFyId || defaultFiscalYearId(fiscalYears);
  const selectedFy = fiscalYears.find((y) => y.id === effectiveFyId);

  const { data: fs } = useQuery({
    queryKey: ['accounting', 'financial-statement', clientId, effectiveFyId],
    queryFn: () =>
      getFinancialStatement({
        data: { clientId, fiscalYearId: effectiveFyId },
      }),
    enabled: !!effectiveFyId,
  });
  const approved = fs?.status === 'aprobado';

  // La norma que se cita en los estados depende de la empresa: un ente pequeño
  // aplica RT 54 y el resto RT 6. El mecanismo del ajuste es el mismo.
  const { data: membreteEecc } = useQuery({
    queryKey: ['accounting', 'membrete', clientId],
    queryFn: () => getMembreteData({ data: { clientId } }),
  });
  const norma = frameworkCite(membreteEecc?.accountingFramework ?? 'rt54');

  /**
   * Referencia de cada rubro a su nota o su anexo, como en los balances del
   * estudio: «Caja y Bancos (Nota 3.1)», «Bienes de Uso (s/Anexo I)». La
   * subnumeración sale del orden en que la composición expone los rubros, así
   * que sigue sola al mover la nota.
   */
  const { data: espParaRefs } = useQuery({
    queryKey: ['accounting', 'esp', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getESP({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });
  /**
   * Referencias de cada rubro, resueltas de una vez: la pantalla las consulta
   * por rubro y los documentos necesitan el mapa entero.
   */
  const references = useMemo<Record<string, string>>(() => {
    if (!fs) return {};
    const secuencia = numberNotes(fs.layout, fs.notes, fs.sectionLabels);
    const grupos = (espParaRefs?.sections ?? [])
      .flatMap((sec) => sec.rubros)
      .filter((r) => r.group !== 'resultado_ejercicio')
      .filter((r) => Math.abs(r.current) >= 0.005 || Math.abs(r.prior) >= 0.005)
      .map((r) => r.group);
    const ctx = {
      composicionGroups: grupos,
      composicionNumber:
        secuencia.find((n) => n.entry === 'composicion')?.number ?? null,
      labels: fs.sectionLabels,
    };
    const out: Record<string, string> = {};
    for (const g of [...grupos, ...Object.keys(ANEXO_REFERENCE_BY_GROUP)]) {
      const r = referenceForGroup(g, ctx);
      if (r) out[g] = r;
    }
    return out;
  }, [fs, espParaRefs]);
  const refFor = (group: string): string | null => references[group] ?? null;

  const invalidateFs = () =>
    qc.invalidateQueries({
      queryKey: ['accounting', 'financial-statement', clientId, effectiveFyId],
    });

  const approveMut = useMutation({
    mutationFn: () =>
      approveFinancialStatement({
        data: { clientId, fiscalYearId: effectiveFyId },
      }),
    onSuccess: () => {
      toast.success('Estados Contables aprobados');
      invalidateFs();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al aprobar'),
  });
  const reopenMut = useMutation({
    mutationFn: () =>
      reopenFinancialStatement({
        data: { clientId, fiscalYearId: effectiveFyId },
      }),
    onSuccess: () => {
      toast.success('Reabierto a borrador');
      invalidateFs();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al reabrir'),
  });

  // Distinguir «todavía no llegó la lista» de «no hay ejercicios»: contra una
  // base remota la consulta tarda, y afirmar que no existe ninguno mientras
  // carga manda al usuario a crear un ejercicio que ya existe.
  if (cargandoEjercicios) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Cargando ejercicios…
        </div>
      </ArcaCard>
    );
  }

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Creá un ejercicio en la pestaña <strong>Ejercicios</strong> para
          generar los Estados Contables.
        </div>
      </ArcaCard>
    );
  }

  /**
   * Las secciones van agrupadas por el papel que cumplen en el balance: los
   * estados que se presentan, lo que los respalda, y lo que arma el documento.
   * El rótulo corto es el del sidebar; el largo, el que se lee al pasar por
   * encima y el que titula cada estado adentro.
   */
  const grupos: {
    grupo: string;
    items: { k: typeof view; label: string; title?: string }[];
  }[] = [
    {
      grupo: 'Estados',
      items: [
        {
          k: 'esp',
          label: 'Situación Patrimonial',
          title: 'Estado de Situación Patrimonial',
        },
        { k: 'er', label: 'Resultados', title: 'Estado de Resultados' },
        {
          k: 'eepn',
          label: 'Evolución del PN',
          title: 'Estado de Evolución del Patrimonio Neto',
        },
        {
          k: 'efe',
          label: 'Flujo de Efectivo',
          title: 'Estado de Flujo de Efectivo',
        },
      ],
    },
    {
      grupo: 'Notas y anexos',
      items: [
        { k: 'nota3', label: 'Composición de rubros' },
        { k: 'inventario', label: 'Inventario', title: 'Inventario al cierre' },
        { k: 'cmv', label: 'Costo de mercadería', title: 'Anexo — CMV' },
        { k: 'anexoI', label: 'Anexo I', title: 'Anexo I — Bienes de uso' },
        { k: 'anexo', label: 'Anexo II', title: 'Anexo II' },
        { k: 'notas', label: 'Notas' },
      ],
    },
    {
      grupo: 'Documento',
      items: [
        { k: 'datos', label: 'Datos iniciales' },
        { k: 'informe', label: 'Informe del auditor' },
        { k: 'orden', label: 'Orden del documento' },
        { k: 'export', label: 'Exportar' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {/* Sin card: es la barra de la pantalla, no una tarjeta de contenido. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-[var(--arca-ink-3)]">
          Ejercicio
        </span>
        <Select value={effectiveFyId} onValueChange={(v) => setSelectedFyId(v)}>
          <SelectTrigger size="sm" className="w-[180px] data-[size=sm]:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fiscalYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                N°{y.numero} ({y.estado === 'abierto' ? 'abierto' : 'cerrado'})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Segmentado del sistema. */}
        <div
          role="tablist"
          className="flex items-center gap-0.5 rounded-lg bg-[var(--arca-surface-2)] p-[3px]"
        >
          {(
            [
              ['ajustado', 'Ajustado por inflación'],
              ['historico', 'Valores históricos'],
            ] as ['ajustado' | 'historico', string][]
          ).map(([k, label]) => (
            <Tooltip key={k}>
              <TooltipTrigger asChild>
                <button
                  role="tab"
                  type="button"
                  aria-selected={valuation === k}
                  onClick={() => setValuation(k)}
                  className={cn(
                    'flex h-[26px] items-center rounded-md px-3 text-[12.5px] font-medium transition-colors duration-[120ms]',
                    valuation === k
                      ? 'bg-[var(--arca-surface)] text-[var(--arca-ink)] shadow-[0_1px_2px_rgba(16,23,32,0.08)]'
                      : 'text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]'
                  )}
                >
                  {label}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {k === 'ajustado'
                  ? `Incluye el asiento de ajuste por inflación (${norma}). Es como se presentan los EECC.`
                  : 'Excluye el asiento de ajuste. Queda como papel de trabajo.'}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {approved ? (
            <>
              <Badge variant="success" size="sm">
                <BadgeDot />
                Aprobado
                {fs?.approvedByName ? ` · ${fs.approvedByName}` : ''}
                {fs?.approvedAt
                  ? ` · ${new Date(fs.approvedAt).toLocaleDateString('es-AR')}`
                  : ''}
              </Badge>
              {isOwner && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopenMut.mutate()}
                      disabled={reopenMut.isPending}
                    >
                      Reabrir
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Vuelve el paquete a borrador para poder editarlo
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              <Badge variant="outline" size="sm">
                <BadgeDot />
                Borrador
              </Badge>
              {isOwner && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => approveMut.mutate()}
                      disabled={approveMut.isPending}
                    >
                      <Check className="size-3.5" strokeWidth={2.4} />
                      Aprobar EECC
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Cierra el paquete: queda como la versión presentada y deja
                    de editarse
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      {/* Índice del balance a la izquierda; el estado elegido, a la derecha. */}
      <div className="flex items-start gap-4">
        <nav className="w-[188px] shrink-0 sticky top-4">
          <ArcaCard>
            <div className="py-1.5">
              {/* El rótulo del grupo no es una opción más: va separado por una
                  línea, más chico y espaciado, y las opciones sangradas debajo.
                  Antes compartía sangrado y color con los ítems y solo se
                  descubría que no era clickeable al pasarle el cursor. */}
              {grupos.map(({ grupo, items }, i) => (
                <div
                  key={grupo}
                  className={
                    i > 0
                      ? 'pt-2 mt-2 border-t border-[var(--arca-border)]'
                      : 'pt-0.5'
                  }
                >
                  <div className="px-3 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--arca-ink-3)] cursor-default select-none">
                    {grupo}
                  </div>
                  {items.map(({ k, label, title }) => (
                    <button
                      key={k}
                      onClick={() => setView(k)}
                      title={title ?? label}
                      aria-current={view === k ? 'page' : undefined}
                      className="w-full text-left pl-5 pr-3 py-1 text-[12.5px] leading-[1.35] border-l-2 transition-colors"
                      style={{
                        borderColor:
                          view === k ? 'var(--arca-ink)' : 'transparent',
                        background:
                          view === k ? 'var(--arca-surface-2)' : 'transparent',
                        color:
                          view === k ? 'var(--arca-ink)' : 'var(--arca-ink-2)',
                        fontWeight: view === k ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </ArcaCard>
        </nav>

        {/* `min-w-0` para que las tablas anchas scrolleen en vez de estirar. */}
        <div className="flex-1 min-w-0 space-y-4">
          {view === 'esp' && (
            <EspView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              valuation={valuation}
              norma={norma}
              refFor={refFor}
            />
          )}
          {view === 'er' && (
            <ErView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              valuation={valuation}
              norma={norma}
              refFor={refFor}
            />
          )}
          {view === 'eepn' && (
            <EepnView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              valuation={valuation}
              norma={norma}
            />
          )}
          {view === 'efe' && (
            <EfeView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              valuation={valuation}
              norma={norma}
            />
          )}
          {view === 'nota3' && (
            <Nota3View
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              valuation={valuation}
              norma={norma}
            />
          )}
          {view === 'cmv' && (
            <AnexoCMVView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              canEdit={isOwner && !approved}
            />
          )}
          {view === 'inventario' && (
            <InventarioView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
              valuation={valuation}
              norma={norma}
            />
          )}
          {view === 'anexoI' && (
            <AnexoIView
              key={effectiveFyId}
              clientId={clientId}
              clientName={clientName}
              canWrite={false}
              fiscalYearId={effectiveFyId}
              readOnly
              conComparativo={anexoIMuestraComparativo(fs?.sectionLabels ?? {})}
            />
          )}
          {view === 'anexo' && (
            <AnexoIIView
              clientId={clientId}
              clientName={clientName}
              selectedFy={selectedFy}
            />
          )}
          {view === 'datos' && (
            <DatosInicialesView clientId={clientId} canEdit={isOwner} />
          )}

          {view === 'informe' &&
            (fs && selectedFy ? (
              <InformeAuditor
                key={effectiveFyId}
                clientId={clientId}
                fiscalYearId={effectiveFyId}
                saved={fs.auditReport}
                canEdit={isOwner && !approved}
                onSaved={invalidateFs}
                vars={{
                  empresa: clientName,
                  cuit: clientCuit,
                  domicilio: membreteEecc?.domicilio ?? '',
                  cierre: fechaLarga(new Date(selectedFy.fechaHasta)),
                  ejercicio: String(selectedFy.numero),
                  notas: rangoNotas(fs.notes.length),
                  anexos: rangoAnexos(3),
                  destinatario: 'Señores Socios',
                  inicio: fechaLarga(new Date(selectedFy.fechaDesde)),
                  constitucion: membreteEecc?.fechaConstitucion
                    ? fechaLarga(new Date(membreteEecc.fechaConstitucion))
                    : '',
                  igj: membreteEecc?.numeroInscripcion ?? '',
                  ...variablesDelBalance(espParaRefs),
                  contador: membreteEecc?.accountant?.nombre ?? '',
                  matricula: [
                    membreteEecc?.accountant?.tomo &&
                      `Tomo ${membreteEecc.accountant.tomo}`,
                    membreteEecc?.accountant?.folio &&
                      `Folio ${membreteEecc.accountant.folio}`,
                    membreteEecc?.accountant?.consejo,
                  ]
                    .filter(Boolean)
                    .join(' '),
                }}
              />
            ) : null)}

          {view === 'orden' &&
            (fs ? (
              <OrdenDocumento
                key={effectiveFyId}
                clientId={clientId}
                fiscalYearId={effectiveFyId}
                notes={fs.notes}
                layout={fs.layout}
                sectionLabels={fs.sectionLabels}
                canEdit={isOwner && !approved}
                onSaved={invalidateFs}
              />
            ) : null)}

          {view === 'notas' &&
            (fs ? (
              <NotesEditor
                key={effectiveFyId}
                clientId={clientId}
                fiscalYearId={effectiveFyId}
                notes={fs.notes}
                layout={fs.layout}
                sectionLabels={fs.sectionLabels}
                approved={approved}
                canEdit={isOwner}
                onSaved={invalidateFs}
                clientName={clientName}
                vars={
                  selectedFy
                    ? {
                        empresa: clientName,
                        cuit: clientCuit,
                        domicilio: membreteEecc?.domicilio ?? '',
                        cierre: fechaLarga(new Date(selectedFy.fechaHasta)),
                        ejercicio: String(selectedFy.numero),
                        notas: rangoNotas(fs.notes.length),
                        anexos: rangoAnexos(3),
                        destinatario: 'Señores Socios',
                        inicio: fechaLarga(new Date(selectedFy.fechaDesde)),
                        constitucion: membreteEecc?.fechaConstitucion
                          ? fechaLarga(new Date(membreteEecc.fechaConstitucion))
                          : '',
                        igj: membreteEecc?.numeroInscripcion ?? '',
                        ...variablesDelBalance(espParaRefs),
                        contador: membreteEecc?.accountant?.nombre ?? '',
                        matricula: [
                          membreteEecc?.accountant?.tomo &&
                            `Tomo ${membreteEecc.accountant.tomo}`,
                          membreteEecc?.accountant?.folio &&
                            `Folio ${membreteEecc.accountant.folio}`,
                          membreteEecc?.accountant?.consejo,
                        ]
                          .filter(Boolean)
                          .join(' '),
                      }
                    : {}
                }
              />
            ) : (
              <ArcaCard>
                <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
                  Cargando…
                </div>
              </ArcaCard>
            ))}

          {view === 'export' && (
            <ExportView
              clientId={clientId}
              clientName={clientName}
              clientCuit={clientCuit}
              selectedFy={selectedFy}
              notes={fs?.notes ?? []}
              layout={fs?.layout ?? []}
              sectionLabels={fs?.sectionLabels ?? {}}
              auditReport={fs?.auditReport ?? null}
              references={references}
              isOwner={isOwner}
              valuation={valuation}
              norma={norma}
              pdfGeneratedAt={fs?.pdfGeneratedAt ?? null}
              pdfGeneratedByName={fs?.pdfGeneratedByName ?? null}
              onPdfSaved={invalidateFs}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EspView({
  clientId,
  clientName,
  selectedFy,
  valuation,
  norma,
  refFor,
}: {
  /** Referencia a la nota o al anexo de cada rubro. */
  refFor?: (group: string) => string | null;
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<LedgerDrill | null>(null);

  const effectiveFyId = selectedFy?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'esp', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getESP({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });

  const toggle = (g: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const openLedger = (a: { accountId: string; code: string; name: string }) => {
    if (!selectedFy) return;
    setDrill({
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      from: new Date(selectedFy.fechaDesde).toISOString().slice(0, 10),
      to: new Date(selectedFy.fechaHasta).toISOString().slice(0, 10),
    });
  };

  const macros: { macro: 'activo' | 'pasivo' | 'pn'; title: string }[] = [
    { macro: 'activo', title: 'ACTIVO' },
    { macro: 'pasivo', title: 'PASIVO' },
    { macro: 'pn', title: 'PATRIMONIO NETO' },
  ];

  return (
    <div className="space-y-4">
      <ArcaCard>
        {/* Carátula */}
        <div className="px-5 pt-4">
          <div className="text-[15px] font-semibold text-[var(--arca-ink)]">
            {clientName}
          </div>
          <div className="text-[12.5px] text-[var(--arca-ink-2)]">
            Estado de Situación Patrimonial
            {data
              ? ` · Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`
              : ''}
          </div>
          {/* Sin itálica: en el sistema la aclaración es 11.5px en `ink-4`,
            como el "Últ. actualización" de las fichas. Y cuando lo que dice
            es que falta generar el ajuste, es un aviso: va en ámbar. */}
          <div
            className={cn(
              'mt-0.5 text-[11.5px]',
              valuation === 'ajustado' && !data?.inflationApplied
                ? 'text-[var(--arca-accent-warn-fg)]'
                : 'text-[var(--arca-ink-4)]'
            )}
          >
            {valuation === 'historico'
              ? 'Expresado en valores históricos, sin ajuste por inflación. Papel de trabajo.'
              : data?.inflationApplied
                ? `Expresado en moneda homogénea de cierre (ajuste por inflación · ${norma}).`
                : 'El ajuste por inflación del ejercicio todavía no está generado: los importes son históricos. Generalo en la solapa «Ajuste por inflación».'}
          </div>
        </div>

        {isLoading || !data ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Calculando…
          </div>
        ) : (
          <div className="px-2 py-3">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  <th className="py-2 pl-3 text-left">Rubro</th>
                  <th className="py-2 pr-3 text-right w-40">
                    Ej. N°{data.fiscalYearNumber}
                  </th>
                  <th className="py-2 pr-3 text-right w-40">
                    {data.hasPrior
                      ? `Ej. N°${data.priorFiscalYearNumber}`
                      : 'Anterior'}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[var(--arca-surface)]">
                {macros.map(({ macro, title }) => {
                  const secs = data.sections.filter((s) => s.macro === macro);
                  const totalCur = secs.reduce((s, x) => s + x.current, 0);
                  const totalPri = secs.reduce((s, x) => s + x.prior, 0);
                  return (
                    <Fragment key={macro}>
                      <tr className="bg-[var(--arca-surface-2)]">
                        <td className="py-1.5 pl-3 font-semibold text-[var(--arca-ink)] uppercase text-[11px] tracking-wide">
                          {title}
                        </td>
                        <td />
                        <td />
                      </tr>
                      {secs.map((sec) => (
                        <EspSectionRows
                          key={sec.key}
                          section={sec}
                          hasPrior={data.hasPrior}
                          expanded={expanded}
                          onToggle={toggle}
                          onAccount={openLedger}
                          refFor={refFor ?? (() => null)}
                        />
                      ))}
                      <tr className="border-t border-[var(--arca-ink-3)] font-semibold">
                        <td className="py-1.5 pl-3">
                          Total {title.toLowerCase()}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                          $ {fmtMoney(totalCur)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                          {data.hasPrior ? `$ ${fmtMoney(totalPri)}` : '—'}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-[var(--arca-ink)] font-bold">
                  <td className="py-2 pl-3">TOTAL PASIVO + PATRIMONIO NETO</td>
                  <td className="py-2 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                    $ {fmtMoney(data.totals.pasivoMasPn.current)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                    {data.hasPrior
                      ? `$ ${fmtMoney(data.totals.pasivoMasPn.prior)}`
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Validación A = P + PN */}
            <div className="px-3 mt-3">
              {data.balancedCurrent ? (
                <NotaCuadre cuadra>
                  Activo = Pasivo + Patrimonio Neto ($
                  {fmtMoney(data.totals.activo.current)})
                </NotaCuadre>
              ) : (
                <NotaCuadre cuadra={false}>
                  No cuadra: Activo $ {fmtMoney(data.totals.activo.current)} ≠
                  Pasivo + PN $ {fmtMoney(data.totals.pasivoMasPn.current)}. La
                  emisión está bloqueada hasta corregir.
                </NotaCuadre>
              )}
              <div className="mt-1">
                <PriorNotAdjustedNote
                  hasPrior={data.hasPrior}
                  priorInflationApplied={data.priorInflationApplied}
                  valuation={valuation}
                />
              </div>
            </div>
          </div>
        )}
      </ArcaCard>

      {drill && (
        <LedgerDialog
          clientId={clientId}
          drill={drill}
          canWrite={false}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function EspSectionRows({
  section,
  hasPrior,
  expanded,
  onToggle,
  onAccount,
  refFor,
}: {
  /** Referencia a la nota o al anexo de cada rubro, como en el balance. */
  refFor: (group: string) => string | null;
  section: EspSection;
  hasPrior: boolean;
  expanded: Set<string>;
  onToggle: (g: string) => void;
  onAccount: (a: { accountId: string; code: string; name: string }) => void;
}) {
  // Subtítulo de sección (Corriente / No Corriente) salvo en PN.
  const sub =
    section.macro === 'pn'
      ? null
      : section.label.replace('Activo ', '').replace('Pasivo ', '');
  return (
    <>
      {sub && (
        <tr>
          <td
            className="py-1 pl-5 text-[11px] font-medium text-[var(--arca-ink-2)]"
            colSpan={3}
          >
            {sub}
          </td>
        </tr>
      )}
      {section.rubros.map((rubro: EspRubro) => {
        const isOpen = expanded.has(rubro.group);
        return (
          <Fragment key={rubro.group}>
            <tr
              className="hover:bg-[var(--arca-surface-2)] cursor-pointer"
              onClick={() => onToggle(rubro.group)}
            >
              <td className="py-1.5 pl-7 text-[var(--arca-ink)]">
                <span className="text-[var(--arca-ink-3)] mr-1">
                  {isOpen ? '▾' : '▸'}
                </span>
                {rubro.label}
                {refFor(rubro.group) && (
                  <span className="ml-1.5 text-[11px] text-[var(--arca-ink-3)]">
                    ({refFor(rubro.group)})
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                $ {fmtMoney(rubro.current)}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                {hasPrior ? `$ ${fmtMoney(rubro.prior)}` : '—'}
              </td>
            </tr>
            {isOpen &&
              rubro.accounts.map((a) => (
                <tr
                  key={a.accountId}
                  className="text-[11.5px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] cursor-pointer"
                  onClick={() => onAccount(a)}
                  title="Ver mayor de la cuenta"
                >
                  <td className="py-1 pl-12">
                    <span className="text-[var(--arca-ink-3)]">{a.code}</span>{' '}
                    {a.name}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                    $ {fmtMoney(a.current)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                    {hasPrior ? `$ ${fmtMoney(a.prior)}` : '—'}
                  </td>
                </tr>
              ))}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Estado de Evolución del Patrimonio Neto.
 *
 * Una columna por cuenta de PN, agrupadas por rubro, y filas por causa de
 * variación (modelo RT 9). La reexpresión del patrimonio inicial se expone
 * dentro de "Saldos al inicio", no como movimiento del ejercicio, y el Capital
 * social queda a valor nominal con su ajuste en Ajuste de capital.
 */
/**
 * Estado de Flujo de Efectivo, método directo.
 *
 * Explica la variación del efectivo del ejercicio agrupando las causas por
 * actividad. En la vista ajustada, la línea de RECPAM del efectivo es la que
 * cierra el estado: es la pérdida de poder adquisitivo por haber mantenido
 * efectivo, y sin ella los flujos reexpresados no llegan a la variación real.
 */
/**
 * Nota 3 — Composición de los principales rubros.
 *
 * Es el detalle por cuenta de cada rubro del ESP, comparativo. Se arma con los
 * mismos datos del Estado de Situación Patrimonial, así que no puede diferir de
 * él: si un rubro cambia, la nota cambia sola.
 */
/**
 * Inventario al cierre, en el formato de cuatro columnas del balance.
 *
 * Cada nivel de la jerarquía coloca su importe una columna más a la derecha:
 * las cuentas imputables en la primera, el rubro en la segunda, el subtotal de
 * la sección —corriente / no corriente— en la tercera y los totales mayores en
 * la cuarta. Es la disposición del inventario que presenta el estudio.
 */
function InventarioView({
  clientId,
  clientName,
  selectedFy,
  valuation,
  norma,
}: {
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
}) {
  const effectiveFyId = selectedFy?.id ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'esp', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getESP({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });

  if (isLoading || !data) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          {isLoading ? 'Calculando…' : 'Sin datos para este ejercicio.'}
        </div>
      </ArcaCard>
    );
  }

  const macros = [
    { macro: 'activo' as const, title: 'Activo', total: data.totals.activo },
    { macro: 'pasivo' as const, title: 'Pasivo', total: data.totals.pasivo },
    { macro: 'pn' as const, title: 'Patrimonio Neto', total: data.totals.pn },
  ];

  return (
    <ArcaCard>
      <div className="px-5 pt-4 pb-3 border-b border-[var(--arca-border)]">
        <div className="text-[14px] font-semibold text-[var(--arca-ink)]">
          {clientName}
        </div>
        <div className="text-[12px] text-[var(--arca-ink-3)]">
          Inventario al cierre · Ejercicio N°{data.fiscalYearNumber} ·{' '}
          {data.periodLabel}
        </div>
        <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
          {valuation === 'ajustado'
            ? `Expresado en moneda homogénea de cierre (ajuste por inflación · ${norma}).`
            : 'Expresado en valores históricos, sin ajuste por inflación. Papel de trabajo.'}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`w-full text-[12.5px] min-w-[720px] ${COL_FIJA}`}>
          <thead>
            <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
              <th className="text-left font-semibold px-4 py-1.5">Conceptos</th>
              {[1, 2, 3, 4].map((n) => (
                <th
                  key={n}
                  className="text-right font-semibold px-3 py-1.5 w-36 border-l border-[var(--arca-border)]"
                >
                  $
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[var(--arca-surface)]">
            {macros.map(({ macro, title, total }) => {
              const secs = data.sections.filter((s) => s.macro === macro);
              if (secs.every((s) => s.rubros.length === 0)) return null;
              return (
                <Fragment key={macro}>
                  <InventarioRow label={title} bold />
                  {secs.map((sec) => (
                    <Fragment key={sec.key}>
                      {/* En el PN la sección se llama igual que el macro: no
                          hace falta repetirlo. */}
                      {sec.label !== title && (
                        <InventarioRow label={sec.label} indent={1} />
                      )}
                      {sec.rubros.map((r) => (
                        <Fragment key={r.group}>
                          <InventarioRow
                            label={r.label}
                            indent={2}
                            col={2}
                            amount={r.current}
                          />
                          {r.accounts.map((a) => (
                            <InventarioRow
                              key={a.accountId}
                              label={a.name}
                              code={a.code}
                              indent={3}
                              col={1}
                              amount={a.current}
                            />
                          ))}
                        </Fragment>
                      ))}
                      {/* Una sección sin rubros no aporta un subtotal en cero. */}
                      {sec.rubros.length > 0 && sec.label !== title && (
                        <InventarioRow
                          label={`Total ${sec.label}`}
                          indent={1}
                          col={3}
                          amount={sec.current}
                        />
                      )}
                    </Fragment>
                  ))}
                  <InventarioRow
                    label={`Total ${title}`}
                    bold
                    col={4}
                    amount={total.current}
                  />
                </Fragment>
              );
            })}
            <InventarioRow
              label="Total Pasivo + Patrimonio Neto"
              bold
              col={4}
              amount={data.totals.pasivoMasPn.current}
              topBorder
            />
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-[var(--arca-border)] text-[11.5px] text-[var(--arca-ink-3)]">
        Es el detalle que sale en el Libro Inventarios y Balances, en Exportar.
      </div>
    </ArcaCard>
  );
}

/** Una fila del inventario: el importe cae en la columna de su nivel. */
function InventarioRow({
  label,
  code,
  amount,
  col,
  indent = 0,
  bold = false,
  topBorder = false,
}: {
  label: string;
  code?: string;
  amount?: number;
  /** 1 = cuenta, 2 = rubro, 3 = sección, 4 = total mayor. */
  col?: 1 | 2 | 3 | 4;
  indent?: 0 | 1 | 2 | 3;
  bold?: boolean;
  topBorder?: boolean;
}) {
  const pad = ['pl-4', 'pl-7', 'pl-10', 'pl-14'][indent];
  return (
    <tr
      className={`border-t border-[var(--arca-border)] bg-[var(--arca-surface)] ${
        topBorder ? 'border-t-2 border-t-[var(--arca-ink-2)]' : ''
      }`}
    >
      <td
        className={`${pad} py-1 text-[var(--arca-ink)]`}
        style={bold ? { fontWeight: 600 } : undefined}
      >
        {code && (
          <span className="text-[var(--arca-ink-3)] tabular-nums mr-1.5 text-[11px]">
            {code}
          </span>
        )}
        {label}
      </td>
      {([1, 2, 3, 4] as const).map((n) => (
        <td
          key={n}
          className="px-3 py-1 text-right tabular-nums border-l border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          style={bold ? { fontWeight: 600 } : undefined}
        >
          {col === n && amount !== undefined ? fmtMoney(amount) : ''}
        </td>
      ))}
    </tr>
  );
}

function Nota3View({
  clientId,
  clientName,
  selectedFy,
  valuation,
  norma,
}: {
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
}) {
  const effectiveFyId = selectedFy?.id ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'esp', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getESP({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });

  const money = (n: number) =>
    n.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (isLoading || !data) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          {effectiveFyId ? 'Calculando…' : 'Seleccioná un ejercicio.'}
        </div>
      </ArcaCard>
    );
  }

  // Se numeran 3.1, 3.2, … solo los rubros con saldo, en el orden del ESP. El
  // rubro "Resultado del ejercicio" no se detalla acá: su composición es el
  // Estado de Resultados y el Anexo II.
  const rubros = data.sections
    .flatMap((sec) => sec.rubros.map((r) => ({ ...r, section: sec.label })))
    .filter((r) => r.group !== 'resultado_ejercicio')
    .filter((r) => Math.abs(r.current) >= 0.005 || Math.abs(r.prior) >= 0.005);

  return (
    <ArcaCard>
      <div className="px-5 pt-4 pb-3 border-b border-[var(--arca-border)]">
        <div className="text-[14px] font-semibold text-[var(--arca-ink)]">
          {clientName}
        </div>
        <div className="text-[12px] text-[var(--arca-ink-3)]">
          Nota 3 · Composición de los principales rubros · Ejercicio N°
          {data.fiscalYearNumber} · {data.periodLabel}
        </div>
        <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
          {valuation === 'ajustado'
            ? `Valores ajustados por inflación (${norma}), en moneda homogénea de cierre.`
            : 'Valores históricos, sin ajuste por inflación. Papel de trabajo.'}
        </div>
      </div>

      {rubros.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          El ejercicio no tiene rubros con saldo.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[52px_1fr_170px_170px] gap-3 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[11px] font-semibold">
            <div>Nota</div>
            <div>Concepto</div>
            <div className="text-right">Ej. N°{data.fiscalYearNumber}</div>
            <div className="text-right">
              {data.priorFiscalYearNumber !== null
                ? `Ej. N°${data.priorFiscalYearNumber}`
                : 'Anterior'}
            </div>
          </div>

          {rubros.map((r, i) => (
            <div key={r.group}>
              <div className="grid grid-cols-[52px_1fr_170px_170px] gap-3 px-5 pt-3 pb-1 text-[12.5px]">
                <div className="tabular-nums text-[var(--arca-ink-3)]">
                  3.{i + 1}
                </div>
                <div className="font-semibold text-[var(--arca-ink)]">
                  {r.label}
                </div>
                <div />
                <div />
              </div>
              {r.accounts.map((a) => (
                <div
                  key={a.accountId}
                  className="grid grid-cols-[52px_1fr_170px_170px] gap-3 px-5 py-1 text-[12.5px]"
                >
                  <div />
                  <div className="text-[var(--arca-ink-2)] pl-3">{a.name}</div>
                  <div className="text-right tabular-nums text-[var(--arca-ink-2)]">
                    {money(a.current)}
                  </div>
                  <div className="text-right tabular-nums text-[var(--arca-ink-3)]">
                    {data.hasPrior ? money(a.prior) : '—'}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[52px_1fr_170px_170px] gap-3 px-5 py-1.5 border-b border-[var(--arca-border)] text-[12.5px] font-semibold">
                <div />
                <div />
                <div className="text-right tabular-nums border-t border-[var(--arca-ink-3)] pt-1">
                  {money(r.current)}
                </div>
                <div className="text-right tabular-nums border-t border-[var(--arca-ink-3)] pt-1 text-[var(--arca-ink-3)]">
                  {data.hasPrior ? money(r.prior) : '—'}
                </div>
              </div>
            </div>
          ))}

          <div className="px-5 py-3 text-[11.5px] text-[var(--arca-ink-3)]">
            La nota se arma con el detalle por cuenta del Estado de Situación
            Patrimonial, así que siempre coincide con él.
            {data.hasPrior && data.priorCoefficient !== null && (
              <>
                {' '}
                La columna del ejercicio anterior está reexpresada a moneda de
                cierre con coeficiente{' '}
                {data.priorCoefficient.toLocaleString('es-AR', {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}
                .
              </>
            )}
          </div>
        </>
      )}
    </ArcaCard>
  );
}

/** Fila del EFE: concepto a la izquierda, ejercicio actual y anterior a la derecha. */
/**
 * Aviso cuando el ejercicio anterior no tiene su propio ajuste aplicado: sus
 * cifras están en moneda heterogénea y multiplicarlas por un coeficiente no las
 * homogeneiza. El comparativo sirve de referencia, pero no es exacto.
 */
/**
 * La línea de cuadre al pie de un estado: "✓ cuadra" / "✗ no cuadra".
 *
 * Existía cuatro veces con tres formas distintas: dos usaban los tokens
 * `-fg` —los que llegan a contraste sobre blanco— y las otras dos el color
 * del punto (`--arca-accent-pos` / `--arca-accent-neg`), que es el del
 * indicador y no el del texto.
 */
function NotaCuadre({
  cuadra,
  children,
}: {
  cuadra: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-1.5 text-[12px]',
        cuadra
          ? 'text-[var(--arca-accent-pos-fg)]'
          : 'font-medium text-[var(--arca-accent-neg-fg)]'
      )}
    >
      {cuadra ? (
        <Check className="mt-px size-3.5 shrink-0" strokeWidth={2.4} />
      ) : (
        <X className="mt-px size-3.5 shrink-0" strokeWidth={2.4} />
      )}
      <span>{children}</span>
    </div>
  );
}

function PriorNotAdjustedNote({
  hasPrior,
  priorInflationApplied,
  valuation,
}: {
  hasPrior: boolean;
  priorInflationApplied: boolean;
  valuation: 'ajustado' | 'historico';
}) {
  if (!hasPrior || priorInflationApplied || valuation !== 'ajustado') {
    return null;
  }
  return (
    <div className="text-[11.5px] text-[var(--arca-accent-warn-fg)]">
      El ejercicio anterior no tiene su ajuste por inflación generado, así que
      la columna comparativa parte de valores históricos. Generá el ajuste de
      ese ejercicio para que el comparativo sea exacto.
    </div>
  );
}

function EfeRow({
  label,
  value,
  strong,
  indent,
  hasPrior,
}: {
  label: string;
  value: { current: number; prior: number };
  strong?: boolean;
  indent?: boolean;
  hasPrior: boolean;
}) {
  const fmt = (n: number) =>
    n.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return (
    <div
      className="grid grid-cols-[1fr_170px_170px] gap-4 px-5 py-1.5 border-b border-[var(--arca-border)] last:border-b-0"
      style={strong ? { background: 'var(--arca-surface-2)' } : undefined}
    >
      <span
        className="text-[12.5px] text-[var(--arca-ink)]"
        style={{
          fontWeight: strong ? 600 : 400,
          paddingLeft: indent ? 14 : 0,
        }}
      >
        {label}
      </span>
      <span
        className="text-[12.5px] tabular-nums text-right text-[var(--arca-ink)]"
        style={{ fontWeight: strong ? 600 : 400 }}
      >
        $ {fmt(value.current)}
      </span>
      <span
        className="text-[12.5px] tabular-nums text-right text-[var(--arca-ink-3)]"
        style={{ fontWeight: strong ? 600 : 400 }}
      >
        {hasPrior ? `$ ${fmt(value.prior)}` : '—'}
      </span>
    </div>
  );
}

function EfeView({
  clientId,
  clientName,
  selectedFy,
  valuation,
  norma,
}: {
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
}) {
  const effectiveFyId = selectedFy?.id ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'efe', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getEFE({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });

  const money = (n: number) =>
    n.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (isLoading || !data) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          {effectiveFyId ? 'Calculando…' : 'Seleccioná un ejercicio.'}
        </div>
      </ArcaCard>
    );
  }

  return (
    <ArcaCard>
      <div className="px-5 pt-4 pb-3 border-b border-[var(--arca-border)]">
        <div className="text-[14px] font-semibold text-[var(--arca-ink)]">
          {clientName}
        </div>
        <div className="text-[12px] text-[var(--arca-ink-3)]">
          Estado de Flujo de Efectivo y sus Equivalentes · Método directo, forma
          completa · Ejercicio N°
          {data.fiscalYearNumber} · {data.periodLabel}
        </div>
        <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
          {valuation === 'ajustado'
            ? `Expresado en moneda homogénea de cierre (ajuste por inflación · ${norma}).`
            : 'Expresado en valores históricos, sin ajuste por inflación. Papel de trabajo.'}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_170px_170px] gap-4 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[11px] font-semibold">
        <div>Concepto</div>
        <div className="text-right">Ej. N°{data.fiscalYearNumber}</div>
        <div className="text-right">
          {data.priorFiscalYearNumber !== null
            ? `Ej. N°${data.priorFiscalYearNumber}`
            : 'Anterior'}
        </div>
      </div>

      <EfeRow
        label="Efectivo al inicio del ejercicio"
        value={data.efectivoInicio}
        hasPrior={data.hasPrior}
      />
      <EfeRow
        label="Efectivo al cierre del ejercicio"
        value={data.efectivoCierre}
        hasPrior={data.hasPrior}
      />
      <EfeRow
        label="Aumento (disminución) neto del efectivo"
        value={data.variacion}
        strong
        hasPrior={data.hasPrior}
      />

      <div className="px-5 py-2 text-[10.5px] uppercase tracking-wide font-semibold bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] border-y border-[var(--arca-border)] text-white">
        Causas de las variaciones del efectivo
      </div>

      {data.activities.map((a) => (
        <div key={a.key}>
          <div className="px-5 pt-2.5 pb-1 text-[11.5px] font-semibold text-[var(--arca-ink-2)]">
            {a.label}
          </div>
          {a.lines.length === 0 ? (
            <div className="px-5 pb-1.5 pl-[34px] text-[12px] text-[var(--arca-ink-3)] italic">
              Sin movimientos
            </div>
          ) : (
            a.lines.map((l) => (
              <EfeRow
                key={l.accountId}
                label={l.name}
                value={l}
                indent
                hasPrior={data.hasPrior}
              />
            ))
          )}
          <EfeRow
            label={`Flujo neto de ${a.label.toLowerCase()}`}
            value={a}
            strong
            hasPrior={data.hasPrior}
          />
        </div>
      ))}

      <EfeRow
        label="Total de las variaciones del efectivo"
        value={data.totalCausas}
        strong
        hasPrior={data.hasPrior}
      />

      <div className="px-5 py-3 border-t border-[var(--arca-border)] space-y-1">
        <NotaCuadre cuadra={data.cuadra}>
          {data.cuadra
            ? 'Las causas explican la variación del efectivo.'
            : `Las causas ($ ${money(data.totalCausas.current)}) no explican la variación ($ ${money(data.variacion.current)}).`}
        </NotaCuadre>
        {valuation === 'ajustado' && data.coeficienteInicio !== null && (
          <div className="text-[11.5px] text-[var(--arca-ink-3)]">
            El efectivo al inicio se reexpresó con coeficiente{' '}
            {data.coeficienteInicio.toLocaleString('es-AR', {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            })}
            : $ {money(data.efectivoInicioHistorico)} históricos → ${' '}
            {money(data.efectivoInicio.current)}.
          </div>
        )}
        {valuation === 'ajustado' && !data.inflationApplied && (
          <div className="text-[11.5px] text-[var(--arca-accent-warn-fg)]">
            El ajuste por inflación del ejercicio todavía no está generado, así
            que los flujos son históricos.
          </div>
        )}
        <PriorNotAdjustedNote
          hasPrior={data.hasPrior}
          priorInflationApplied={data.priorInflationApplied}
          valuation={valuation}
        />
        {data.sinActividad.length > 0 && (
          <div className="text-[11.5px] text-[var(--arca-accent-warn-fg)]">
            {data.sinActividad.length} cuenta(s) sin actividad asignada; se usó
            la clasificación por defecto del rubro:{' '}
            {data.sinActividad
              .slice(0, 6)
              .map((a) => a.code)
              .join(', ')}
            {data.sinActividad.length > 6 && '…'}
          </div>
        )}
      </div>
    </ArcaCard>
  );
}

function EepnView({
  clientId,
  clientName,
  selectedFy,
  valuation,
  norma,
}: {
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
}) {
  const effectiveFyId = selectedFy?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'eepn', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getEEPN({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });

  const money = (n: number) =>
    n === 0
      ? '—'
      : n.toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  if (isLoading || !data) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          {effectiveFyId ? 'Calculando…' : 'Seleccioná un ejercicio.'}
        </div>
      </ArcaCard>
    );
  }

  if (data.columns.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          El ejercicio no tiene movimientos en cuentas de patrimonio neto.
        </div>
      </ArcaCard>
    );
  }

  // La columna del ejercicio anterior solo tiene valor en las tres filas que el
  // modelo RT 9 expone: inicio, resultado y cierre.
  const priorFor = (kind: EepnRow['kind']) => {
    if (!data.prior) return 0;
    if (kind === 'inicio') return data.prior.inicio;
    if (kind === 'resultado') return data.prior.resultado;
    if (kind === 'cierre') return data.prior.cierre;
    return 0;
  };

  // Cabecera en dos niveles: rubro y, debajo, la cuenta.
  const groups: { label: string; span: number }[] = [];
  for (const c of data.columns) {
    const last = groups[groups.length - 1];
    if (last?.label === c.groupLabel) last.span++;
    else groups.push({ label: c.groupLabel, span: 1 });
  }

  return (
    <ArcaCard>
      <div className="px-5 pt-4 pb-3 border-b border-[var(--arca-border)]">
        <div className="text-[14px] font-semibold text-[var(--arca-ink)]">
          {clientName}
        </div>
        <div className="text-[12px] text-[var(--arca-ink-3)]">
          Estado de Evolución del Patrimonio Neto · Ejercicio N°
          {data.fiscalYearNumber} · {data.periodLabel}
        </div>
        <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
          {valuation === 'ajustado'
            ? `Expresado en moneda homogénea de cierre (ajuste por inflación · ${norma}). La reexpresión del patrimonio inicial se incluye en «Saldos al inicio»; el Capital social se mantiene a valor nominal.`
            : 'Expresado en valores históricos, sin ajuste por inflación. Papel de trabajo.'}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`w-full text-[12.5px] min-w-[720px] ${COL_FIJA}`}>
          <thead>
            <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
              <th className="text-left font-semibold px-4 py-1.5" rowSpan={2}>
                Concepto
              </th>
              {groups.map((g, i) => (
                <th
                  key={`${g.label}-${i}`}
                  colSpan={g.span}
                  className="text-center font-semibold px-3 py-1.5 border-l border-[var(--arca-border)]"
                >
                  {g.label}
                </th>
              ))}
              <th
                className="text-right font-semibold px-4 py-1.5 border-l border-[var(--arca-border)]"
                rowSpan={2}
              >
                Total ej. N°{data.fiscalYearNumber}
              </th>
              {data.priorFiscalYearNumber !== null && (
                <th
                  className="text-right font-semibold px-4 py-1.5 border-l border-[var(--arca-border)]"
                  rowSpan={2}
                >
                  Total ej. N°{data.priorFiscalYearNumber}
                </th>
              )}
            </tr>
            <tr className="bg-[var(--arca-surface-2)] text-[10.5px]">
              {data.columns.map((c) => (
                <th
                  key={c.accountId}
                  className={`text-right px-3 pb-1.5 border-l border-[var(--arca-border)] whitespace-nowrap ${
                    c.isSubtotal ? 'font-semibold' : 'font-medium'
                  }`}
                  title={c.isSubtotal ? c.groupLabel : `${c.code} · ${c.name}`}
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[var(--arca-surface)]">
            {data.rows.map((row) => {
              const strong = row.kind === 'inicio' || row.kind === 'cierre';
              return (
                <tr
                  key={row.key}
                  className="border-t border-[var(--arca-border)]"
                  style={{
                    // Opaco siempre: la columna fija hereda este fondo.
                    background: strong
                      ? 'var(--arca-surface-2)'
                      : 'var(--arca-surface)',
                  }}
                >
                  <td
                    className="px-4 py-1.5 text-[var(--arca-ink)]"
                    style={strong ? { fontWeight: 600 } : undefined}
                  >
                    {row.label}
                    {row.entryNumber !== undefined && (
                      <span className="ml-1.5 text-[10.5px] text-[var(--arca-ink-3)]">
                        · asiento N°{row.entryNumber}
                      </span>
                    )}
                  </td>
                  {data.columns.map((c) => (
                    <td
                      key={c.accountId}
                      className="px-3 py-1.5 text-right tabular-nums border-l border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                      style={
                        c.isSubtotal || strong ? { fontWeight: 600 } : undefined
                      }
                    >
                      {money(row.amounts[c.accountId] ?? 0)}
                    </td>
                  ))}
                  <td
                    className="px-4 py-1.5 text-right tabular-nums border-l border-[var(--arca-border)] text-[var(--arca-ink)]"
                    style={strong ? { fontWeight: 600 } : undefined}
                  >
                    {money(row.total)}
                  </td>
                  {data.priorFiscalYearNumber !== null && (
                    <td className="px-4 py-1.5 text-right tabular-nums [font-family:var(--ff-mono)] border-l border-[var(--arca-border)] text-[var(--arca-ink-2)]">
                      {money(priorFor(row.kind))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-[var(--arca-border)] space-y-1">
        <NotaCuadre cuadra={data.matchesEsp}>
          {data.matchesEsp
            ? `El saldo al cierre coincide con el Patrimonio Neto del ESP ($ ${money(data.espTotal)}).`
            : `El saldo al cierre no coincide con el ESP ($ ${money(data.espTotal)}). Revisá el ejercicio.`}
        </NotaCuadre>
        {valuation === 'ajustado' && !data.inflationApplied && (
          <div className="text-[11.5px] text-[var(--arca-accent-warn-fg)]">
            El ajuste por inflación del ejercicio todavía no está generado, así
            que los importes son históricos. Generalo en la solapa «Ajuste por
            inflación».
          </div>
        )}
        <PriorNotAdjustedNote
          hasPrior={data.priorFiscalYearNumber !== null}
          priorInflationApplied={data.priorInflationApplied}
          valuation={valuation}
        />
        {data.priorFiscalYearNumber !== null &&
          valuation === 'ajustado' &&
          (data.priorCoefficient !== null ? (
            <div className="text-[11.5px] text-[var(--arca-ink-3)]">
              La columna del ejercicio anterior está reexpresada a moneda de
              cierre con coeficiente{' '}
              {data.priorCoefficient.toLocaleString('es-AR', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
              .
            </div>
          ) : (
            <div className="text-[11.5px] text-[var(--arca-accent-warn-fg)]">
              No hay índice para reexpresar el ejercicio anterior: la columna
              comparativa quedó en valores históricos.
            </div>
          ))}
      </div>
    </ArcaCard>
  );
}

function ErView({
  clientId,
  clientName,
  selectedFy,
  valuation,
  norma,
  refFor,
}: {
  /** Referencia a la nota o al anexo de cada línea. */
  refFor?: (group: string) => string | null;
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<LedgerDrill | null>(null);

  const effectiveFyId = selectedFy?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'er', clientId, effectiveFyId, valuation],
    queryFn: () =>
      getER({
        data: { clientId, fiscalYearId: effectiveFyId, view: valuation },
      }),
    enabled: !!effectiveFyId,
  });

  const toggle = (g: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const openLedger = (a: { accountId: string; code: string; name: string }) => {
    if (!selectedFy) return;
    setDrill({
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      from: new Date(selectedFy.fechaDesde).toISOString().slice(0, 10),
      to: new Date(selectedFy.fechaHasta).toISOString().slice(0, 10),
    });
  };

  return (
    <div className="space-y-4">
      <ArcaCard>
        {/* Carátula */}
        <div className="px-5 pt-4">
          <div className="text-[15px] font-semibold text-[var(--arca-ink)]">
            {clientName}
          </div>
          <div className="text-[12.5px] text-[var(--arca-ink-2)]">
            Estado de Resultados
            {data
              ? ` · Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`
              : ''}
          </div>
          <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
            {valuation === 'historico'
              ? 'Expresado en valores históricos, sin ajuste por inflación. Papel de trabajo.'
              : data?.inflationApplied
                ? `Expresado en moneda homogénea de cierre (ajuste por inflación · ${norma}).`
                : 'El ajuste por inflación del ejercicio todavía no está generado: los importes son históricos. Generalo en la solapa «Ajuste por inflación».'}
          </div>
        </div>

        {isLoading || !data ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Calculando…
          </div>
        ) : (
          <div className="px-2 py-3">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  <th className="py-2 pl-3 text-left">Concepto</th>
                  <th className="py-2 pr-3 text-right w-40">
                    Ej. N°{data.fiscalYearNumber}
                  </th>
                  <th className="py-2 pr-3 text-right w-40">
                    {data.hasPrior
                      ? `Ej. N°${data.priorFiscalYearNumber}`
                      : 'Anterior'}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[var(--arca-surface)]">
                {data.lines.map((line: ErLine) => {
                  if (line.kind === 'subtotal') {
                    const isFinal = line.key === 'resultado_ejercicio';
                    return (
                      <tr
                        key={line.key}
                        className={
                          isFinal
                            ? 'border-t-2 border-[var(--arca-ink)] font-bold'
                            : 'border-t border-[var(--arca-ink-3)] font-semibold'
                        }
                      >
                        <td className={isFinal ? 'py-2 pl-3' : 'py-1.5 pl-3'}>
                          {line.label}
                        </td>
                        <td
                          className={`${isFinal ? 'py-2' : 'py-1.5'} pr-3 text-right tabular-nums`}
                        >
                          $ {fmtMoney(line.current)}
                        </td>
                        <td
                          className={`${isFinal ? 'py-2' : 'py-1.5'} pr-3 text-right tabular-nums`}
                        >
                          {data.hasPrior ? `$ ${fmtMoney(line.prior)}` : '—'}
                        </td>
                      </tr>
                    );
                  }
                  const canExpand = line.accounts.length > 0;
                  const isOpen = expanded.has(line.key);
                  return (
                    <Fragment key={line.key}>
                      <tr
                        className={
                          canExpand
                            ? 'hover:bg-[var(--arca-surface-2)] cursor-pointer'
                            : ''
                        }
                        onClick={canExpand ? () => toggle(line.key) : undefined}
                      >
                        <td className="py-1.5 pl-5 text-[var(--arca-ink)]">
                          {canExpand && (
                            <span className="text-[var(--arca-ink-3)] mr-1">
                              {isOpen ? '▾' : '▸'}
                            </span>
                          )}
                          {line.label}
                          {refFor?.(line.key) && (
                            <span className="ml-1.5 text-[11px] text-[var(--arca-ink-3)]">
                              ({refFor(line.key)})
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                          $ {fmtMoney(line.current)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                          {data.hasPrior ? `$ ${fmtMoney(line.prior)}` : '—'}
                        </td>
                      </tr>
                      {isOpen &&
                        line.accounts.map((a) => (
                          <tr
                            key={a.accountId}
                            className="text-[11.5px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] cursor-pointer"
                            onClick={() => openLedger(a)}
                            title="Ver mayor de la cuenta"
                          >
                            <td className="py-1 pl-12">
                              <span className="text-[var(--arca-ink-3)]">
                                {a.code}
                              </span>{' '}
                              {a.name}
                            </td>
                            <td className="py-1 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                              $ {fmtMoney(a.current)}
                            </td>
                            <td className="py-1 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                              {data.hasPrior ? `$ ${fmtMoney(a.prior)}` : '—'}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* US 6.2.2 — validación de consistencia ER ↔ ESP */}
            <div className="px-3 mt-3">
              {data.matchesEspCurrent ? (
                <NotaCuadre cuadra>
                  El Resultado del ejercicio del ER coincide con el del ESP ($
                  {fmtMoney(data.resultadoCurrent)}).
                </NotaCuadre>
              ) : (
                <NotaCuadre cuadra={false}>
                  Discrepancia: Resultado del ER $
                  {fmtMoney(data.resultadoCurrent)} ≠ Resultado del ESP $
                  {fmtMoney(data.espResultadoCurrent)}. La emisión está
                  bloqueada hasta corregir.
                </NotaCuadre>
              )}
              <div className="mt-1">
                <PriorNotAdjustedNote
                  hasPrior={data.hasPrior}
                  priorInflationApplied={data.priorInflationApplied}
                  valuation={valuation}
                />
              </div>
            </div>
          </div>
        )}
      </ArcaCard>

      {drill && (
        <LedgerDialog
          clientId={clientId}
          drill={drill}
          canWrite={false}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function AnexoCMVView({
  clientId,
  clientName,
  selectedFy,
  canEdit,
}: {
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const effectiveFyId = selectedFy?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'cmv', clientId, effectiveFyId],
    queryFn: () => getCMV({ data: { clientId, fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const { data: membrete } = useQuery({
    queryKey: ['accounting', 'membrete', clientId],
    queryFn: () => getMembreteData({ data: { clientId } }),
  });

  const [form, setForm] = useState({ ini: '', compras: '', fin: '' });
  useEffect(() => {
    if (data) {
      setForm({
        ini: String(data.existenciaInicial ?? 0),
        compras: String(data.comprasGastos ?? 0),
        fin: String(data.existenciaFinal ?? 0),
      });
    }
  }, [data]);

  const n = (s: string) => {
    const x = parseFloat(s);
    return isNaN(x) ? 0 : x;
  };
  const total =
    Math.round((n(form.ini) + n(form.compras) - n(form.fin)) * 100) / 100;

  const mut = useMutation({
    mutationFn: () =>
      saveCMV({
        data: {
          clientId,
          fiscalYearId: effectiveFyId,
          existenciaInicial: n(form.ini),
          comprasGastos: n(form.compras),
          existenciaFinal: n(form.fin),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['accounting', 'cmv', clientId, effectiveFyId],
      });
      toast.success('Costo de mercadería vendida guardado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const buildCmvExport = (): CmvExportData => ({
    empresaName: clientName,
    fiscalYearNumber: data!.fiscalYearNumber,
    periodLabel: data!.periodLabel,
    existenciaInicial: n(form.ini),
    comprasGastos: n(form.compras),
    existenciaFinal: n(form.fin),
    total,
    priorTotal: data!.priorTotal,
    priorNumber: data!.priorFiscalYearNumber,
    membrete:
      membrete && selectedFy
        ? {
            cuit: membrete.cuit,
            domicilio: membrete.domicilio,
            actividadPrincipal: membrete.actividadPrincipal,
            fechaConstitucion: membrete.fechaConstitucion
              ? fmtFecha(membrete.fechaConstitucion)
              : '',
            fechaInscripcion: membrete.fechaInscripcion
              ? fmtFecha(membrete.fechaInscripcion)
              : '',
            numeroInscripcion: membrete.numeroInscripcion,
            inicioLabel: fmtFechaLarga(selectedFy.fechaDesde),
            cierreLabel: fmtFechaLarga(selectedFy.fechaHasta),
            accountant: membrete.accountant,
          }
        : null,
  });

  const amount = (k: keyof typeof form) =>
    canEdit ? (
      <input
        type="number"
        step="0.01"
        value={form[k]}
        onChange={upd(k)}
        className={`${INPUT_CLASS} h-8 w-44 text-right tabular-nums`}
      />
    ) : (
      <span className="tabular-nums">$ {fmtMoney(n(form[k]))}</span>
    );

  if (!effectiveFyId) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Seleccioná un ejercicio.
        </div>
      </ArcaCard>
    );
  }

  return (
    <div className="space-y-4">
      <ArcaCard>
        {/* Carátula */}
        <div className="px-5 pt-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold text-[var(--arca-ink)]">
              {clientName}
            </div>
            <div className="text-[12.5px] text-[var(--arca-ink-2)]">
              Costo de la mercadería vendida
              {data
                ? ` · Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`
                : ''}
            </div>
            <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
              Carga manual (método diferencia de inventario). Es un anexo
              explicativo; no modifica el “Costo de ventas” del Estado de
              Resultados.
            </div>
          </div>
          {data && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void exportCmvExcel(buildCmvExport())}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> Excel
              </button>
              <button
                onClick={() => void exportCmvPdf(buildCmvExport())}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> PDF
              </button>
            </div>
          )}
        </div>

        {isLoading || !data ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Calculando…
          </div>
        ) : (
          <div className="px-5 py-5">
            <div className="max-w-[560px] space-y-3 text-[13px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--arca-ink-2)]">
                  Existencia de mercaderías al inicio del ejercicio
                </span>
                {amount('ini')}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--arca-ink-2)]">
                  Compras / gastos del ejercicio
                </span>
                {amount('compras')}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--arca-ink-2)]">
                  Existencia de mercaderías al cierre del ejercicio
                  <span className="text-[var(--arca-ink-3)]"> (se resta)</span>
                </span>
                {amount('fin')}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-[var(--arca-ink-2)] pt-2 font-semibold">
                <span>TOTAL COSTO DE VENTAS</span>
                <span className="tabular-nums">$ {fmtMoney(total)}</span>
              </div>

              {data.priorTotal != null && (
                <div className="flex items-center justify-between gap-4 text-[11.5px] text-[var(--arca-ink-3)] italic">
                  <span>
                    Total · Ejercicio anterior (N°{data.priorFiscalYearNumber})
                  </span>
                  <span className="tabular-nums">
                    $ {fmtMoney(data.priorTotal)}
                  </span>
                </div>
              )}
            </div>

            {canEdit && (
              <div className="mt-5">
                <button
                  onClick={() => mut.mutate()}
                  disabled={mut.isPending}
                  className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white disabled:opacity-50"
                >
                  {mut.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )}
          </div>
        )}
      </ArcaCard>
    </div>
  );
}

function AnexoIIView({
  clientId,
  clientName,
  selectedFy,
}: {
  clientId: string;
  clientName: string;
  selectedFy: FyOption | undefined;
}) {
  const [drill, setDrill] = useState<LedgerDrill | null>(null);
  const effectiveFyId = selectedFy?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'anexo-ii', clientId, effectiveFyId],
    queryFn: () =>
      getAnexoII({ data: { clientId, fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const openLedger = (a: { accountId: string; code: string; name: string }) => {
    if (!selectedFy) return;
    setDrill({
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      from: new Date(selectedFy.fechaDesde).toISOString().slice(0, 10),
      to: new Date(selectedFy.fechaHasta).toISOString().slice(0, 10),
    });
  };

  return (
    <div className="space-y-4">
      <ArcaCard>
        {/* Carátula */}
        <div className="px-5 pt-4">
          <div className="text-[15px] font-semibold text-[var(--arca-ink)]">
            {clientName}
          </div>
          <div className="text-[12.5px] text-[var(--arca-ink-2)]">
            Anexo II · Gastos por función
            {data
              ? ` · Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`
              : ''}
          </div>
          <div className="text-[11px] text-[var(--arca-ink-3)] italic mt-0.5">
            Composición de los gastos del Estado de Resultados por su función.
          </div>
        </div>

        {isLoading || !data ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Calculando…
          </div>
        ) : data.functions.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay gastos registrados en este ejercicio.
          </div>
        ) : (
          <div className="px-2 py-3">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-bg)] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  <th className="py-2 pl-3 text-left">Función / cuenta</th>
                  <th className="py-2 pr-3 text-right w-40">
                    Ej. N°{data.fiscalYearNumber}
                  </th>
                  <th className="py-2 pr-3 text-right w-40">
                    {data.hasPrior
                      ? `Ej. N°${data.priorFiscalYearNumber}`
                      : 'Anterior'}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[var(--arca-surface)]">
                {data.functions.map((fn: AnexoIIFunction) => (
                  <Fragment key={fn.key}>
                    <tr className="bg-[var(--arca-surface-2)]">
                      <td className="py-1.5 pl-3 font-semibold text-[var(--arca-ink)]">
                        {fn.label}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)] font-semibold">
                        $ {fmtMoney(fn.current)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums [font-family:var(--ff-mono)] font-semibold">
                        {data.hasPrior ? `$ ${fmtMoney(fn.prior)}` : '—'}
                      </td>
                    </tr>
                    {fn.accounts.map((a) => (
                      <tr
                        key={a.accountId}
                        className="text-[11.5px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] cursor-pointer"
                        onClick={() => openLedger(a)}
                        title="Ver mayor de la cuenta"
                      >
                        <td className="py-1 pl-7">
                          <span className="text-[var(--arca-ink-3)]">
                            {a.code}
                          </span>{' '}
                          {a.name}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                          $ {fmtMoney(a.current)}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                          {data.hasPrior ? `$ ${fmtMoney(a.prior)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="border-t-2 border-[var(--arca-ink)] font-bold">
                  <td className="py-2 pl-3">TOTAL GASTOS</td>
                  <td className="py-2 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                    $ {fmtMoney(data.totalCurrent)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums [font-family:var(--ff-mono)]">
                    {data.hasPrior ? `$ ${fmtMoney(data.totalPrior)}` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </ArcaCard>

      {drill && (
        <LedgerDialog
          clientId={clientId}
          drill={drill}
          canWrite={false}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function NotesEditor({
  clientId,
  fiscalYearId,
  notes: initialNotes,
  layout: initialLayout,
  sectionLabels,
  approved,
  canEdit,
  onSaved,
  clientName,
  vars = {},
}: {
  clientId: string;
  fiscalYearId: string;
  notes: FsNote[];
  layout: LayoutEntry[];
  sectionLabels: Record<string, string>;
  approved: boolean;
  canEdit: boolean;
  onSaved: () => void;
  /** Nombre de empresa, para el archivo Word exportado. */
  clientName?: string;
  /** Variables de la empresa/ejercicio para autocompletar en las notas. */
  vars?: Partial<AuditReportVars>;
}) {
  const [notes, setNotes] = useState<FsNote[]>(initialNotes);
  // El orden vive aparte del contenido: incluye los bloques que genera el
  // sistema, así el contador decide en qué posición cae cada uno y de ahí sale
  // el número de nota.
  const [layout, setLayout] = useState<LayoutEntry[]>(
    initialLayout.length > 0 ? initialLayout : defaultNoteLayout(initialNotes)
  );
  const [preview, setPreview] = useState<Set<string>>(new Set());

  const secuencia = numberNotes(layout, notes, sectionLabels);
  const dirty =
    JSON.stringify(notes) !== JSON.stringify(initialNotes) ||
    JSON.stringify(secuencia.map((n) => n.entry)) !==
      JSON.stringify(initialLayout);
  const editable = canEdit && !approved;

  const saveMut = useMutation({
    mutationFn: () =>
      saveFinancialStatementNotes({
        data: {
          clientId,
          fiscalYearId,
          notes,
          // Se guarda ya normalizado: sin notas borradas y con las nuevas.
          layout: secuencia.map((n) => n.entry),
        },
      }),
    onSuccess: () => {
      toast.success('Notas guardadas');
      onSaved();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar'),
  });

  /**
   * `cantidad` ids nuevos, correlativos.
   *
   * Devuelve varios de una y no uno por llamada porque el id sale del máximo
   * del estado actual: llamarlo N veces seguidas dentro de un `map` daba N
   * veces el mismo id, y las notas se pisaban entre sí.
   */
  const nuevosIds = (cantidad: number) => {
    const desde = notes.reduce(
      (m, n) => Math.max(m, Number(n.id.split('-')[1]) || 0),
      0
    );
    return Array.from({ length: cantidad }, (_, i) => `n-${desde + 1 + i}`);
  };
  const newId = () => nuevosIds(1)[0];

  const addNote = () => {
    const id = newId();
    setNotes((prev) => [...prev, { id, title: 'Nueva nota', content: '' }]);
    setLayout((prev) => [...prev, `note:${id}`]);
  };
  const update = (id: string, patch: Partial<FsNote>) =>
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const remove = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setLayout((prev) => prev.filter((e) => e !== `note:${id}`));
  };
  /**
   * Mueve sobre la secuencia ya resuelta y la guarda entera. Operar sobre el
   * layout crudo fallaría cuando quedó viejo: las entradas que faltan se
   * resuelven al final y las posiciones no coincidirían con lo que se ve.
   */
  const move = (idx: number, dir: -1 | 1) => {
    const orden = secuencia.map((n) => n.entry);
    const j = idx + dir;
    if (j < 0 || j >= orden.length) return;
    [orden[idx], orden[j]] = [orden[j], orden[idx]];
    setLayout(orden);
  };
  const togglePreview = (id: string) =>
    setPreview((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Notas leídas de un .docx, esperando confirmación. */
  const [importadas, setImportadas] = useState<NotaImportada[] | null>(null);
  const [importando, setImportando] = useState(false);
  const inputWord = useRef<HTMLInputElement>(null);

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return;
    setImportando(true);
    try {
      const notas = await leerNotasDeWord(file);
      if (notas.length === 0) {
        toast.error('No se encontró texto en el documento.');
        return;
      }
      // No se aplica de una: importar agrega notas al balance y el usuario
      // tiene que ver cuántas y cuáles antes.
      setImportadas(notas);
    } catch {
      toast.error(
        'No se pudo leer el documento. Tiene que ser un .docx de Word.'
      );
    } finally {
      setImportando(false);
      if (inputWord.current) inputWord.current.value = '';
    }
  };

  const [formatoAbierto, setFormatoAbierto] = useState(false);

  const bajarPlantilla = async () => {
    const blob = await plantillaNotasWord();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formato_notas.docx';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Las importadas se agregan al final; no reemplazan lo que ya hay. */
  const confirmarImportacion = () => {
    if (!importadas) return;
    const ids = nuevosIds(importadas.length);
    const nuevas = importadas.map((n, i) => ({
      id: ids[i],
      title: n.titulo.slice(0, 200),
      content: n.contenido.slice(0, 20000),
    }));
    setNotes((prev) => [...prev, ...nuevas]);
    setLayout((prev) => [
      ...prev,
      ...nuevas.map((n): LayoutEntry => `note:${n.id}`),
    ]);
    setImportadas(null);
    toast.success(
      nuevas.length === 1
        ? 'Se agregó 1 nota. Revisala y guardá.'
        : `Se agregaron ${nuevas.length} notas. Revisalas y guardá.`
    );
  };

  const exportWord = async () => {
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } =
      await import('docx');
    const children: InstanceType<typeof Paragraph>[] = [];
    for (const item of secuencia) {
      if (item.isSystem) continue;
      const note = notes.find((n) => `note:${n.id}` === item.entry);
      if (!note) continue;
      children.push(
        new Paragraph({
          text: `Nota ${item.number}. ${note.title}`,
          heading: HeadingLevel.HEADING_2,
        })
      );
      const filledContent = fillAuditReport(note.content, vars);
      for (const line of filledContent.split('\n')) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line })],
          })
        );
      }
      children.push(new Paragraph({ text: '' }));
    }
    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notas_${(clientName ?? 'balance').replace(/\s+/g, '_')}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ArcaCard>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Notas a los Estados Contables
        </span>
        <span className="text-[11px] text-[var(--arca-ink-3)]">
          Formato Markdown
        </span>
        <div className="flex-1" />
        {/* Tooltips del sistema en vez de `title`: el nativo tarda casi un
          segundo en aparecer y no se ve como el resto. */}
        {notes.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={exportWord}>
                Exportar Word
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Exportar todas las notas como documento Word (.docx)
            </TooltipContent>
          </Tooltip>
        )}
        {editable && (
          <>
            <input
              ref={inputWord}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => void elegirArchivo(e.target.files?.[0])}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputWord.current?.click()}
                  disabled={importando}
                >
                  {importando ? 'Leyendo…' : 'Importar Word'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Importar notas desde un documento Word (.docx)
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFormatoAbierto(true)}
                >
                  Ver formato
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Ver el formato que espera la importación
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addNote}
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  Agregar nota
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Agrega una nota vacía al final del listado
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={!dirty || saveMut.isPending}
                >
                  Guardar
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {dirty
                  ? 'Guardar los cambios de las notas'
                  : 'No hay cambios para guardar'}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Vista previa del formato. Renderiza la misma plantilla que se
          descarga, así lo que se ve y lo que se baja no pueden divergir. */}
      <Dialog open={formatoAbierto} onOpenChange={setFormatoAbierto}>
        <DialogContent
          /* `sm:` es necesario: DialogContent trae `sm:max-w-lg`, que sin
             el prefijo le gana a este por breakpoint y deja el diálogo en
             512px. */
          className="sm:max-w-[min(95vw,1400px)] max-h-[92vh] flex flex-col gap-0 p-0"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--arca-border)]">
            <DialogTitle>Formato del Word para importar</DialogTitle>
            <DialogDescription>
              Así tiene que verse el documento. Lo único que importa es que cada
              título de nota esté con estilo de encabezado —Título 1, 2 o 3 en
              Word y en Google Docs—, no en negrita: el sistema corta el
              documento por los encabezados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--arca-surface-2)] px-6 py-6">
            <div className="mx-auto max-w-[1000px] bg-white rounded-[8px] border border-[var(--arca-border)] px-12 py-10 shadow-sm">
              {PLANTILLA.map((b, i) =>
                b.tipo === 'titulo' ? (
                  <div
                    key={i}
                    className="mt-6 first:mt-0 flex items-baseline gap-3"
                  >
                    <h3 className="text-[17px] font-semibold text-[var(--arca-ink)]">
                      {b.texto}
                    </h3>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--arca-ink-4)] border border-[var(--arca-border)] rounded-[4px] px-1.5 py-0.5">
                      Título 2
                    </span>
                  </div>
                ) : b.tipo === 'vineta' ? (
                  <p
                    key={i}
                    className="mt-1 pl-8 text-[13.5px] leading-relaxed text-[var(--arca-ink-2)] before:content-['•'] before:-ml-4 before:mr-2 before:text-[var(--arca-ink-4)]"
                  >
                    {b.texto}
                  </p>
                ) : (
                  <p
                    key={i}
                    className="mt-3 text-[13.5px] leading-relaxed text-[var(--arca-ink-2)]"
                  >
                    {b.texto}
                  </p>
                )
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-[var(--arca-border)]">
            <button
              onClick={() => setFormatoAbierto(false)}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
            >
              Cerrar
            </button>
            <button
              onClick={() => void bajarPlantilla()}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white"
            >
              Descargar .docx de ejemplo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Qué se va a importar, antes de tocar las notas del balance. Un .docx
          puede traer diez notas y el usuario tiene que poder mirarlas —y ver
          si el parser partió bien los títulos— sin haber modificado nada. */}
      <AlertDialog
        open={importadas !== null}
        onOpenChange={(o) => {
          if (!o) setImportadas(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {importadas?.length === 1
                ? 'Se encontró 1 nota en el documento'
                : `Se encontraron ${importadas?.length ?? 0} notas en el documento`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se agregan al final de las notas que ya tenés; no reemplazan
              ninguna. Después podés reordenarlas, editarlas o borrarlas, y los
              cambios recién quedan cuando apretás Guardar.
              {importadas?.length === 1 &&
                importadas[0].titulo === 'Nota importada' && (
                  <>
                    {' '}
                    <strong>
                      El documento no tenía títulos con estilo de encabezado
                    </strong>
                    , así que entró todo como una sola nota. Si esperabas
                    varias, marcá cada título como Título 1, 2 o 3 en Word y
                    volvé a importar — «ver formato» baja un ejemplo.
                  </>
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-[8px] border border-[var(--arca-border)] divide-y divide-[var(--arca-border)]">
            {importadas?.map((n, i) => (
              <div key={i} className="px-3 py-2">
                <p className="text-[12.5px] font-medium text-[var(--arca-ink)]">
                  {n.titulo || <span className="italic">Sin título</span>}
                </p>
                <p className="text-[11.5px] text-[var(--arca-ink-3)] line-clamp-2">
                  {n.contenido || 'Sin contenido'}
                </p>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarImportacion}>
              Agregar {importadas?.length === 1 ? 'la nota' : 'las notas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {approved && (
        <div className="px-5 py-2 text-[11.5px] text-[var(--arca-accent-pos-fg)] bg-[var(--arca-accent-pos-bg)] border-b border-[var(--arca-border)]">
          Los EECC están aprobados — las notas son de solo lectura. Reabrí a
          borrador para editarlas.
        </div>
      )}

      <div className="px-5 py-4 space-y-4">
        {notes.length === 0 && (
          <div className="text-center text-[13px] text-[var(--arca-ink-3)] py-6">
            {editable
              ? 'Aún no hay notas. Agregá la primera con “+ Agregar nota”.'
              : 'No hay notas cargadas para este ejercicio.'}
          </div>
        )}

        {secuencia.map((item, idx) => {
          // La composición de rubros la arma el sistema: se puede mover para
          // que le toque otro número, pero no editar ni borrar.
          if (item.isSystem) {
            return (
              <div
                key={item.entry}
                className="rounded-[8px] border border-dashed border-[var(--arca-border)] bg-[var(--arca-surface-2)]/40"
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-[11px] text-[var(--arca-ink-3)] w-6 shrink-0">
                    {item.number}.
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-[var(--arca-ink)]">
                    {item.title}
                  </span>
                  <span className="text-[10.5px] text-[var(--arca-ink-3)] italic">
                    la genera el sistema
                  </span>
                  {editable && (
                    <>
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)] disabled:opacity-30"
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === secuencia.length - 1}
                        className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)] disabled:opacity-30"
                        title="Bajar"
                      >
                        ↓
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }

          const note = notes.find((n) => `note:${n.id}` === item.entry);
          if (!note) return null;
          const isPreview = preview.has(note.id) || !editable;
          return (
            <div
              key={note.id}
              className="rounded-[8px] border border-[var(--arca-border)]"
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
                <span className="text-[11px] text-[var(--arca-ink-3)] w-6 shrink-0">
                  {item.number}.
                </span>
                {editable ? (
                  <input
                    value={note.title}
                    onChange={(e) => update(note.id, { title: e.target.value })}
                    placeholder="Título de la nota"
                    className="flex-1 bg-transparent text-[13px] font-medium text-[var(--arca-ink)] outline-none"
                  />
                ) : (
                  <span className="flex-1 text-[13px] font-medium text-[var(--arca-ink)]">
                    {note.title || `Nota ${item.number}`}
                  </span>
                )}
                {editable && (
                  <>
                    <button
                      onClick={() => togglePreview(note.id)}
                      className="text-[11px] px-2 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)]"
                    >
                      {preview.has(note.id) ? 'Editar' : 'Vista'}
                    </button>
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)] disabled:opacity-30"
                      title="Subir"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === secuencia.length - 1}
                      className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)] disabled:opacity-30"
                      title="Bajar"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => remove(note.id)}
                      className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-accent-neg-fg)] hover:bg-[var(--arca-accent-neg-bg)]"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
              {isPreview ? (
                <div className="px-4 py-3 text-[13px] text-[var(--arca-ink-2)] [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-[var(--arca-ink)] [&_em]:italic [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:my-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:my-2 [&_h3]:font-semibold [&_a]:text-[var(--arca-accent-hover)] [&_a]:underline [&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-[var(--arca-surface-2)] [&_code]:px-1 [&_code]:rounded [&_table]:w-full [&_th]:text-left [&_th]:border-b [&_th]:border-[var(--arca-border)] [&_td]:py-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--arca-border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--arca-ink-3)]">
                  {note.content.trim() ? (
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {fillAuditReport(note.content, vars)}
                    </Markdown>
                  ) : (
                    <span className="text-[var(--arca-ink-3)] italic">
                      (sin contenido)
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <textarea
                    value={note.content}
                    onChange={(e) =>
                      update(note.id, { content: e.target.value })
                    }
                    placeholder="Escribí la nota en Markdown…"
                    rows={6}
                    className="w-full px-4 py-3 bg-transparent text-[13px] text-[var(--arca-ink)] outline-none resize-y font-mono"
                  />
                  {editable && (
                    <div className="px-4 pb-2 text-[11px] text-[var(--arca-ink-3)] border-t border-[var(--arca-border)] pt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="font-medium text-[var(--arca-ink-4)]">
                        Variables:
                      </span>
                      {AUDIT_REPORT_VARS.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() =>
                            update(note.id, {
                              content: note.content + `{{${v.key}}}`,
                            })
                          }
                          title={`${v.label} — ej: ${v.ejemplo}`}
                          className="font-mono text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] hover:underline"
                        >
                          {`{{${v.key}}}`}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </ArcaCard>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('No se pudo leer el PDF'));
    fr.readAsDataURL(blob);
  });
}

function DatosInicialesView({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { data: membrete } = useQuery({
    queryKey: ['accounting', 'membrete', clientId],
    queryFn: () => getMembreteData({ data: { clientId } }),
  });

  const [form, setForm] = useState({
    address: '',
    actividadPrincipal: '',
    fechaConstitucion: '',
    fechaInscripcion: '',
    numeroInscripcion: '',
    accountingFramework: 'rt54' as 'rt54' | 'rt6',
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!membrete) return;
    setForm({
      address: membrete.domicilio ?? '',
      actividadPrincipal: membrete.actividadPrincipal ?? '',
      fechaConstitucion: membrete.fechaConstitucion ?? '',
      fechaInscripcion: membrete.fechaInscripcion ?? '',
      numeroInscripcion: membrete.numeroInscripcion ?? '',
      accountingFramework: membrete.accountingFramework ?? 'rt54',
    });
    setDirty(false);
  }, [membrete]);

  const mut = useMutation({
    mutationFn: () =>
      updateClientFiscalData({
        data: {
          clientId,
          address: form.address || undefined,
          actividadPrincipal: form.actividadPrincipal || null,
          fechaConstitucion: form.fechaConstitucion || null,
          fechaInscripcion: form.fechaInscripcion || null,
          numeroInscripcion: form.numeroInscripcion || null,
          accountingFramework: form.accountingFramework,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting', 'membrete', clientId] });
      setDirty(false);
      toast.success('Datos iniciales guardados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  return (
    <ArcaCard>
      <div className="px-5 py-4 space-y-5">
        <div>
          <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
            Datos iniciales del balance
          </div>
          <div className="text-[12px] text-[var(--arca-ink-3)] mt-0.5">
            Estos datos aparecen en la carátula del paquete EECC y pueden usarse
            como base para las Notas 1 y 2.
          </div>
        </div>

        {/* Empresa + CUIT — solo lectura */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-[var(--arca-ink-3)] uppercase tracking-wide">
              Razón social
            </div>
            <div className="text-[13px] text-[var(--arca-ink)]">
              {membrete?.empresaName ?? '—'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-[var(--arca-ink-3)] uppercase tracking-wide">
              CUIT
            </div>
            <div className="text-[13px] text-[var(--arca-ink)]">
              {membrete?.cuit ?? '—'}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--arca-border)]" />

        {/* Campos editables */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--arca-ink-2)] uppercase tracking-wide">
              Domicilio
            </label>
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={!canEdit}
              placeholder="Av. Corrientes 1234, Buenos Aires"
              className="w-full h-8 px-2.5 rounded-[7px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] text-[var(--arca-ink)] outline-none transition-[color,box-shadow] placeholder:text-[var(--arca-ink-4)] focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)] disabled:cursor-default disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--arca-ink-2)] uppercase tracking-wide">
              Actividad principal
            </label>
            <input
              value={form.actividadPrincipal}
              onChange={(e) => set('actividadPrincipal', e.target.value)}
              disabled={!canEdit}
              placeholder="Venta al por menor de…"
              className="w-full h-8 px-2.5 rounded-[7px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] text-[var(--arca-ink)] outline-none transition-[color,box-shadow] placeholder:text-[var(--arca-ink-4)] focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)] disabled:cursor-default disabled:opacity-50"
            />
          </div>

          {/* Tres columnas: los datos registrales juntos y en orden
              cronológico — primero se constituye, después se inscribe. */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--arca-ink-2)] uppercase tracking-wide">
                Fecha constitución
              </label>
              <SelectorFecha
                value={form.fechaConstitucion}
                onChange={(v) => set('fechaConstitucion', v)}
                disabled={!canEdit}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--arca-ink-2)] uppercase tracking-wide">
                Fecha inscripción RPC
              </label>
              <SelectorFecha
                value={form.fechaInscripcion}
                onChange={(v) => set('fechaInscripcion', v)}
                disabled={!canEdit}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--arca-ink-2)] uppercase tracking-wide">
                N° inscripción IGJ
              </label>
              <input
                value={form.numeroInscripcion}
                onChange={(e) => set('numeroInscripcion', e.target.value)}
                disabled={!canEdit}
                placeholder="12345"
                className="w-full h-8 px-2.5 rounded-[7px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] text-[var(--arca-ink)] outline-none transition-[color,box-shadow] placeholder:text-[var(--arca-ink-4)] focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)] disabled:cursor-default disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--arca-ink-2)] uppercase tracking-wide">
              Norma contable aplicada
            </label>
            <Select
              value={form.accountingFramework}
              onValueChange={(v) => set('accountingFramework', v)}
              disabled={!canEdit}
            >
              <SelectTrigger size="sm" className="w-64 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rt54">
                  RT 54 (T.O. RT 59) — entes pequeños
                </SelectItem>
                <SelectItem value="rt6">RT 6 — norma general</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[var(--arca-ink-3)]">
              Define cómo se cita el ajuste por inflación en los EECC. El
              cálculo es idéntico en ambas normas.
            </p>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={mut.isPending || !dirty}
                className="px-4 h-8 rounded-[7px] bg-[var(--arca-accent)] text-white text-[12.5px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {mut.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </form>

        {/* Contador — solo lectura */}
        {membrete?.accountant && (
          <>
            <div className="border-t border-[var(--arca-border)]" />
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-[var(--arca-ink-3)] uppercase tracking-wide">
                Contador firmante
              </div>
              <div className="text-[13px] text-[var(--arca-ink)]">
                {membrete.accountant.nombre}
              </div>
              <div className="text-[12px] text-[var(--arca-ink-3)]">
                {[
                  membrete.accountant.tomo &&
                    `Tomo ${membrete.accountant.tomo}`,
                  membrete.accountant.folio &&
                    `Folio ${membrete.accountant.folio}`,
                  membrete.accountant.consejo,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="text-[11px] text-[var(--arca-ink-4)] mt-1">
                La firma se configura en «Firma digital» del módulo Sueldos.
              </div>
            </div>
          </>
        )}
      </div>
    </ArcaCard>
  );
}

function ExportView({
  clientId,
  clientName,
  clientCuit,
  selectedFy,
  notes,
  layout,
  sectionLabels,
  auditReport,
  references,
  isOwner,
  valuation,
  norma,
  pdfGeneratedAt,
  pdfGeneratedByName,
  onPdfSaved,
}: {
  clientId: string;
  clientName: string;
  clientCuit: string;
  selectedFy: FyOption | undefined;
  notes: FsNote[];
  layout: LayoutEntry[];
  sectionLabels: Record<string, string>;
  /** Informe del auditor ya rellenado, si se cargó. */
  auditReport: { body: string; lugar: string; fecha: string } | null;
  /** Referencias ya resueltas por rubro, para imprimirlas en los estados. */
  references: Record<string, string>;
  isOwner: boolean;
  valuation: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma: string;
  pdfGeneratedAt: string | null;
  pdfGeneratedByName: string | null;
  onPdfSaved: () => void;
}) {
  const fyId = selectedFy?.id ?? '';
  const [busy, setBusy] = useState<string | null>(null);

  /** La firma del contador es del estudio, no de la empresa. */
  const { data: membrete } = useQuery({
    queryKey: ['accounting', 'membrete', clientId],
    queryFn: () => getMembreteData({ data: { clientId } }),
  });

  const { data: esp } = useQuery({
    queryKey: ['accounting', 'esp', clientId, fyId, valuation],
    queryFn: () =>
      getESP({ data: { clientId, fiscalYearId: fyId, view: valuation } }),
    enabled: !!fyId,
  });
  const { data: er } = useQuery({
    queryKey: ['accounting', 'er', clientId, fyId, valuation],
    queryFn: () =>
      getER({ data: { clientId, fiscalYearId: fyId, view: valuation } }),
    enabled: !!fyId,
  });
  const { data: eepn } = useQuery({
    queryKey: ['accounting', 'eepn', clientId, fyId, valuation],
    queryFn: () =>
      getEEPN({ data: { clientId, fiscalYearId: fyId, view: valuation } }),
    enabled: !!fyId,
  });
  const { data: efe } = useQuery({
    queryKey: ['accounting', 'efe', clientId, fyId, valuation],
    queryFn: () =>
      getEFE({ data: { clientId, fiscalYearId: fyId, view: valuation } }),
    enabled: !!fyId,
  });
  const { data: anexoI } = useQuery({
    queryKey: ['accounting', 'anexo-i', clientId, fyId],
    queryFn: () => getAnexoI({ data: { clientId, fiscalYearId: fyId } }),
    enabled: !!fyId,
  });
  const { data: anexoII } = useQuery({
    queryKey: ['accounting', 'anexo-ii', clientId, fyId],
    queryFn: () => getAnexoII({ data: { clientId, fiscalYearId: fyId } }),
    enabled: !!fyId,
  });
  const { data: cmv } = useQuery({
    queryKey: ['accounting', 'cmv', clientId, fyId],
    queryFn: () => getCMV({ data: { clientId, fiscalYearId: fyId } }),
    enabled: !!fyId,
  });
  const { data: consol } = useQuery({
    queryKey: ['accounting', 'consolidated-export', clientId, fyId],
    queryFn: () =>
      getLedgerConsolidated({ data: { clientId, fiscalYearId: fyId } }),
    enabled: !!fyId,
  });

  const ready = !!esp && !!er && !!anexoII;

  const onEstadosExcel = async () => {
    if (!esp) {
      toast.error('Los datos aún se están cargando');
      return;
    }
    setBusy('estados-excel');
    try {
      await exportEstadosExcel({
        empresaName: clientName,
        fiscalYearNumber: esp.fiscalYearNumber,
        periodLabel: esp.periodLabel,
        valuation,
        norma,
        sections: resolveDocumentLayout(layout, notes, sectionLabels).map(
          (x) => x.entry
        ),
        composicionNumber:
          numberNotes(layout, notes, sectionLabels).find(
            (n) => n.entry === 'composicion'
          )?.number ?? null,
        eepn: eepn ?? null,
        efe: efe ?? null,
        esp,
      });
      toast.success('Excel de los estados generado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el Excel');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Las variables con las que se rellenan las notas del paquete.
   *
   * Una sola función para el PDF y para el chequeo previo: si fueran dos, el
   * aviso podría decir que falta algo que sí se rellena, o al revés.
   */
  const noteVarsDelPaquete = (): Partial<AuditReportVars> => ({
    empresa: clientName,
    cuit: clientCuit,
    domicilio: membrete?.domicilio ?? '',
    inicio: selectedFy ? fechaLarga(new Date(selectedFy.fechaDesde)) : '',
    constitucion: membrete?.fechaConstitucion
      ? fechaLarga(new Date(membrete.fechaConstitucion))
      : '',
    igj: membrete?.numeroInscripcion ?? '',
    ...variablesDelBalance(esp),
    contador: membrete?.accountant?.nombre ?? '',
    matricula: [
      membrete?.accountant?.tomo && `Tomo ${membrete.accountant.tomo}`,
      membrete?.accountant?.folio && `Folio ${membrete.accountant.folio}`,
      membrete?.accountant?.consejo,
    ]
      .filter(Boolean)
      .join(' '),
  });

  /**
   * Variables escritas en las notas que no tienen dato cargado.
   *
   * `fillAuditReport` deja la llave a la vista cuando falta el valor —borrarla
   * escondería el hueco justo en el documento que se firma—, pero eso se
   * descubre recién abriendo el PDF. Conviene avisar antes.
   */
  const variablesFaltantes = () => {
    const vars = noteVarsDelPaquete();
    const faltan = new Set<string>();
    for (const n of notes)
      for (const k of missingVars(n.content, vars)) faltan.add(k);
    return [...faltan];
  };

  const [faltantesPdf, setFaltantesPdf] = useState<string[] | null>(null);

  const onPackage = async () => {
    if (!esp || !er || !anexoII || !selectedFy) {
      toast.error('Los datos del paquete aún se están cargando');
      return;
    }
    const faltan = variablesFaltantes();
    if (faltan.length > 0) {
      setFaltantesPdf(faltan);
      return;
    }
    await generarPaquete();
  };

  /**
   * Los datos del paquete, armados una sola vez: los usan la descarga y la
   * vista previa, así lo que se previsualiza es exactamente lo que se baja.
   */
  const armarDatosPaquete = () => {
    if (!esp || !er || !anexoII || !selectedFy) return null;
    return {
      empresaName: clientName,
      cuit: clientCuit,
      fiscalYearNumber: esp.fiscalYearNumber,
      periodLabel: esp.periodLabel,
      generatedLabel: new Date().toLocaleDateString('es-AR'),
      domicilio: membrete?.domicilio ?? undefined,
      actividadPrincipal: membrete?.actividadPrincipal ?? undefined,
      // Formateadas acá: la columna `date` viaja como YYYY-MM-DD y la
      // carátula la imprime tal cual le llegue.
      fechaConstitucion: membrete?.fechaConstitucion
        ? fmtFecha(membrete.fechaConstitucion)
        : undefined,
      fechaInscripcion: membrete?.fechaInscripcion
        ? fmtFecha(membrete.fechaInscripcion)
        : undefined,
      numeroInscripcion: membrete?.numeroInscripcion ?? undefined,
      esp,
      er,
      eepn: eepn ?? null,
      efe: efe ?? null,
      valuation,
      norma,
      accountant: membrete?.accountant ?? null,
      auditReport,
      auditoriaFecha: auditReport?.fecha ?? null,
      // El número de cada nota sale de su posición, no del orden de carga.
      noteSequence: numberNotes(layout, notes, sectionLabels),
      references,
      sections: resolveDocumentLayout(layout, notes, sectionLabels).map(
        (x) => x.entry
      ),
      anexoII,
      anexoI: anexoI
        ? {
            categories: anexoI.categories,
            grandTotals: anexoI.grandTotals,
            prior: anexoIMuestraComparativo(sectionLabels)
              ? anexoI.prior
              : null,
          }
        : null,
      cmv: cmv?.hasData
        ? {
            existenciaInicial: cmv.existenciaInicial,
            comprasGastos: cmv.comprasGastos,
            existenciaFinal: cmv.existenciaFinal,
            total: cmv.total,
          }
        : null,
      notes,
      noteVars: noteVarsDelPaquete(),
    };
  };

  const generarPaquete = async () => {
    const datos = armarDatosPaquete();
    if (!datos || !selectedFy) return;
    setBusy('package');
    try {
      const blob = await exportEeccPackagePdf(datos);
      if (isOwner) {
        const dataUrl = await blobToDataUrl(blob);
        await saveFinancialStatementPdf({
          data: {
            clientId,
            fiscalYearId: selectedFy.id,
            dataUrl,
            sizeBytes: blob.size,
          },
        });
        onPdfSaved();
        toast.success('PDF del paquete generado y guardado');
      } else {
        toast.success('PDF del paquete generado');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
    } finally {
      setBusy(null);
    }
  };

  /** Vista previa abierta: el documento, su título y cómo descargarlo. */
  const [preview, setPreview] = useState<{
    url: string;
    titulo: string;
    descargar: () => void;
  } | null>(null);
  const cerrarPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  /**
   * Arma la vista previa de cualquier exporte PDF: genera el blob sin
   * descargarlo ni guardarlo — mirar no es publicar — y deja a mano el
   * botón de descarga real, que pasa por el flujo completo de ese exporte.
   */
  const previsualizar = async (
    key: string,
    titulo: string,
    generar: () => Promise<Blob> | null,
    descargar: () => void
  ) => {
    const blob$ = generar();
    if (!blob$) {
      toast.error('Los datos aún se están cargando');
      return;
    }
    setBusy(`${key}-preview`);
    try {
      const blob = await blob$;
      setPreview({ url: URL.createObjectURL(blob), titulo, descargar });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
    } finally {
      setBusy(null);
    }
  };

  const previsualizarPaquete = () =>
    previsualizar(
      'package',
      'Paquete contable completo',
      () => {
        const datos = armarDatosPaquete();
        return datos ? exportEeccPackagePdf(datos, { descargar: false }) : null;
      },
      () => void onPackage()
    );

  const armarDatosMayor = (): MayorExportData | null => {
    if (!consol?.ejercicio || consol.accounts.length === 0) return null;
    return {
      empresaName: clientName,
      fiscalYearNumber: consol.ejercicio.number,
      from: consol.from,
      to: consol.to,
      sections: consol.accounts.map((a) => ({
        code: a.code,
        name: a.name,
        saldoInicial: a.saldoInicial,
        rows: a.movements,
        totalDebit: a.totalDebit,
        totalCredit: a.totalCredit,
        saldoFinal: a.saldoFinal,
      })),
    };
  };

  const onMayor = async () => {
    if (!consol?.ejercicio || consol.accounts.length === 0) {
      toast.error('No hay cuentas con movimientos en el ejercicio');
      return;
    }
    setBusy('mayor');
    try {
      const data: MayorExportData = {
        empresaName: clientName,
        fiscalYearNumber: consol.ejercicio.number,
        from: consol.from,
        to: consol.to,
        sections: consol.accounts.map((a) => ({
          code: a.code,
          name: a.name,
          saldoInicial: a.saldoInicial,
          rows: a.movements,
          totalDebit: a.totalDebit,
          totalCredit: a.totalCredit,
          saldoFinal: a.saldoFinal,
        })),
      };
      await exportLibroMayorPdf(data);
      toast.success('Libro Mayor generado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
    } finally {
      setBusy(null);
    }
  };

  const armarDatosInventarios = () =>
    esp && er
      ? {
          empresaName: clientName,
          cuit: clientCuit,
          fiscalYearNumber: esp.fiscalYearNumber,
          periodLabel: esp.periodLabel,
          esp,
          er,
          eepn: eepn ?? null,
          valuation,
        }
      : null;

  const previsualizarMayor = () =>
    previsualizar(
      'mayor',
      'Libro Mayor',
      () => {
        const datos = armarDatosMayor();
        return datos ? exportLibroMayorPdf(datos, { descargar: false }) : null;
      },
      () => void onMayor()
    );

  const previsualizarInventarios = () =>
    previsualizar(
      'inv',
      'Libro Inventarios y Balances',
      () => {
        const datos = armarDatosInventarios();
        return datos
          ? exportLibroInventariosPdf(datos, { descargar: false })
          : null;
      },
      () => void onInventarios()
    );

  const onInventarios = async () => {
    if (!esp || !er) {
      toast.error('Los datos aún se están cargando');
      return;
    }
    setBusy('inv');
    try {
      await exportLibroInventariosPdf({
        empresaName: clientName,
        cuit: clientCuit,
        fiscalYearNumber: esp.fiscalYearNumber,
        periodLabel: esp.periodLabel,
        esp,
        er,
        eepn: eepn ?? null,
        valuation,
      });
      toast.success('Libro Inventarios y Balances generado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
    } finally {
      setBusy(null);
    }
  };

  const items: {
    key: string;
    title: string;
    desc: string;
    onClick: () => Promise<void>;
    extra?: string;
    /** Etiqueta del botón; por defecto PDF. */
    format?: 'PDF' | 'Excel';
    /** Vista previa sin descargar ni guardar. */
    onPreview?: () => Promise<void>;
  }[] = [
    {
      key: 'package',
      title: 'Paquete contable completo (EECC)',
      desc: 'Carátula, ESP, ER, EEPN, Flujo de Efectivo, Nota 3, Anexo I, Anexo II, notas y espacios de firma. Sigue la valuación elegida arriba.',
      onClick: onPackage,
      onPreview: previsualizarPaquete,
      extra: isOwner
        ? 'Se guarda asociado al ejercicio.'
        : 'Solo el Owner puede guardarlo.',
    },
    {
      key: 'mayor',
      title: 'Libro Mayor',
      desc: 'Todas las cuentas con sus movimientos del ejercicio. Una página por cuenta — formato rubricable.',
      onClick: onMayor,
      onPreview: previsualizarMayor,
    },
    {
      key: 'inv',
      title: 'Libro Inventarios y Balances',
      desc: 'Inventario al cierre, ESP, ER y Evolución del Patrimonio Neto. Formato rubricable.',
      onClick: onInventarios,
      onPreview: previsualizarInventarios,
    },
    {
      key: 'estados-excel',
      title: 'Estados nuevos en Excel',
      desc: 'EEPN, Flujo de Efectivo, Nota 3 e Inventario, una hoja por estado y en el orden del documento. Sigue la valuación elegida arriba.',
      onClick: onEstadosExcel,
      extra: 'Para cruzar contra el papel de trabajo.',
      format: 'Excel',
    },
  ];

  return (
    <>
      <ArcaCard>
        <div className="px-5 py-3 border-b border-[var(--arca-border)]">
          <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
            Exportes
          </span>
          {pdfGeneratedAt && (
            <div className="text-[11px] text-[var(--arca-ink-3)] mt-0.5">
              Último paquete guardado:{' '}
              {new Date(pdfGeneratedAt).toLocaleString('es-AR')}
              {pdfGeneratedByName ? ` · ${pdfGeneratedByName}` : ''}
            </div>
          )}
          {!ready && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--arca-ink-3)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando los datos del ejercicio… los exportes se habilitan solos.
            </div>
          )}
        </div>
        <div className="divide-y divide-[var(--arca-border)]">
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--arca-ink)]">
                  {it.title}
                </div>
                <div className="text-[12px] text-[var(--arca-ink-3)] mt-0.5">
                  {it.desc}
                </div>
                {it.extra && (
                  <div className="text-[10.5px] text-[var(--arca-ink-3)] mt-0.5 italic">
                    {it.extra}
                  </div>
                )}
              </div>
              {it.onPreview && (
                <button
                  onClick={() => void it.onPreview!()}
                  disabled={!ready || busy !== null}
                  title={
                    !ready ? 'Cargando los datos del ejercicio…' : undefined
                  }
                  className="shrink-0 text-[12px] px-3 h-8 rounded-[6px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] disabled:opacity-40 flex items-center gap-1.5"
                >
                  {busy === `${it.key}-preview` || (!ready && busy === null) ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  {busy === `${it.key}-preview` ? 'Generando…' : 'Vista previa'}
                </button>
              )}
              <button
                onClick={() => void it.onClick()}
                disabled={!ready || busy !== null}
                title={!ready ? 'Cargando los datos del ejercicio…' : undefined}
                className="shrink-0 text-[12px] px-3 h-8 rounded-[6px] bg-[var(--arca-accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
              >
                {busy === it.key || (!ready && busy === null) ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {busy === it.key
                  ? 'Generando…'
                  : `Descargar ${it.format ?? 'PDF'}`}
              </button>
            </div>
          ))}
        </div>
      </ArcaCard>
      {/* Vista previa de cualquier exporte PDF: el mismo armado que la
          descarga, en un visor. Sin `sandbox` en el iframe — rompe el visor
          de PDF de Chrome. */}
      <Dialog
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o) cerrarPreview();
        }}
      >
        <DialogContent className="sm:max-w-[min(95vw,1100px)] h-[92vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-[var(--arca-border)]">
            <DialogTitle>Vista previa · {preview?.titulo}</DialogTitle>
            <DialogDescription>
              Es exactamente lo que baja «Descargar PDF», sin guardar nada.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <iframe
              src={preview.url}
              title={`Vista previa · ${preview.titulo}`}
              className="flex-1 min-h-0 w-full"
            />
          )}
          <DialogFooter className="px-6 py-3 border-t border-[var(--arca-border)]">
            <button
              onClick={cerrarPreview}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
            >
              Cerrar
            </button>
            <button
              onClick={() => {
                const descargar = preview?.descargar;
                cerrarPreview();
                descargar?.();
              }}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white"
            >
              Descargar PDF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Avisar antes de exportar, no después de abrir el PDF: una variable
          sin dato queda impresa como «{{igj}}» en un documento que se firma. */}
      <AlertDialog
        open={faltantesPdf !== null}
        onOpenChange={(o) => {
          if (!o) setFaltantesPdf(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {faltantesPdf?.length === 1
                ? 'Hay una variable sin dato cargado'
                : `Hay ${faltantesPdf?.length ?? 0} variables sin dato cargado`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Las notas las mencionan pero el ejercicio no tiene esos datos, así
              que en el PDF van a salir impresas tal cual, entre llaves. Podés
              completarlas en «Datos iniciales» y volver a exportar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {faltantesPdf?.map((k) => (
              <span
                key={k}
                className="rounded-[6px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 py-1 font-mono text-[11.5px] text-[var(--arca-ink-2)]"
              >
                {AUDIT_REPORT_VARS.find((v) => v.key === k)?.label ??
                  `{{${k}}}`}
              </span>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFaltantesPdf(null);
                void generarPaquete();
              }}
            >
              Exportar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  journal_entry_created: 'Asiento creado',
  journal_entry_edited: 'Asiento editado',
  journal_entry_voided: 'Asiento anulado',
  period_closed: 'Período cerrado',
  period_reopened: 'Período reabierto',
  fiscal_year_closed: 'Ejercicio cerrado',
  fiscal_year_reopened: 'Ejercicio reabierto',
  account_created: 'Cuenta creada',
  account_deactivated: 'Cuenta desactivada',
  financial_statement_approved: 'EECC aprobados',
  inflation_adjustment_applied: 'Ajuste por inflación aplicado',
  inflation_adjustment_voided: 'Ajuste por inflación anulado',
};

function describeAuditEvent(e: AuditLogEntry): string {
  const d = e.eventData ?? {};
  const parts: string[] = [];
  if (d.number != null) parts.push(`Asiento N°${String(d.number)}`);
  if (d.month != null && d.year != null)
    parts.push(`${MONTH_NAMES[Number(d.month)]} ${String(d.year)}`);
  if (d.fiscalYearNumber != null)
    parts.push(`Ejercicio N°${String(d.fiscalYearNumber)}`);
  if (d.code)
    parts.push(`${String(d.code)}${d.name ? ` ${String(d.name)}` : ''}`);
  if (d.source) parts.push(String(d.source));
  if (d.pendingReview) parts.push('pendiente de revisión');
  if (d.reason) parts.push(`Motivo: ${String(d.reason)}`);
  return parts.join(' · ');
}

function AuditoriaView({ clientId }: { clientId: string }) {
  const [filter, setFilter] = useState<AuditEventType | 'all'>('all');

  const { data: log = [], isLoading } = useQuery({
    queryKey: ['accounting', 'audit-log', clientId, filter],
    queryFn: () =>
      getAuditLog({
        data: {
          clientId,
          eventTypes: filter === 'all' ? undefined : [filter],
        },
      }),
    enabled: !!clientId,
  });

  const isReopen = (t: AuditEventType) =>
    t === 'period_reopened' || t === 'fiscal_year_reopened';
  const isVoid = (t: AuditEventType) => t === 'journal_entry_voided';

  return (
    <ArcaCard>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Log de auditoría
        </span>
        <span className="text-[11px] text-[var(--arca-ink-3)]">
          Acciones sensibles · solo lectura (append-only)
        </span>
        <div className="flex-1" />
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as AuditEventType | 'all')}
        >
          <SelectTrigger size="sm" className="w-52 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los eventos</SelectItem>
            {(Object.keys(AUDIT_EVENT_LABELS) as AuditEventType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {AUDIT_EVENT_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Cargando…
        </div>
      ) : log.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          No hay eventos registrados para este filtro.
        </div>
      ) : (
        <div className="divide-y divide-[var(--arca-border)]">
          {log.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-3 px-5 py-2.5 text-[12px]"
            >
              <span
                className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                style={{
                  background: isVoid(e.eventType)
                    ? 'color-mix(in oklch, oklch(0.55 0.18 25), transparent 88%)'
                    : isReopen(e.eventType)
                      ? 'color-mix(in oklch, oklch(0.55 0.15 50), transparent 88%)'
                      : 'color-mix(in oklch, oklch(0.45 0.04 250), transparent 88%)',
                  color: isVoid(e.eventType)
                    ? 'oklch(0.45 0.18 25)'
                    : isReopen(e.eventType)
                      ? 'oklch(0.45 0.15 50)'
                      : 'oklch(0.40 0.04 250)',
                }}
              >
                {AUDIT_EVENT_LABELS[e.eventType]}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[var(--arca-ink)]">
                  {describeAuditEvent(e) || '—'}
                </span>
                <span className="text-[var(--arca-ink-3)]">
                  {' '}
                  — {e.userName ?? e.userEmail ?? 'sistema'} ·{' '}
                  {new Date(e.createdAt).toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ArcaCard>
  );
}

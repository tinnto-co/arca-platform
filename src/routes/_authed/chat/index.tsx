import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import {
  getAgentConversations,
  deleteConversation,
  searchConversations,
  getConversationMessages,
  getConversation,
  toggleConversationFijado,
  setConversationCompartido,
} from '@/actions/agent';
import { extraerTextoPdf } from '@/actions/scannerAi';
import { OrbeAsistente } from '@/components/agent/orbe';
import { cn } from '@/lib/utils';
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
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { z } from 'zod';

export const Route = createFileRoute('/_authed/chat/')({
  validateSearch: z.object({
    id: z.string().optional(),
  }),
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled =
      modules.find((m) => m.module === 'ai_agent')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: ChatLayout,
});

// ─── Types & helpers ─────────────────────────────────────────────────
/** Forma mínima común a la lista y a la búsqueda de conversaciones. */
type Conv = Awaited<ReturnType<typeof searchConversations>>[number];

/**
 * Agrupa por fecha, con los fijados en su propio bloque arriba. Una conversación
 * fijada no aparece además en su grupo de fecha: estaría dos veces en la misma
 * lista.
 */
function groupByDate(convs: Conv[]): { label: string; items: Conv[] }[] {
  const fijados = convs.filter((c) => c.fijado);
  const resto = convs.filter((c) => !c.fijado);
  const grupos = agruparPorFecha(resto);
  return fijados.length > 0
    ? [{ label: 'Fijados', items: fijados }, ...grupos]
    : grupos;
}

function agruparPorFecha(convs: Conv[]): { label: string; items: Conv[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setDate(today.getDate() - 30);

  const groups: { label: string; items: Conv[] }[] = [
    { label: 'Hoy', items: [] },
    { label: 'Ayer', items: [] },
    { label: '7 dias anteriores', items: [] },
    { label: '30 dias anteriores', items: [] },
    { label: 'Más antiguo', items: [] },
  ];

  for (const c of convs) {
    const d = new Date(c.updatedAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups[0].items.push(c);
    else if (day >= yesterday) groups[1].items.push(c);
    else if (day >= lastWeek) groups[2].items.push(c);
    else if (day >= lastMonth) groups[3].items.push(c);
    else groups[4].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

function formatTime(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => ('text' in p ? p.text : ''))
    .join('');
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```\w*\n?|\n?```$/g, '')
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_]+)_/g, '$1$2')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m.replace(/\s+$/, ' '))
    .replace(/^\s*\|.+\|\s*$/gm, (row) =>
      row
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((c) => c.trim())
        .join(' | ')
    )
    .replace(/^[\s|:-]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatMessageDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (isToday) return time;
  const day = d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  });
  return `${day} · ${time}`;
}

const markdownComponents: React.ComponentProps<
  typeof ReactMarkdown
>['components'] = {
  p: ({ children }) => (
    <p className="mb-2 text-[13px] leading-relaxed text-[var(--arca-ink-2)] last:mb-0">
      {children}
    </p>
  ),
  h1: ({ children }) => (
    <p
      className="mb-1 mt-3 text-[14px] font-semibold text-[var(--arca-ink)] first:mt-0"
      style={{ fontFamily: 'var(--ff-display)' }}
    >
      {children}
    </p>
  ),
  h2: ({ children }) => (
    <p
      className="mb-1 mt-3 text-[13px] font-semibold text-[var(--arca-ink)] first:mt-0"
      style={{ fontFamily: 'var(--ff-display)' }}
    >
      {children}
    </p>
  ),
  h3: ({ children }) => (
    <p
      className="mb-1 mt-2 text-[13px] font-semibold text-[var(--arca-ink)] first:mt-0"
      style={{ fontFamily: 'var(--ff-display)' }}
    >
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 text-[13px] text-[var(--arca-ink-2)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-[13px] text-[var(--arca-ink-2)]">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-[13px] leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--arca-ink)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--arca-accent)] underline underline-offset-2 hover:text-[var(--arca-accent)]"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) =>
    className ? (
      <code
        className="my-2 block overflow-x-auto rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--arca-ink-2)]"
        style={{ fontFamily: 'var(--ff-mono)' }}
      >
        {children}
      </code>
    ) : (
      <code
        className="rounded bg-[var(--arca-surface-2)] px-1 py-0.5 text-[11.5px] text-[var(--arca-ink-2)]"
        style={{ fontFamily: 'var(--ff-mono)' }}
      >
        {children}
      </code>
    ),
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-[var(--arca-r-md)] border border-[var(--arca-border)]">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-3)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--arca-border)] px-3 py-1.5 text-[var(--arca-ink-2)] last:border-b-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-[var(--arca-border)]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--arca-border-strong)] pl-3 text-[13px] italic text-[var(--arca-ink-3)]">
      {children}
    </blockquote>
  ),
};

// ─── Main layout ─────────────────────────────────────────────────────
function ChatLayout() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Default to a new chat if no ID in URL
  const defaultId = useRef(crypto.randomUUID());
  const selectedId = search.id ?? defaultId.current;

  const selectChat = (id: string) => {
    void navigate({ to: '/chat', search: { id }, replace: true });
  };

  const handleNewChat = () => {
    const id = crypto.randomUUID();
    defaultId.current = id;
    void navigate({ to: '/chat', search: { id }, replace: true });
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* ── Sidebar (animated) ── */}
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: sidebarOpen ? 320 : 0 }}
      >
        <div className="w-[320px] h-full">
          <ChatSidebar
            selectedId={selectedId}
            onSelect={selectChat}
            onNewChat={handleNewChat}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 min-w-0 h-full">
        <ChatArea
          key={selectedId}
          id={selectedId}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────
function ChatSidebar({
  selectedId,
  onSelect,
  onNewChat,
  onClose,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['agentConversations'],
    queryFn: () => getAgentConversations({ data: { limit: 100, offset: 0 } }),
  });

  const { data: searchResults } = useQuery({
    queryKey: ['agentSearch', searchTerm],
    queryFn: () => searchConversations({ data: { query: searchTerm.trim() } }),
    enabled: searchTerm.trim().length > 0,
  });

  const fijarMutation = useMutation({
    mutationFn: ({ id, fijado }: { id: string; fijado: boolean }) =>
      toggleConversationFijado({ data: { conversationId: id, fijado } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['agentConversations'] }),
    onError: () => toast.error('No se pudo fijar la conversación'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteConversation({ data: { conversationId: id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentConversations'] });
      setDeleteTarget(null);
    },
  });

  const displayList: Conv[] = searchTerm.trim()
    ? (searchResults ?? [])
    : conversations;

  const grouped = searchTerm.trim() ? null : groupByDate(displayList);

  return (
    <>
      <div className="w-[320px] border-r border-[var(--arca-border)] bg-[var(--arca-surface)] flex flex-col h-full">
        {/* Cabecera: la acción principal y nada más. El rótulo "Chats" no
            hacía falta —la pantalla ya se llama así en el menú— y le robaba
            una fila entera a la lista. */}
        <div className="px-3 pt-3 pb-2.5 border-b border-[var(--arca-border)]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onNewChat}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--arca-accent)] text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[var(--arca-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-accent-ring)] cursor-pointer"
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Nueva conversación
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onClose}
                  aria-label="Cerrar el panel de chats"
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] transition-colors duration-150 hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)] cursor-pointer"
                >
                  <PanelLeftClose className="size-4" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cerrar el panel</TooltipContent>
            </Tooltip>
          </div>

          {/* Buscador, con la misma caja que el resto de la plataforma */}
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--arca-ink-4)]"
              strokeWidth={1.5}
            />
            <input
              placeholder="Buscar en chats"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface-2)] pl-8 pr-3 text-[12.5px] text-[var(--arca-ink)] outline-none transition-colors duration-150 placeholder:text-[var(--arca-ink-4)] focus:border-[var(--arca-accent)] focus:bg-[var(--arca-surface)]"
            />
          </div>
        </div>

        {/* TODO(uso-del-mes): al pie del panel va un medidor de consumo del
            plan ("312 / 1.000"). Queda pendiente porque no existe todavía la
            contabilización de tokens por organización: hace falta registrar el
            consumo de cada run del agente y un tope por plan antes de poder
            mostrar un número que signifique algo. Un contador inventado es
            peor que ninguno. */}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-[12px] text-[var(--arca-ink-4)]">
              Cargando...
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Sparkles className="w-8 h-8 text-[var(--arca-ink-4)] mb-2" />
              <p className="text-[13px] text-[var(--arca-ink-3)]">
                {searchTerm ? 'Sin resultados' : 'Sin conversaciones'}
              </p>
            </div>
          ) : searchTerm.trim() ? (
            <div>
              {displayList.map((conv) => (
                <SidebarItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedId === conv.id}
                  onClick={() => onSelect(conv.id)}
                  onDelete={() => setDeleteTarget(conv.id)}
                  onTogglePin={() =>
                    fijarMutation.mutate({ id: conv.id, fijado: !conv.fijado })
                  }
                />
              ))}
            </div>
          ) : (
            grouped?.map((group) => (
              <div key={group.label}>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                  {group.label}
                </div>
                {group.items.map((conv) => (
                  <SidebarItem
                    key={conv.id}
                    conv={conv}
                    isSelected={selectedId === conv.id}
                    onClick={() => onSelect(conv.id)}
                    onDelete={() => setDeleteTarget(conv.id)}
                    onTogglePin={() =>
                      fijarMutation.mutate({
                        id: conv.id,
                        fijado: !conv.fijado,
                      })
                    }
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar conversación</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la
              conversación y todos sus mensajes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Una conversación en la lista. Sin ícono: en una columna de títulos todos
 * iguales no aportaba nada y corría el texto 22px. Lo que sí distingue es el
 * estado —la abierta va sobre el turquesa suave, la fijada lleva su punto— y
 * el subtítulo, que dice de qué habla y cuándo fue.
 */
function SidebarItem({
  conv,
  isSelected,
  onClick,
  onDelete,
  onTogglePin,
}: {
  conv: Conv;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const subtitulo = [conv.etiqueta, formatTime(conv.updatedAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      onClick={onClick}
      className={cn(
        'group mx-2 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors duration-[120ms]',
        isSelected
          ? 'bg-[var(--arca-accent-info-bg)]'
          : 'hover:bg-[var(--arca-surface-2)]'
      )}
    >
      {conv.fijado && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-[var(--arca-accent-light)]"
        />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-[12.5px] leading-snug',
            isSelected
              ? 'font-semibold text-[var(--arca-ink)]'
              : 'font-medium text-[var(--arca-ink-2)]'
          )}
        >
          {conv.titulo || 'Sin título'}
        </div>
        {subtitulo && (
          <div className="mt-0.5 truncate text-[10.5px] text-[var(--arca-ink-4)]">
            {subtitulo}
          </div>
        )}
      </div>

      {/* Las acciones aparecen al pasar el cursor: en reposo la lista es
          títulos y nada más. */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              aria-label={conv.fijado ? 'Dejar de fijar' : 'Fijar'}
              className="grid size-6 place-items-center rounded-[var(--arca-r-sm)] text-[var(--arca-ink-4)] transition-colors hover:bg-[var(--arca-surface)] hover:text-[var(--arca-ink-2)] cursor-pointer"
            >
              {conv.fijado ? (
                <PinOff className="size-3" strokeWidth={1.5} />
              ) : (
                <Pin className="size-3" strokeWidth={1.5} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {conv.fijado ? 'Dejar de fijar' : 'Fijar arriba'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Eliminar"
              className="grid size-6 place-items-center rounded-[var(--arca-r-sm)] text-[var(--arca-ink-4)] transition-colors hover:bg-[var(--arca-accent-neg-bg)] hover:text-[var(--arca-accent-neg-fg)] cursor-pointer"
            >
              <Trash2 className="size-3" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Eliminar</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────
// ─── Chat area ───────────────────────────────────────────────────────

/** Arranques sugeridos. Sólo en la conversación vacía: una vez que hay hilo,
 *  sugerir preguntas genéricas es ruido. */
const SUGERENCIAS = [
  '¿Qué clientes no sincronizan hace más de 30 días?',
  '¿Qué vencimientos tengo esta semana?',
  '¿Quién facturó más el mes pasado?',
  '¿Hay notificaciones de ARCA sin leer?',
];

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader'));
    reader.readAsDataURL(file);
  });
}

/** El orbe del asistente con el símbolo encima: la misma firma que en el
 *  panel lateral y en el sidebar, para que se lea como el mismo agente. */
function AvatarAgente() {
  return (
    <span className="relative grid size-7 shrink-0 place-items-center">
      <OrbeAsistente size={28} />
      <img
        src="/brand/ordo-symbol-mono-white.svg"
        alt=""
        className="absolute size-[14px]"
      />
    </span>
  );
}

function ChatArea({
  id,
  sidebarOpen,
  onToggleSidebar,
}: {
  id: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [votos, setVotos] = useState<Record<string, 'up' | 'down'>>({});
  const [adjunto, setAdjunto] = useState<{
    nombre: string;
    texto: string;
  } | null>(null);
  const [leyendoPdf, setLeyendoPdf] = useState(false);
  const loadedIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cabecera del hilo: título, etiqueta y si ya está compartido. Devuelve null
  // mientras la conversación no existe todavía en la base (chat nuevo).
  const { data: conv } = useQuery({
    queryKey: ['agentConversation', id],
    queryFn: () => getConversation({ data: { conversationId: id } }),
    retry: false,
  });

  const compartirMutation = useMutation({
    mutationFn: (compartido: boolean) =>
      setConversationCompartido({
        data: { conversationId: id, compartido },
      }),
    onSuccess: async ({ compartido }) => {
      await queryClient.invalidateQueries({
        queryKey: ['agentConversation', id],
      });
      if (!compartido) {
        toast.success('La conversación ya no es visible para el estudio');
        return;
      }
      const url = `${window.location.origin}/chat?id=${id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copiado', {
          description: 'Cualquiera de tu estudio puede leerla con este link.',
        });
      } catch {
        toast.success('Compartida con tu estudio', { description: url });
      }
    },
    onError: () => toast.error('No se pudo compartir'),
  });

  const handleCopy = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(stripMarkdown(text));
      setCopiedId(messageId);
      toast.success('Copiado');
      setTimeout(() => {
        setCopiedId((prev) => (prev === messageId ? null : prev));
      }, 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const chat = useChat({
    id,
    messages: [],
    transport: new DefaultChatTransport({
      api: '/api/agent',
      prepareSendMessagesRequest({ messages }) {
        return {
          body: { message: messages[messages.length - 1], conversationId: id },
          headers: {},
        };
      },
    }),
  } as any);

  const isChatLoading =
    chat.status === 'streaming' || chat.status === 'submitted';

  useEffect(() => {
    if (loadedIdRef.current === id) return;
    loadedIdRef.current = id;
    chat.setMessages([]);

    getConversationMessages({ data: { conversationId: id } })
      .then((dbMessages) => {
        if (loadedIdRef.current !== id) return;
        if (dbMessages.length > 0) {
          // El campo de la base se llama `contenido`, no `content`: leyendo la
          // clave en inglés cada mensaje guardado llegaba con texto vacío y la
          // conversación se veía en blanco al abrirla.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const history: UIMessage[] = dbMessages.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            parts: [{ type: 'text' as const, text: (m.contenido ?? '') as string }],
            createdAt: m.createdAt ?? undefined,
          }));
          chat.setMessages(history);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * Adjuntar es leer: `/api/agent` no recibe archivos, así que el PDF se pasa a
   * texto acá —con el mismo Gemini que usa el escáner de extractos— y ese texto
   * viaja adelante del mensaje. Para el agente es una cita más del contexto.
   */
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const esPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!esPdf) {
      toast.error('Por ahora solo PDF');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error('El archivo supera los 10 MB');
      return;
    }
    setLeyendoPdf(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const { texto } = await extraerTextoPdf({ data: { fileBase64 } });
      setAdjunto({ nombre: file.name, texto });
    } catch {
      toast.error('No se pudo leer el PDF');
    } finally {
      setLeyendoPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const enviar = async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || isChatLoading) return;
    setInput('');
    const conAdjunto = adjunto
      ? `Documento adjunto «${adjunto.nombre}»:\n\n${adjunto.texto}\n\n---\n\n${limpio}`
      : limpio;
    setAdjunto(null);
    await chat.sendMessage({ text: conAdjunto });
    void queryClient.invalidateQueries({ queryKey: ['agentConversations'] });
    void queryClient.invalidateQueries({ queryKey: ['agentConversation', id] });
  };

  /** Reintentar = volver a mandar la última consulta del usuario. */
  const reintentar = () => {
    const ultimoDelUsuario = [...chat.messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!ultimoDelUsuario) return;
    void enviar(getMessageText(ultimoDelUsuario));
  };

  const hasMessages = chat.messages.length > 0 || isChatLoading;
  const soloLectura = conv ? !conv.esPropia : false;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--arca-bg)]">
      {/* ── Cabecera del hilo ──
          Lleva el nombre que el agente le puso a la conversación y su etiqueta.
          El botón de plegar el panel vive acá sólo cuando el panel está
          cerrado: es la única forma de volver a abrirlo. */}
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[var(--arca-border)] bg-[var(--arca-surface)] px-4">
        {!sidebarOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleSidebar}
                aria-label="Abrir el panel de chats"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] transition-colors hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)] cursor-pointer"
              >
                <PanelLeftOpen className="size-4" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Abrir el panel</TooltipContent>
          </Tooltip>
        )}
        <h1
          className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]"
          style={{ fontFamily: 'var(--ff-display)' }}
        >
          {conv?.titulo ?? 'Nueva conversación'}
        </h1>
        {conv?.etiqueta && (
          <span className="shrink-0 rounded-[var(--arca-r-sm)] bg-[var(--arca-accent-info-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--arca-accent-info-fg)]">
            {conv.etiqueta}
          </span>
        )}
        {soloLectura && (
          <span className="shrink-0 text-[11.5px] text-[var(--arca-ink-4)]">
            Compartida con vos · solo lectura
          </span>
        )}
        {conv && conv.esPropia && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => compartirMutation.mutate(!conv.compartido)}
                disabled={compartirMutation.isPending}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors cursor-pointer',
                  conv.compartido
                    ? 'border-[var(--arca-accent)] bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]'
                    : 'border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
                )}
              >
                <Share2 className="size-3.5" strokeWidth={1.5} />
                {conv.compartido ? 'Compartida' : 'Compartir'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {conv.compartido
                ? 'Dejar de compartir con el estudio'
                : 'Cualquiera de tu estudio va a poder leerla'}
            </TooltipContent>
          </Tooltip>
        )}
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent
          className={cn(
            'mx-auto flex w-full max-w-3xl flex-col px-8 pb-44 md:px-12',
            !hasMessages && 'h-full justify-center'
          )}
        >
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center gap-5 text-center">
              <AvatarAgente />
              <div className="space-y-1">
                <h3
                  className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--arca-ink)]"
                  style={{ fontFamily: 'var(--ff-display)' }}
                >
                  ¿En qué puedo ayudarte?
                </h3>
                <p className="text-[13px] text-[var(--arca-ink-3)]">
                  Preguntá sobre tus clientes, vencimientos o balances.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void enviar(s)}
                    className="rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface)] px-3 py-1.5 text-[12.5px] text-[var(--arca-ink-2)] transition-colors hover:border-[var(--arca-accent)] hover:bg-[var(--arca-accent-info-bg)] hover:text-[var(--arca-accent-info-fg)] cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-5">
              {chat.messages.map((message) => {
                const text = getMessageText(message);
                if (!text) return null;
                const createdAt = (
                  message as unknown as { createdAt?: Date | string }
                ).createdAt;

                if (message.role === 'user') {
                  return (
                    <div
                      key={message.id}
                      className="group flex max-w-[78%] flex-col items-end gap-1 self-end"
                    >
                      <div className="rounded-[var(--arca-r-md)] bg-[var(--arca-accent)] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
                        <p className="whitespace-pre-wrap">{text}</p>
                      </div>
                      {createdAt && (
                        <span className="pr-1 text-[10.5px] text-[var(--arca-ink-4)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          {formatMessageDate(createdAt)}
                        </span>
                      )}
                    </div>
                  );
                }

                const isCopied = copiedId === message.id;
                const voto = votos[message.id];
                return (
                  <div key={message.id} className="group flex gap-3">
                    <AvatarAgente />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <div
                        className="w-full text-[13px] leading-relaxed text-[var(--arca-ink-2)]"
                        style={{ fontFamily: 'var(--ff-sans)' }}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {text}
                        </ReactMarkdown>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                        <AccionRespuesta
                          label={isCopied ? 'Copiado' : 'Copiar'}
                          onClick={() => void handleCopy(message.id, text)}
                          activo={isCopied}
                        >
                          {isCopied ? (
                            <Check className="size-3.5" strokeWidth={1.5} />
                          ) : (
                            <Copy className="size-3.5" strokeWidth={1.5} />
                          )}
                        </AccionRespuesta>
                        <AccionRespuesta
                          label="Reintentar"
                          onClick={reintentar}
                          disabled={isChatLoading || soloLectura}
                        >
                          <RotateCcw className="size-3.5" strokeWidth={1.5} />
                        </AccionRespuesta>
                        <AccionRespuesta
                          label="Buena respuesta"
                          activo={voto === 'up'}
                          onClick={() =>
                            setVotos((v) => ({ ...v, [message.id]: 'up' }))
                          }
                        >
                          <ThumbsUp className="size-3.5" strokeWidth={1.5} />
                        </AccionRespuesta>
                        <AccionRespuesta
                          label="Mala respuesta"
                          activo={voto === 'down'}
                          onClick={() =>
                            setVotos((v) => ({ ...v, [message.id]: 'down' }))
                          }
                        >
                          <ThumbsDown className="size-3.5" strokeWidth={1.5} />
                        </AccionRespuesta>
                        {createdAt && (
                          <span className="ml-1.5 text-[10.5px] text-[var(--arca-ink-4)]">
                            {formatMessageDate(createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isChatLoading && (
                <div className="flex items-center gap-3">
                  <AvatarAgente />
                  <span className="text-[12.5px] text-[var(--arca-ink-3)]">
                    Consultando…
                  </span>
                </div>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Compositor ── */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--arca-bg)] via-[var(--arca-bg)] to-transparent px-8 pb-4 pt-10 md:px-12">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          {adjunto && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface)] py-1 pl-2 pr-1 text-[12px] text-[var(--arca-ink-2)]">
              <FileText
                className="size-3.5 shrink-0 text-[var(--arca-ink-4)]"
                strokeWidth={1.5}
              />
              <span className="max-w-[220px] truncate">{adjunto.nombre}</span>
              <button
                onClick={() => setAdjunto(null)}
                aria-label="Quitar el adjunto"
                className="grid size-5 place-items-center rounded-[var(--arca-r-sm)] text-[var(--arca-ink-4)] hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink-2)] cursor-pointer"
              >
                <X className="size-3" strokeWidth={1.5} />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(input);
            }}
            className="rounded-[var(--arca-r-lg)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 py-2.5 shadow-[var(--arca-shadow-md)] focus-within:border-[var(--arca-accent)]"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                // Enter manda, Shift+Enter baja de línea. Es la convención de
                // cualquier chat, y está escrita al pie por si acaso.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void enviar(input);
                }
              }}
              placeholder="Preguntá sobre tus clientes, vencimientos o balances…"
              disabled={isChatLoading || soloLectura}
              autoFocus
              rows={3}
              className="max-h-56 min-h-[72px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-[var(--arca-ink)] outline-none placeholder:text-[var(--arca-ink-4)] disabled:opacity-60"
              style={{ fontFamily: 'var(--ff-sans)' }}
            />

            <div className="mt-1 flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={leyendoPdf || soloLectura}
                    aria-label="Adjuntar PDF"
                    className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] transition-colors hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)] disabled:opacity-50 cursor-pointer"
                  >
                    {leyendoPdf ? (
                      <Loader2
                        className="size-3.5 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <Paperclip className="size-3.5" strokeWidth={1.5} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {leyendoPdf ? 'Leyendo el PDF…' : 'Adjuntar un PDF'}
                </TooltipContent>
              </Tooltip>

              <div className="ml-auto flex items-center gap-2">
                <span className="hidden items-center gap-1 text-[11px] text-[var(--arca-ink-4)] sm:flex">
                  <kbd
                    className="rounded border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-1 py-px text-[10px]"
                    style={{ fontFamily: 'var(--ff-mono)' }}
                  >
                    ⏎
                  </kbd>
                  enviar
                  <span className="mx-0.5 text-[var(--arca-border-strong)]">
                    ·
                  </span>
                  <kbd
                    className="rounded border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-1 py-px text-[10px]"
                    style={{ fontFamily: 'var(--ff-mono)' }}
                  >
                    ⇧⏎
                  </kbd>
                  salto
                </span>
                <button
                  type="submit"
                  disabled={!input.trim() || isChatLoading || soloLectura}
                  aria-label="Enviar"
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--arca-accent)] text-white transition-colors hover:bg-[var(--arca-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <ArrowUp className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </form>

          <p className="mt-1.5 text-center text-[11px] text-[var(--arca-ink-4)]">
            El asistente puede equivocarse. Verificá montos y fechas antes de
            presentar.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Botón chico de la fila de acciones bajo una respuesta. */
function AccionRespuesta({
  label,
  onClick,
  children,
  activo,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  activo?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            'grid size-7 place-items-center rounded-[var(--arca-r-sm)] text-[var(--arca-ink-4)] transition-colors duration-150 hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink-2)] disabled:opacity-40 cursor-pointer',
            activo && 'text-[var(--arca-accent)]'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

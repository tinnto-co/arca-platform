import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Trash2,
  Sparkles,
  Check,
  Copy,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  getAgentConversations,
  deleteConversation,
  searchConversations,
  getConversationMessages,
} from '@/actions/agent';
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
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
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
interface Conv {
  id: string;
  title: string;
  updatedAt: Date | string;
}

function groupByDate(convs: Conv[]): { label: string; items: Conv[] }[] {
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
    <p className="mb-1 mt-3 text-[14px] font-semibold text-[var(--arca-ink)] first:mt-0" style={{ fontFamily: 'var(--ff-display)' }}>{children}</p>
  ),
  h2: ({ children }) => (
    <p className="mb-1 mt-3 text-[13px] font-semibold text-[var(--arca-ink)] first:mt-0" style={{ fontFamily: 'var(--ff-display)' }}>{children}</p>
  ),
  h3: ({ children }) => (
    <p className="mb-1 mt-2 text-[13px] font-semibold text-[var(--arca-ink)] first:mt-0" style={{ fontFamily: 'var(--ff-display)' }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 text-[13px] text-[var(--arca-ink-2)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-[13px] text-[var(--arca-ink-2)]">{children}</ol>
  ),
  li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--arca-ink)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--arca-navy-700)] underline underline-offset-2 hover:text-[var(--arca-navy-600)]">{children}</a>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className="my-2 block overflow-x-auto rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--arca-ink-2)]" style={{ fontFamily: 'var(--ff-mono)' }}>{children}</code>
    ) : (
      <code className="rounded bg-[var(--arca-surface-2)] px-1 py-0.5 text-[11.5px] text-[var(--arca-ink-2)]" style={{ fontFamily: 'var(--ff-mono)' }}>{children}</code>
    ),
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-[var(--arca-r-md)] border border-[var(--arca-border)]">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-3)]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--arca-border)] px-3 py-1.5 text-[var(--arca-ink-2)] last:border-b-0">{children}</td>
  ),
  hr: () => <hr className="my-3 border-[var(--arca-border)]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--arca-border-strong)] pl-3 text-[13px] italic text-[var(--arca-ink-3)]">{children}</blockquote>
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteConversation({ data: { conversationId: id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentConversations'] });
      setDeleteTarget(null);
    },
  });

  const displayList = searchTerm.trim()
    ? ((searchResults as Conv[] | undefined) ?? [])
    : (conversations as Conv[]);

  const grouped = searchTerm.trim() ? null : groupByDate(displayList);

  return (
    <>
      <div className="w-[320px] border-r border-[var(--arca-border)] bg-[var(--arca-surface)] flex flex-col h-full">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-[var(--arca-border)]">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-[16px] font-semibold text-[var(--arca-ink)]"
              style={{ fontFamily: 'var(--ff-display)' }}
            >
              Chats
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onNewChat}
                className="w-[30px] h-[30px] rounded-[8px] border border-[var(--arca-border-strong)] bg-white text-[var(--arca-ink-3)] inline-flex items-center justify-center hover:bg-[var(--arca-surface-2)] transition-colors cursor-pointer"
                title="Nuevo chat"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                className="w-[30px] h-[30px] rounded-[8px] text-[var(--arca-ink-4)] inline-flex items-center justify-center hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink-2)] transition-colors cursor-pointer"
                title="Cerrar panel"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--arca-ink-4)]" />
            <input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-[7px] text-[12.5px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] rounded-[8px] text-[var(--arca-ink)] placeholder:text-[var(--arca-ink-4)] outline-none focus:border-[var(--arca-border-strong)] transition-colors"
            />
          </div>
        </div>

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

function SidebarItem({
  conv,
  isSelected,
  onClick,
  onDelete,
}: {
  conv: Conv;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors duration-[120ms]',
        isSelected
          ? 'bg-[var(--arca-surface-2)] border-l-2 border-l-[var(--arca-navy-900)]'
          : 'hover:bg-[var(--arca-surface-2)] border-l-2 border-l-transparent'
      )}
    >
      <MessagesSquare className={cn(
        'w-3.5 h-3.5 shrink-0',
        isSelected ? 'text-[var(--arca-navy-700)]' : 'text-[var(--arca-ink-4)]'
      )} />
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-[12.5px] truncate',
          isSelected ? 'font-semibold text-[var(--arca-ink)]' : 'font-medium text-[var(--arca-ink-2)]'
        )}>
          {conv.title || 'Sin título'}
        </div>
        <div className="text-[10.5px] text-[var(--arca-ink-4)] mt-0.5">
          {formatTime(conv.updatedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 p-1 rounded-[4px] text-[var(--arca-ink-4)] opacity-0 group-hover:opacity-100 hover:bg-[var(--arca-accent-neg-bg)] hover:text-[var(--arca-accent-neg-fg)] transition-all cursor-pointer"
        title="Eliminar"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────
// ─── Chat area ───────────────────────────────────────────────────────
function ChatArea({ id, sidebarOpen, onToggleSidebar }: { id: string; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);

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

  const isChatLoading = chat.status === 'streaming' || chat.status === 'submitted';

  useEffect(() => {
    if (loadedIdRef.current === id) return;
    loadedIdRef.current = id;
    chat.setMessages([]);

    getConversationMessages({ data: { conversationId: id } })
      .then((dbMessages) => {
        if (loadedIdRef.current !== id) return;
        if (dbMessages.length > 0) {
          const history: UIMessage[] = dbMessages.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            parts: [{ type: 'text' as const, text: m.content }],
            createdAt: m.createdAt ?? undefined,
          }));
          chat.setMessages(history);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || isChatLoading) return;
    setInput('');
    await chat.sendMessage({ text });
    void queryClient.invalidateQueries({ queryKey: ['agentConversations'] });
  };

  const hasMessages = chat.messages.length > 0 || isChatLoading;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--arca-bg)]">
      {/* Toggle sidebar button */}
      {!sidebarOpen && (
        <div className="absolute top-3 left-3 z-10">
          <button
            onClick={onToggleSidebar}
            className="w-[34px] h-[34px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] inline-flex items-center justify-center hover:bg-[var(--arca-surface-2)] transition-colors cursor-pointer shadow-sm"
            title="Abrir panel de chats"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}
      <Conversation className="flex-1">
        <ConversationContent
          className={cn(
            'mx-auto flex w-full max-w-4xl flex-col px-4 pb-40 md:px-8',
            !hasMessages && 'h-full justify-center'
          )}
        >
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)] ring-1 ring-[var(--arca-border)]">
                <Sparkles className="size-5 text-[var(--arca-navy-700)]" />
              </div>
              <div className="space-y-1">
                <h3
                  className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--arca-ink)]"
                  style={{ fontFamily: 'var(--ff-display)' }}
                >
                  ¿En qué puedo ayudarte?
                </h3>
                <p className="text-[13px] text-[var(--arca-ink-3)]">
                  Escribí tu consulta abajo para empezar.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-6">
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
                      className="group flex max-w-[75%] flex-col items-end gap-1 self-end"
                    >
                      <div
                        className="rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--arca-ink)] shadow-[var(--arca-shadow-sm)]"
                        style={{ fontFamily: 'var(--ff-sans)' }}
                      >
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
                return (
                  <div
                    key={message.id}
                    className="flex max-w-[85%] flex-col items-start gap-1 self-start"
                  >
                    <div
                      className="text-[13px] leading-relaxed text-[var(--arca-ink-2)]"
                      style={{ fontFamily: 'var(--ff-sans)' }}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {text}
                      </ReactMarkdown>
                    </div>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => void handleCopy(message.id, text)}
                          aria-label={isCopied ? 'Copiado' : 'Copiar'}
                          className={cn(
                            'inline-flex size-7 items-center justify-center rounded-[var(--arca-r-sm)] text-[var(--arca-ink-4)] transition-colors duration-150 cursor-pointer hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink-2)]',
                            isCopied && 'text-[var(--arca-accent-pos-fg)]'
                          )}
                        >
                          {isCopied ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isCopied ? 'Copiado' : 'Copiar'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}

              {isChatLoading && (
                <div className="self-start flex items-center gap-2 text-[var(--arca-ink-3)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span className="text-xs">Consultando...</span>
                </div>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--arca-bg)] via-[var(--arca-bg)] to-transparent px-3 pb-6 pt-10">
        <PromptInput
          onSubmit={handleSubmit}
          className="pointer-events-auto mx-auto w-full max-w-4xl [&>[data-slot=input-group]]:rounded-[var(--arca-r-lg)] [&>[data-slot=input-group]]:border-[var(--arca-border-strong)] [&>[data-slot=input-group]]:bg-[var(--arca-surface)] [&>[data-slot=input-group]]:shadow-[var(--arca-shadow-md)]"
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Escribí tu consulta..."
            disabled={isChatLoading}
            autoFocus
            className="min-h-[52px] max-h-48 pr-12 text-[13px] placeholder:text-[var(--arca-ink-4)]"
            style={{ fontFamily: 'var(--ff-sans)' }}
          />
          <PromptInputSubmit
            status={chat.status}
            disabled={!input.trim() || isChatLoading}
            className="absolute bottom-2 right-2 bg-[var(--arca-ink)] text-white hover:bg-black"
          />
        </PromptInput>
      </div>
    </div>
  );
}

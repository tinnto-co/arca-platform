import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  deleteConversation,
  getAgentConversations,
  getConversationMessages,
  searchConversations,
} from '@/actions/agent';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/chat/$id')({
  component: ChatPage,
});

const INITIAL_LIMIT = 15;
const PAGE_SIZE = 10;

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
    { label: '7 días anteriores', items: [] },
    { label: '30 días anteriores', items: [] },
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

function ChatPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useRouterState({ select: (s) => s.location });
  const initialMessage = (
    location.state as unknown as Record<string, unknown> | null
  )?.initialMessage as string | undefined;

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Collapsed panel states
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conv[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [chatsPopoverOpen, setChatsPopoverOpen] = useState(false);
  const chatsPopoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat state
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<string | null>(null);
  const initialSentForIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const isLoading = chat.status === 'streaming' || chat.status === 'submitted';

  const loadConversations = useCallback(
    async (reset = false) => {
      const currentOffset = reset ? 0 : offset;
      const limit = reset ? INITIAL_LIMIT : PAGE_SIZE;
      const data = await getAgentConversations({
        data: { limit, offset: currentOffset },
      });
      if (reset) {
        setConversations(data as Conv[]);
        setOffset(INITIAL_LIMIT);
        setHasMore(data.length === INITIAL_LIMIT);
      } else {
        setConversations((prev) => [...prev, ...(data as Conv[])]);
        setOffset((o) => o + PAGE_SIZE);
        setHasMore(data.length === PAGE_SIZE);
      }
    },
    [offset]
  );

  useEffect(() => {
    void loadConversations(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleListScroll = useCallback(async () => {
    const el = listRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setLoadingMore(true);
      await loadConversations(false);
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loadConversations]);

  const refreshConversations = useCallback(async () => {
    const loaded = Math.max(offset, INITIAL_LIMIT);
    const data = await getAgentConversations({
      data: { limit: loaded, offset: 0 },
    });
    setConversations(data as Conv[]);
    setHasMore(data.length === loaded);
  }, [offset]);

  // Close popover on click outside
  useEffect(() => {
    if (!chatsPopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        chatsPopoverRef.current &&
        !chatsPopoverRef.current.contains(e.target as Node)
      ) {
        setChatsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chatsPopoverOpen]);

  // Focus search input when modal opens, reset when closes
  useEffect(() => {
    if (searchModalOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchModalQuery('');
      setSearchResults(null);
    }
  }, [searchModalOpen]);

  // Debounced search against full DB
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchModalQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      void searchConversations({
        data: { query: searchModalQuery.trim() },
      }).then((data) => {
        setSearchResults(data as Conv[]);
        setSearchLoading(false);
      });
    }, 300);
  }, [searchModalQuery]);

  // History load
  useEffect(() => {
    if (loadedIdRef.current === id) return;
    loadedIdRef.current = id;
    chat.setMessages([]);

    getConversationMessages({ data: { conversationId: id } })
      .then((dbMessages) => {
        if (loadedIdRef.current !== id) return;
        if (dbMessages.length > 0) {
          const history: UIMessage[] = dbMessages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            parts: [{ type: 'text' as const, text: m.content }],
            createdAt: m.createdAt ?? undefined,
          }));
          chat.setMessages(history);
        } else if (initialMessage && initialSentForIdRef.current !== id) {
          initialSentForIdRef.current = id;
          void chat.sendMessage({ text: initialMessage });
          void refreshConversations();
        }
      })
      .catch(() => {
        if (loadedIdRef.current !== id) return;
        if (initialMessage && initialSentForIdRef.current !== id) {
          initialSentForIdRef.current = id;
          void chat.sendMessage({ text: initialMessage });
          void refreshConversations();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await chat.sendMessage({ text });
    void refreshConversations();
    void queryClient.invalidateQueries({ queryKey: ['agentConversations'] });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const handleNewConversation = () => {
    setSearchModalOpen(false);
    setChatsPopoverOpen(false);
    void navigate({ to: '/chat/$id', params: { id: crypto.randomUUID() } });
  };

  const handleSelectConversation = (convId: string) => {
    setSearchModalOpen(false);
    setChatsPopoverOpen(false);
    void navigate({ to: '/chat/$id', params: { id: convId } });
  };

  const handleDelete = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    await deleteConversation({ data: { conversationId: convId } });
    await refreshConversations();
    if (convId === id) handleNewConversation();
  };

  const mergedMessages = chat.messages.reduce<
    { role: string; text: string; id: string; createdAt?: Date }[]
  >((acc, message) => {
    const text =
      message.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join('') ?? String((message as any).content ?? '');
    if (!text) return acc;
    const prev = acc[acc.length - 1];
    if (prev?.role === 'assistant' && message.role === 'assistant') {
      prev.text = prev.text + '\n\n' + text;
      return acc;
    }
    return [
      ...acc,
      {
        role: message.role,
        text,
        id: message.id,
        createdAt: (message as unknown as { createdAt?: Date }).createdAt,
      },
    ];
  }, []);

  return (
    <div className="relative flex h-full overflow-hidden bg-background">
      {/* Search modal (visible in both states) */}
      {searchModalOpen && (
        <div
          className="absolute inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSearchModalOpen(false);
          }}
        >
          <div className="flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden mx-4">
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={searchModalQuery}
                onChange={(e) => setSearchModalQuery(e.target.value)}
                placeholder="Buscar chats..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onKeyDown={(e) =>
                  e.key === 'Escape' && setSearchModalOpen(false)
                }
              />
              <button
                onClick={() => setSearchModalOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nuevo chat */}
            {!searchModalQuery && (
              <button
                onClick={handleNewConversation}
                className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
                Nuevo chat
              </button>
            )}

            {/* Conversation list grouped */}
            <div className="max-h-[60vh] overflow-y-auto">
              {searchModalQuery ? (
                <div className="py-1">
                  {searchLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : searchResults?.length === 0 ? (
                    <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                      Sin resultados
                    </p>
                  ) : (
                    (searchResults ?? []).map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent transition-colors',
                          conv.id === id && 'bg-accent'
                        )}
                      >
                        <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{conv.title}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                groupByDate(conversations).map((group) => (
                  <div key={group.label}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent transition-colors',
                          conv.id === id && 'bg-accent'
                        )}
                      >
                        <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{conv.title}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-background transition-all duration-200 md:flex',
          sidebarOpen ? 'w-64' : 'w-12'
        )}
      >
        {sidebarOpen ? (
          <>
            {/* Collapse toggle */}
            <div className="flex items-center justify-end px-3 pt-3 pb-1">
              <button
                onClick={() => setSidebarOpen(false)}
                title="Cerrar panel"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="px-3 pb-1 space-y-1">
              <button
                onClick={handleNewConversation}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <MessageSquarePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                Nuevo chat
              </button>
              <button
                onClick={() => setSearchModalOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                Buscar
              </button>
            </div>

            {/* Recientes label */}
            <p className="px-4 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
              Recientes
            </p>

            {/* List */}
            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
            >
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={cn(
                      'group flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                      conv.id === id && 'bg-accent'
                    )}
                  >
                    <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {conv.title}
                    </p>
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      title="Eliminar"
                      className="ml-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>
                ))}
                {loadingMore && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </div>
                )}
                {conversations.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Sin conversaciones
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Collapsed icon rail */
          <div
            ref={chatsPopoverRef}
            className="relative flex flex-col items-center gap-1 pt-2"
          >
            <button
              onClick={() => setSidebarOpen(true)}
              title="Abrir panel"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <button
              onClick={handleNewConversation}
              title="Nuevo chat"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSearchModalOpen(true)}
              title="Buscar"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setChatsPopoverOpen((v) => !v)}
              title="Chats recientes"
              className={cn(
                'rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground',
                chatsPopoverOpen && 'bg-accent text-foreground'
              )}
            >
              <MessagesSquare className="h-4 w-4" />
            </button>

            {/* Chats popover */}
            {chatsPopoverOpen && (
              <div className="absolute left-full top-[6.5rem] z-40 ml-2 w-64 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-[11px] font-medium text-muted-foreground">
                  Chats recientes
                </p>
                <div className="max-h-72 overflow-y-auto pb-2">
                  {conversations.slice(0, 10).map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent transition-colors',
                        conv.id === id && 'bg-accent'
                      )}
                    >
                      <span className="truncate">{conv.title}</span>
                    </button>
                  ))}
                  {conversations.length === 0 && (
                    <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                      Sin conversaciones
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto pb-28">
          <div className="max-w-4xl mx-auto px-8 py-3">
            {mergedMessages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Sparkles className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Consultame sobre clientes, facturas, vencimientos o sueldos.
                </p>
              </div>
            )}

            <div className="space-y-4">
              {mergedMessages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="max-w-[75%] rounded-2xl bg-[#232c50] px-4 py-2.5 text-sm text-white">
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {msg.text}
                        </p>
                      </div>
                      {msg.createdAt && (
                        <span className="pr-1 text-[10px] text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed text-foreground">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0 text-sm leading-relaxed">
                              {children}
                            </p>
                          ),
                          h1: ({ children }) => (
                            <p className="mb-1 mt-3 text-sm font-semibold first:mt-0">
                              {children}
                            </p>
                          ),
                          h2: ({ children }) => (
                            <p className="mb-1 mt-3 text-sm font-semibold first:mt-0">
                              {children}
                            </p>
                          ),
                          h3: ({ children }) => (
                            <p className="mb-1 mt-2 text-sm font-semibold first:mt-0">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 ml-4 list-disc space-y-0.5 text-sm">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-sm">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-sm">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic">{children}</em>
                          ),
                          code: ({ children, className }) =>
                            className ? (
                              <code className="my-2 block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                                {children}
                              </code>
                            ) : (
                              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                                {children}
                              </code>
                            ),
                          pre: ({ children }) => <>{children}</>,
                          table: ({ children }) => (
                            <div className="my-2 overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="border border-border bg-muted/50 px-2 py-1 text-left font-semibold">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border border-border px-2 py-1">
                              {children}
                            </td>
                          ),
                          hr: () => <hr className="my-3 border-border" />,
                          blockquote: ({ children }) => (
                            <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-sm text-muted-foreground">
                              {children}
                            </blockquote>
                          ),
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Consultando...</span>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Floating input */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent px-3 pb-4 pt-6">
          <form
            onSubmit={handleSubmit}
            className="flex max-w-3xl mx-auto items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-md"
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu consulta... (Enter para enviar, Shift+Enter para nueva línea)"
              rows={1}
              className="min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="shrink-0 rounded-xl bg-[#232c50] p-2 text-white transition-colors hover:bg-[#139ed9] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

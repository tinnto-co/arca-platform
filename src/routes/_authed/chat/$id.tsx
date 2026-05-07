import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
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
import { getConversationMessages } from '@/actions/agent';
import { cn } from '@/lib/utils';

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
    ) // fenced code blocks → solo contenido
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/__([^_]+)__/g, '$1') // bold alt
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // italic *
    .replace(/(^|[^_])_([^_]+)_/g, '$1$2') // italic _
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // imagenes → alt
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // links → texto (url)
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '• ') // listas → bullet
    .replace(/^\s*\d+\.\s+/gm, (m) => m.replace(/\s+$/, ' ')) // listas numeradas: dejar "1. "
    .replace(/^\s*\|.+\|\s*$/gm, (row) =>
      row
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((c) => c.trim())
        .join(' | ')
    ) // tablas → texto separado por |
    .replace(/^[\s|:-]+$/gm, '') // separadores de tabla
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

export const Route = createFileRoute('/_authed/chat/$id')({
  component: ChatPage,
});

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
      className="text-[var(--arca-navy-700)] underline underline-offset-2 hover:text-[var(--arca-navy-600)]"
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

function ChatPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const location = useRouterState({ select: (s) => s.location });
  const initialMessage = (
    location.state as unknown as Record<string, unknown> | null
  )?.initialMessage as string | undefined;

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const initialSentForIdRef = useRef<string | null>(null);

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

  const isLoading = chat.status === 'streaming' || chat.status === 'submitted';

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
          void queryClient.invalidateQueries({
            queryKey: ['agentConversations'],
          });
        }
      })
      .catch(() => {
        if (loadedIdRef.current !== id) return;
        if (initialMessage && initialSentForIdRef.current !== id) {
          initialSentForIdRef.current = id;
          void chat.sendMessage({ text: initialMessage });
          void queryClient.invalidateQueries({
            queryKey: ['agentConversations'],
          });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || isLoading) return;
    setInput('');
    await chat.sendMessage({ text });
    void queryClient.invalidateQueries({ queryKey: ['agentConversations'] });
  };

  const hasMessages = chat.messages.length > 0 || isLoading;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--arca-bg)]">
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
                  Consultame sobre clientes, facturas, vencimientos o sueldos.
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

              {isLoading && (
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
            disabled={isLoading}
            autoFocus
            className="min-h-[52px] max-h-48 pr-12 text-[13px] placeholder:text-[var(--arca-ink-4)]"
            style={{ fontFamily: 'var(--ff-sans)' }}
          />
          <PromptInputSubmit
            status={chat.status}
            disabled={!input.trim() || isLoading}
            className="absolute bottom-2 right-2 bg-[var(--arca-ink)] text-white hover:bg-black"
          />
        </PromptInput>
      </div>
    </div>
  );
}

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  getAgentConversations,
  deleteConversation,
  searchConversations,
} from '@/actions/agent';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
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

export const Route = createFileRoute('/_authed/chat/')({
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled =
      modules.find((m) => m.module === 'ai_agent')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: ChatIndexPage,
});

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
    { label: 'Mas antiguo', items: [] },
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

function ChatIndexPage() {
  const navigate = useNavigate();
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

  const handleNewChat = () => {
    void navigate({ to: '/chat/$id', params: { id: crypto.randomUUID() } });
  };

  const handleSelectChat = (id: string) => {
    void navigate({ to: '/chat/$id', params: { id } });
  };

  const displayList = searchTerm.trim()
    ? ((searchResults as Conv[] | undefined) ?? [])
    : (conversations as Conv[]);

  const grouped = searchTerm.trim() ? null : groupByDate(displayList);

  return (
    <div className="p-4 md:px-[3rem] md:pt-[3rem] md:pb-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--arca-ink)]"
            style={{ fontFamily: 'var(--ff-display)' }}
          >
            Chats
          </h1>
          <p className="text-[13px] text-[var(--arca-ink-3)] mt-0.5">
            Conversaciones con el asistente de Arca
          </p>
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--arca-r-md)] text-[13px] font-semibold bg-[var(--arca-ink)] text-white hover:bg-[var(--arca-navy-700)] transition-colors cursor-pointer"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Nuevo chat
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--arca-ink-4)]" />
        <Input
          placeholder="Buscar conversaciones..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-16 text-center text-[13px] text-[var(--arca-ink-3)]">
          Cargando conversaciones...
        </div>
      ) : displayList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="w-10 h-10 text-[var(--arca-ink-4)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--arca-ink-2)] mb-1">
            {searchTerm ? 'Sin resultados' : 'Sin conversaciones'}
          </p>
          <p className="text-[13px] text-[var(--arca-ink-3)] mb-4">
            {searchTerm
              ? 'Probá con otros términos'
              : 'Iniciá un chat para consultar sobre clientes, facturas o vencimientos'}
          </p>
          {!searchTerm && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 px-4 py-2 rounded-[var(--arca-r-md)] text-[13px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Crear primer chat
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] overflow-hidden">
          {searchTerm.trim() ? (
            /* Flat search results */
            <div className="divide-y divide-[var(--arca-border)]">
              {displayList.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  onClick={() => handleSelectChat(conv.id)}
                  onDelete={() => setDeleteTarget(conv.id)}
                />
              ))}
            </div>
          ) : (
            /* Grouped by date */
            grouped?.map((group) => (
              <div key={group.label}>
                <div className="px-5 pt-3.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] bg-[var(--arca-surface-2)]">
                  {group.label}
                </div>
                <div className="divide-y divide-[var(--arca-border)]">
                  {group.items.map((conv) => (
                    <ConversationRow
                      key={conv.id}
                      conv={conv}
                      onClick={() => handleSelectChat(conv.id)}
                      onDelete={() => setDeleteTarget(conv.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

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
    </div>
  );
}

function ConversationRow({
  conv,
  onClick,
  onDelete,
}: {
  conv: Conv;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[var(--arca-surface-2)] transition-colors"
    >
      <div className="w-8 h-8 rounded-[8px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] inline-flex items-center justify-center shrink-0">
        <MessagesSquare className="w-3.5 h-3.5 text-[var(--arca-ink-3)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--arca-ink)] truncate">
          {conv.title || 'Sin título'}
        </div>
        <div className="text-[11.5px] text-[var(--arca-ink-4)] mt-0.5">
          {formatTime(conv.updatedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 p-1.5 rounded-[var(--arca-r-sm)] text-[var(--arca-ink-4)] opacity-0 group-hover:opacity-100 hover:bg-[var(--arca-accent-neg-bg)] hover:text-[var(--arca-accent-neg-fg)] transition-all cursor-pointer"
        title="Eliminar"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

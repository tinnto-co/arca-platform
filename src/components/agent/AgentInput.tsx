import { ArrowUp, ChevronDown, FileText, Paperclip, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  getMessageCount,
  getPanelState,
  openPanel,
  getPensando,
  subscribeMessageCount,
  subscribePanelState,
  subscribePensando,
  submitMessageToSidebar,
  guardarModo,
  leerModo,
  suscribirModo,
} from '@/components/copilot/copilot-control';
import { useCopilotAttachment } from '@/components/copilot/AttachmentContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OrbeAsistente } from '@/components/agent/orbe';
import { useAtajo } from '@/lib/tecla-modificador';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * La barra flotante tapa la última fila de las tablas largas. Para eso está
 * el FAB: el mismo asistente, reducido a su orbe, corrido a la esquina.
 *
 * El modo se lee con `useSyncExternalStore` y no con un `useEffect`: en SSR no
 * hay localStorage y el snapshot de servidor devuelve el default sin mismatch.
 */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

export function AgentInput() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageCount = useSyncExternalStore(
    subscribeMessageCount,
    getMessageCount,
    () => 0
  );
  const panelState = useSyncExternalStore(
    subscribePanelState,
    getPanelState,
    getPanelState
  );
  const hasConversation = messageCount > 0;
  const { file, setFile, clear } = useCopilotAttachment();
  const inputRef = useRef<HTMLInputElement>(null);
  const atajo = useAtajo('J');
  const pensando = useSyncExternalStore(
    subscribePensando,
    getPensando,
    () => false
  );
  const modo = useSyncExternalStore(
    suscribirModo,
    leerModo,
    () => 'barra' as const
  );

  // ⌘J trae el asistente esté como esté: si está en FAB lo despliega, y en
  // los dos casos deja el cursor donde se escribe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'j' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      guardarModo('barra');
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    setValue('');

    // Try to push the message into the bottom panel (preserves page context).
    const sentToPanel = submitMessageToSidebar(text);
    if (sentToPanel) return;

    // Fallback: if no bridge (e.g. ai_agent module disabled), open /chat.
    const id = crypto.randomUUID();
    navigate({
      to: '/chat/$id',
      params: { id },
      state: { initialMessage: text } as any,
    });
  };

  const handleInputClick = () => {
    // When there's an active conversation and the panel is collapsed, clicking
    // the input expands the panel so the user can see what's there.
    if (hasConversation) openPanel();
  };

  const acceptFile = useCallback(
    async (raw: File) => {
      const isPdf =
        raw.type === 'application/pdf' ||
        raw.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        toast.error('Solo se aceptan archivos PDF');
        return;
      }
      if (raw.size > MAX_BYTES) {
        toast.error('Archivo demasiado grande (máximo 10MB)');
        return;
      }
      try {
        const base64 = await fileToBase64(raw);
        setFile({ name: raw.name, size: raw.size, base64 });
      } catch {
        toast.error('No se pudo leer el archivo');
      }
    },
    [setFile]
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (picked) void acceptFile(picked);
      e.target.value = '';
    },
    [acceptFile]
  );

  const placeholder = hasConversation
    ? 'Continuar conversación con el asistente…'
    : 'Preguntale al asistente sobre tus clientes...';

  // When the bottom panel is open, hide this floating input entirely so the
  // user types into the panel's own input. We unmount instead of just hiding
  // visually; otherwise the hidden <input> still has focus and keystrokes
  // land here instead of the panel's textarea.
  if (panelState.open) return null;

  if (modo === 'fab') {
    return (
      <div className="pointer-events-none absolute right-4 bottom-20 z-10 md:bottom-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              // El orbe abre el chat lateral directamente: no despliega la
              // barra. Y no toca `modo`, así que al cerrar el panel el
              // asistente vuelve a la forma desde la que se lo llamó.
              onClick={() => {
                // Sin puente (módulo de agente apagado) no hay panel que abrir:
                // ahí sí desplegamos la barra, que sabe caer a /chat.
                if (openPanel()) return;
                guardarModo('barra');
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              aria-label="Abrir el asistente"
              className="pointer-events-auto relative grid size-[52px] place-items-center rounded-full bg-[var(--arca-sidebar)] shadow-[var(--arca-shadow-float)] transition-transform duration-150 hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-ring)] focus-visible:outline-none"
            >
              <OrbeAsistente size={18} pensando={pensando} />
              {hasConversation && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-[var(--arca-accent-neg)]"
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Asistente · {atajo}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-0 left-0 right-0 p-3 pb-20 md:pb-3 z-10'
      )}
    >
      <div className="pointer-events-auto mx-auto flex max-w-2xl flex-col gap-2">
        {file && (
          <div
            className="flex items-center gap-2 rounded-lg border border-border bg-white/90 p-2 shadow-sm backdrop-blur-md"
            role="group"
            aria-label="Archivo adjunto"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-xs">
              <span className="truncate font-medium">{file.name}</span>
              <span className="ml-1.5 text-muted-foreground">
                {formatSize(file.size)}
              </span>
            </div>
            <button
              type="button"
              onClick={clear}
              aria-label="Quitar archivo"
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex h-12 items-center gap-2 rounded-full border border-[rgba(14,26,43,0.16)] bg-[var(--arca-surface)] px-4 shadow-[var(--arca-shadow-float-lg)]"
        >
          <OrbeAsistente size={16} pensando={pensando} />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={handleInputClick}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--arca-ink)] outline-none placeholder:text-[var(--arca-ink-3)]"
          />
          {!value && (
            <kbd className="hidden shrink-0 text-[11px] text-[var(--arca-ink-4)] [font-family:var(--ff-mono)] sm:block">
              {atajo}
            </kbd>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => guardarModo('fab')}
                aria-label="Plegar el asistente"
                className="shrink-0 rounded-md p-1.5 text-[var(--arca-ink-3)] transition-colors hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)]"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Plegar — deja de tapar la tabla
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Adjuntar PDF"
                className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] transition-colors hover:bg-[var(--arca-bg)] hover:text-[var(--arca-ink)]"
              >
                <Paperclip className="size-3.5" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Adjuntar PDF</TooltipContent>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={handleFileInput}
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--arca-accent)] text-white transition-colors hover:bg-[var(--arca-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-3.5" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </div>
  );
}

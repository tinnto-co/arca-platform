import { FileText, Paperclip, Send, Sparkles, X } from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  getMessageCount,
  openPanel,
  subscribeMessageCount,
  submitMessageToSidebar,
} from '@/components/copilot/copilot-control';
import { useCopilotAttachment } from '@/components/copilot/AttachmentContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const MAX_BYTES = 10 * 1024 * 1024;

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
  const hasConversation = messageCount > 0;
  const { file, setFile, clear } = useCopilotAttachment();

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return (
    <div className="pointer-events-none sticky bottom-0 left-0 right-0 p-3 pb-20 md:pb-3 z-10">
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
          className="flex items-center gap-2 rounded-xl border border-border bg-white/80 px-4 py-2.5 shadow-lg backdrop-blur-md"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-[#139ed9]" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={handleInputClick}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Adjuntar PDF"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
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
            className="shrink-0 rounded-lg bg-[#232c50] p-1.5 text-white transition-colors hover:bg-[#139ed9] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCopilotAttachment } from './AttachmentContext';

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

export function AttachmentBar() {
  const { file, setFile, clear } = useCopilotAttachment();
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setIsReading(true);
      try {
        const base64 = await fileToBase64(raw);
        setFile({ name: raw.name, size: raw.size, base64 });
      } catch {
        toast.error('No se pudo leer el archivo');
      } finally {
        setIsReading(false);
      }
    },
    [setFile]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) void acceptFile(dropped);
    },
    [acceptFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (picked) void acceptFile(picked);
      e.target.value = '';
    },
    [acceptFile]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="copilot-attachment-area">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={handleFileInput}
        disabled={isReading}
      />

      {file && (
        <div
          className="copilot-attachment-pill flex items-center gap-2 rounded-full border bg-background py-1 pl-2 pr-1 shadow-sm"
          role="group"
          aria-label="Archivo adjunto"
          onMouseDown={(e) => e.nativeEvent.stopImmediatePropagation()}
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

      {!file && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onMouseDown={(e) => e.nativeEvent.stopImmediatePropagation()}
              disabled={isReading}
              aria-label="Adjuntar PDF"
              className={cn(
                'copilot-attach-btn flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60',
                isDragging && 'bg-primary/10 text-primary'
              )}
            >
              {isReading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {isDragging ? 'Soltá el PDF acá' : 'Adjuntar PDF'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useChatContext } from '@copilotkit/react-ui';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
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
  const { open } = useChatContext();
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
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) void acceptFile(dropped);
    },
    [acceptFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
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

  if (!open) return null;

  if (file) {
    return (
      <div
        className="copilot-attachment-bar fixed right-4 bottom-[7.5rem] z-40 w-[24rem] max-w-[calc(100vw-2rem)] rounded-md border bg-background p-2 shadow-md sm:bottom-[6rem]"
        role="group"
        aria-label="Archivo adjunto"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {formatSize(file.size)}
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="Quitar archivo"
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label="Adjuntar PDF"
      className={cn(
        'copilot-attachment-bar fixed right-4 bottom-[7.5rem] z-40 flex w-[24rem] max-w-[calc(100vw-2rem)] cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background p-2 text-xs text-muted-foreground shadow-md transition-colors hover:bg-muted/40 sm:bottom-[6rem]',
        isDragging && 'border-primary bg-primary/5 text-foreground',
        isReading && 'opacity-60'
      )}
    >
      {isReading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Paperclip className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">
        {isReading
          ? 'Leyendo PDF…'
          : isDragging
            ? 'Soltá el PDF acá'
            : 'Arrastrá un PDF o hacé click para adjuntar'}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileInput}
        disabled={isReading}
      />
    </div>
  );
}

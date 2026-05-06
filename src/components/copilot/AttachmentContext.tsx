'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface CopilotAttachment {
  name: string;
  size: number;
  base64: string;
}

interface CopilotAttachmentContextValue {
  file: CopilotAttachment | null;
  setFile: (file: CopilotAttachment | null) => void;
  clear: () => void;
}

const CopilotAttachmentContext =
  createContext<CopilotAttachmentContextValue | null>(null);

let currentAttachmentRef: CopilotAttachment | null = null;

export function getCopilotAttachment(): CopilotAttachment | null {
  return currentAttachmentRef;
}

export function CopilotAttachmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [file, setFileState] = useState<CopilotAttachment | null>(null);

  const setFile = useCallback((next: CopilotAttachment | null) => {
    currentAttachmentRef = next;
    setFileState(next);
  }, []);

  const clear = useCallback(() => {
    currentAttachmentRef = null;
    setFileState(null);
  }, []);

  const value = useMemo(
    () => ({ file, setFile, clear }),
    [file, setFile, clear]
  );

  return (
    <CopilotAttachmentContext.Provider value={value}>
      {children}
    </CopilotAttachmentContext.Provider>
  );
}

export function useCopilotAttachment(): CopilotAttachmentContextValue {
  const ctx = useContext(CopilotAttachmentContext);
  if (!ctx) {
    throw new Error(
      'useCopilotAttachment must be used inside CopilotAttachmentProvider'
    );
  }
  return ctx;
}

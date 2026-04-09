import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { ArrowRight, Building, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface OrgSwitchVisual {
  fromName: string;
  fromLogo: string | null;
  toName: string;
  toLogo: string | null;
}

interface OrgSwitchContextValue {
  runOrgSwitch: (
    visual: OrgSwitchVisual,
    fn: () => Promise<void>
  ) => Promise<void>;
}

const OrgSwitchContext = createContext<OrgSwitchContextValue | null>(null);

function OrgMini({
  label,
  name,
  logo,
}: {
  label: string;
  name: string;
  logo: string | null;
}) {
  const initial = name.trim().slice(0, 2).toUpperCase() || '?';
  return (
    <div className="flex max-w-[130px] flex-col items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-[#232c50]/60">
        {label}
      </span>
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-white shadow-md ring-2 ring-[#139ed9]/15">
        {logo ? (
          <Avatar className="size-16 rounded-lg">
            <AvatarImage src={logo} alt="" className="object-cover" />
            <AvatarFallback className="rounded-lg text-base font-semibold text-[#139ed9]">
              {initial}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Building className="size-8 text-[#139ed9]" />
        )}
      </div>
      <span className="w-full truncate text-center text-xs font-medium text-[#232c50]">
        {name || '—'}
      </span>
    </div>
  );
}

function OrgSwitchOverlay({ visual }: { visual: OrgSwitchVisual }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[#efeeef]/55 px-4 backdrop-blur-[7px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-md flex-col items-center gap-6">
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          <OrgMini
            label="Desde"
            name={visual.fromName}
            logo={visual.fromLogo}
          />

          <div className="flex flex-col items-center gap-3 px-1 pt-6 sm:px-2">
            <div className="flex items-center gap-1">
              <span className="inline-block size-2 animate-bounce rounded-full bg-[#139ed9] [animation-delay:-0.25s]" />
              <span className="inline-block size-2 animate-bounce rounded-full bg-[#139ed9] [animation-delay:-0.12s]" />
              <span className="inline-block size-2 animate-bounce rounded-full bg-[#139ed9]" />
            </div>
          </div>

          <OrgMini label="Hacia" name={visual.toName} logo={visual.toLogo} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Actualizando datos de la cuenta
          </p>
        </div>
      </div>

      <style>{`
        @keyframes org-arrow {
          0%, 100% { transform: translateX(0); opacity: 0.75; }
          50% { transform: translateX(6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function OrgSwitchProvider({ children }: { children: ReactNode }) {
  const [transition, setTransition] = useState<OrgSwitchVisual | null>(null);

  const runOrgSwitch = useCallback(
    async (visual: OrgSwitchVisual, fn: () => Promise<void>) => {
      setTransition(visual);
      try {
        await fn();
      } finally {
        setTransition(null);
      }
    },
    []
  );

  return (
    <OrgSwitchContext.Provider value={{ runOrgSwitch }}>
      {children}
      {transition ? <OrgSwitchOverlay visual={transition} /> : null}
    </OrgSwitchContext.Provider>
  );
}

export function useOrgSwitch() {
  const ctx = useContext(OrgSwitchContext);
  if (!ctx) {
    throw new Error('useOrgSwitch must be used within OrgSwitchProvider');
  }
  return ctx;
}

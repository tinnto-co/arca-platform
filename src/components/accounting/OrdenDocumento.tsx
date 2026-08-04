/**
 * Orden del documento de Estados Contables.
 *
 * El pedido era poder decidir en qué posición cae cada nota antes de exportar.
 * La lista incluye también los estados y los anexos porque es lo que describió
 * el contador: «hay una nota, después viene otro estado contable, después
 * viene un anexo». Y porque cuando la normativa vuelva a cambiar —va a
 * cambiar— reordenar una lista es más barato que tocar el código.
 *
 * Los anexos además se renombran acá: en el balance del estudio el «Anexo I»
 * es el costo de mercadería vendida y el de bienes de uso va sin número, así
 * que el rótulo no se puede deducir.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { saveFinancialStatementNotes, type FsNote } from '@/actions/accounting';
import { ArcaCard } from '@/components/dashboard/shared';
import {
  DEFAULT_SECTION_LABELS,
  defaultDocumentLayout,
  resolveDocumentLayout,
  type LayoutEntry,
  type SystemSectionKey,
} from '@/lib/accounting-document';

/** Anexos: son los únicos cuyo rótulo el contador necesita cambiar. */
const RENOMBRABLES: SystemSectionKey[] = ['anexo_i', 'anexo_ii', 'anexo_cmv'];

export function OrdenDocumento({
  clientId,
  fiscalYearId,
  notes,
  layout: initialLayout,
  sectionLabels: initialLabels,
  canEdit,
  onSaved,
}: {
  clientId: string;
  fiscalYearId: string;
  notes: FsNote[];
  layout: LayoutEntry[];
  sectionLabels: Record<string, string>;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [layout, setLayout] = useState<LayoutEntry[]>(
    initialLayout.length > 0 ? initialLayout : defaultDocumentLayout(notes)
  );
  const [labels, setLabels] =
    useState<Record<string, string>>(initialLabels);

  const secciones = resolveDocumentLayout(layout, notes, labels);
  const orden = secciones.map((s) => s.entry);
  const dirty =
    JSON.stringify(orden) !== JSON.stringify(initialLayout) ||
    JSON.stringify(labels) !== JSON.stringify(initialLabels);

  const save = useMutation({
    mutationFn: () =>
      saveFinancialStatementNotes({
        data: {
          clientId,
          fiscalYearId,
          notes,
          layout: orden,
          sectionLabels: labels,
        },
      }),
    onSuccess: () => {
      toast.success('Orden del documento guardado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Mueve sobre la secuencia ya resuelta: es lo que el contador está viendo. */
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= orden.length) return;
    const next = [...orden];
    [next[idx], next[j]] = [next[j], next[idx]];
    setLayout(next);
  };

  const reset = () => {
    setLayout(defaultDocumentLayout(notes));
    setLabels({});
  };

  return (
    <ArcaCard>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[var(--arca-border)]">
        <div>
          <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
            Orden del documento
          </div>
          <div className="text-[11.5px] text-[var(--arca-ink-3)] mt-0.5">
            Define en qué posición sale cada sección en el PDF y en el Excel.
            Las notas se numeran por su posición.
          </div>
        </div>
        <div className="flex-1" />
        {canEdit && (
          <>
            <button
              onClick={reset}
              className="text-[12px] px-3 h-7 rounded-[6px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5 hover:bg-[var(--arca-surface-2)]"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
              Orden por defecto
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="text-[12px] px-3 h-7 rounded-[6px] bg-[var(--arca-ink)] text-white disabled:opacity-40"
            >
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        )}
      </div>

      <div className="divide-y divide-[var(--arca-border)]">
        {secciones.map((sec, idx) => {
          const key = sec.entry as SystemSectionKey;
          const renombrable = canEdit && RENOMBRABLES.includes(key);
          return (
            <div key={sec.entry} className="flex items-center gap-3 px-5 py-2">
              <span className="w-6 text-[11px] text-[var(--arca-ink-3)] tabular-nums shrink-0">
                {idx + 1}
              </span>
              <span className="w-10 shrink-0 text-[11px] text-[var(--arca-ink-3)]">
                {sec.noteNumber != null ? `Nota ${sec.noteNumber}` : ''}
              </span>
              {renombrable ? (
                <input
                  value={labels[key] ?? ''}
                  placeholder={DEFAULT_SECTION_LABELS[key]}
                  onChange={(e) =>
                    setLabels((l) => ({ ...l, [key]: e.target.value }))
                  }
                  className="flex-1 h-7 px-2 text-[12.5px] rounded-[6px] border border-[var(--arca-border)] bg-transparent"
                />
              ) : (
                <span className="flex-1 text-[12.5px] text-[var(--arca-ink)]">
                  {sec.label}
                </span>
              )}
              <span className="text-[10.5px] text-[var(--arca-ink-3)] w-16 text-right shrink-0">
                {sec.isNote ? 'nota' : sec.isSystem ? 'sección' : ''}
              </span>
              {canEdit && (
                <>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    title="Subir"
                    className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === secciones.length - 1}
                    title="Bajar"
                    className="text-[12px] px-1.5 h-6 rounded-[5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] disabled:opacity-30"
                  >
                    ↓
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-[var(--arca-border)] text-[11.5px] text-[var(--arca-ink-3)]">
        Los anexos se pueden renombrar: dejalos en blanco para usar el nombre
        propuesto. Una sección sin datos no se imprime, esté donde esté.
      </div>
    </ArcaCard>
  );
}

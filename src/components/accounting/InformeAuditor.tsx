/**
 * Informe del auditor de un balance.
 *
 * El informe es casi todo texto normativo idéntico entre empresas, así que se
 * arma en dos pasos: se elige una plantilla del estudio y el sistema rellena
 * las variables con los datos de la empresa y del ejercicio. Lo rellenado queda
 * editable, porque hay párrafos que ninguna plantilla puede adivinar —una
 * salvedad, el pasivo con el SIPA—.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  listAuditReportTemplates,
  saveAuditReport,
  saveAuditReportTemplate,
} from '@/actions/accounting';
import { ArcaCard } from '@/components/dashboard/shared';
import {
  AUDIT_REPORT_DEFAULT,
  AUDIT_REPORT_VARS,
  fillAuditReport,
  missingVars,
  type AuditReportVars,
} from '@/lib/accounting-audit-report';

export function InformeAuditor({
  clientId,
  fiscalYearId,
  saved,
  vars,
  canEdit,
  onSaved,
}: {
  clientId: string;
  fiscalYearId: string;
  saved: { body: string; lugar: string; fecha: string } | null;
  /** Datos de la empresa y del ejercicio con los que se rellena la plantilla. */
  vars: Partial<AuditReportVars>;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: plantillas = [] } = useQuery({
    queryKey: ['accounting', 'audit-templates'],
    queryFn: () => listAuditReportTemplates(),
  });

  const [body, setBody] = useState(saved?.body ?? '');
  const [lugar, setLugar] = useState(
    saved?.lugar ?? 'Ciudad Autónoma de Buenos Aires'
  );
  const [fecha, setFecha] = useState(saved?.fecha ?? vars.fecha ?? '');
  const [preview, setPreview] = useState(!canEdit);
  const [nuevoNombre, setNuevoNombre] = useState('');

  const faltantes = useMemo(() => missingVars(body, vars), [body, vars]);
  const dirty =
    body !== (saved?.body ?? '') ||
    lugar !== (saved?.lugar ?? 'Ciudad Autónoma de Buenos Aires') ||
    fecha !== (saved?.fecha ?? vars.fecha ?? '');

  const guardar = useMutation({
    mutationFn: () =>
      saveAuditReport({
        data: { clientId, fiscalYearId, body, lugar, fecha },
      }),
    onSuccess: () => {
      toast.success('Informe del auditor guardado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarPlantilla = useMutation({
    mutationFn: () =>
      saveAuditReportTemplate({
        data: {
          name: nuevoNombre.trim(),
          // Se guarda el texto tal como está: si el contador dejó variables
          // sin rellenar, son justamente las que hacen a la plantilla.
          body,
          isDefault: plantillas.length === 0,
        },
      }),
    onSuccess: () => {
      toast.success(`Plantilla «${nuevoNombre.trim()}» guardada`);
      setNuevoNombre('');
      void qc.invalidateQueries({
        queryKey: ['accounting', 'audit-templates'],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Trae una plantilla y le mete los datos de esta empresa y este ejercicio. */
  const aplicar = (plantilla: string) => {
    setBody(fillAuditReport(plantilla, { ...vars, lugar, fecha }));
    setPreview(false);
  };

  return (
    <ArcaCard>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[var(--arca-border)]">
        <FileText
          className="w-4 h-4 text-[var(--arca-ink-3)]"
          strokeWidth={1.8}
        />
        <div>
          <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
            Informe del auditor
          </div>
          <div className="text-[11.5px] text-[var(--arca-ink-3)]">
            Se arma desde una plantilla del estudio y se rellena con los datos
            de la empresa.
          </div>
        </div>
        <div className="flex-1" />
        {canEdit && (
          <>
            <button
              onClick={() => setPreview((p) => !p)}
              className="text-[12px] px-3 h-7 rounded-[6px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]"
            >
              {preview ? 'Editar' : 'Vista'}
            </button>
            <button
              onClick={() => guardar.mutate()}
              disabled={!dirty || guardar.isPending || body.trim() === ''}
              className="text-[12px] px-3 h-7 rounded-[6px] bg-[var(--arca-ink)] text-white disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={2} />
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]/40">
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            Plantilla:
          </span>
          {plantillas.map((p) => (
            <button
              key={p.id}
              onClick={() => aplicar(p.body)}
              className="text-[12px] px-2.5 h-7 rounded-[6px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface)]"
            >
              {p.name}
              {p.isDefault && (
                <span className="ml-1 text-[10px] text-[var(--arca-ink-3)]">
                  · por defecto
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => aplicar(AUDIT_REPORT_DEFAULT)}
            className="text-[12px] px-2.5 h-7 rounded-[6px] border border-dashed border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)]"
            title="Modelo RT 37 con opinión favorable"
          >
            Modelo estándar (RT 37)
          </button>
          <div className="flex-1" />
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Guardar el texto actual como plantilla…"
            className="h-7 px-2 w-64 text-[12px] rounded-[6px] border border-[var(--arca-border)] bg-transparent"
          />
          <button
            onClick={() => guardarPlantilla.mutate()}
            disabled={
              nuevoNombre.trim() === '' ||
              body.trim() === '' ||
              guardarPlantilla.isPending
            }
            className="text-[12px] px-2.5 h-7 rounded-[6px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] disabled:opacity-40"
          >
            Guardar plantilla
          </button>
        </div>
      )}

      {faltantes.length > 0 && (
        <div className="flex items-start gap-2 px-5 py-2.5 border-b border-[var(--arca-border)] bg-amber-50 text-[12px] text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-px shrink-0" strokeWidth={1.9} />
          <div>
            Quedaron variables sin completar:{' '}
            <span className="font-mono">
              {faltantes.map((v) => `{{${v}}}`).join(' ')}
            </span>
            . Se imprimen tal cual, así no pasan desapercibidas.
          </div>
        </div>
      )}

      <div className="px-5 py-4">
        {preview ? (
          <div className="text-[13px] text-[var(--arca-ink-2)] max-w-[80ch] [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:text-center [&_h1]:my-3 [&_h2]:text-[13.5px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:mt-3 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_strong]:font-semibold">
            {body.trim() ? (
              <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
            ) : (
              <span className="text-[var(--arca-ink-3)] italic">
                Todavía no hay informe. Elegí una plantilla arriba.
              </span>
            )}
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={26}
            placeholder="Elegí una plantilla o escribí el informe acá. Formato Markdown."
            className="w-full text-[12.5px] font-mono leading-relaxed bg-transparent outline-none resize-y border border-[var(--arca-border)] rounded-[8px] p-3"
          />
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-4 px-5 py-3 border-t border-[var(--arca-border)]">
          <label className="text-[11.5px] text-[var(--arca-ink-3)]">
            Lugar
            <input
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              className="block mt-1 h-7 px-2 w-64 text-[12.5px] rounded-[6px] border border-[var(--arca-border)] bg-transparent text-[var(--arca-ink)]"
            />
          </label>
          <label className="text-[11.5px] text-[var(--arca-ink-3)]">
            Fecha del informe
            <input
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              placeholder="03 de mayo de 2026"
              className="block mt-1 h-7 px-2 w-52 text-[12.5px] rounded-[6px] border border-[var(--arca-border)] bg-transparent text-[var(--arca-ink)]"
            />
          </label>
          <p className="text-[11px] text-[var(--arca-ink-3)] flex-1 min-w-[16rem]">
            La fecha aparece al pie del informe y en la leyenda de cada estado:
            «el informe del auditor se extiende en documento aparte».
          </p>
        </div>
      )}

      {canEdit && !preview && (
        <div className="px-5 py-3 border-t border-[var(--arca-border)] text-[11px] text-[var(--arca-ink-3)]">
          Variables disponibles:{' '}
          {AUDIT_REPORT_VARS.map((v) => (
            <span key={v.key} className="font-mono mr-2 whitespace-nowrap">
              {`{{${v.key}}}`}
            </span>
          ))}
        </div>
      )}
    </ArcaCard>
  );
}

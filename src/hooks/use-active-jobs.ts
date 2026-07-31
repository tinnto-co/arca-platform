import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getActiveJobsSummary, type ActiveJobRow } from '@/actions/job';

/**
 * Polls active scraper jobs for the org and emits completion toasts when
 * jobs observed as active disappear (finished/failed). Shared by the
 * clients table and the global indicator (React Query dedupes the request
 * by queryKey).
 */
export function useActiveJobs() {
  const queryClient = useQueryClient();
  // jobId -> job. null = aún no sembrado (primer poll tras montar).
  const prevActiveRef = useRef<Map<string, ActiveJobRow> | null>(null);

  const { data } = useQuery({
    queryKey: ['activeJobsSummary'],
    queryFn: () => getActiveJobsSummary(),
    // 5s con jobs activos; 30s idle para captar jobs lanzados desde otra tab.
    refetchInterval: (query) =>
      (query.state.data?.active.length ?? 0) > 0 ? 5000 : 30000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!data) return;

    const newActive = new Map(data.active.map((j) => [j.id, j]));

    // Primer poll: sembrar sin toasts (evita toasts retroactivos tras reload).
    if (prevActiveRef.current === null) {
      prevActiveRef.current = newActive;
      return;
    }

    const prevActive = prevActiveRef.current;
    prevActiveRef.current = newActive;

    // Jobs que estaban activos y desaparecieron → terminaron.
    const disappeared = [...prevActive.values()].filter(
      (j) => !newActive.has(j.id)
    );
    if (disappeared.length === 0) return;

    const finishedById = new Map(data.recentlyFinished.map((j) => [j.id, j]));

    // Agrupar por credencial para no spamear toasts.
    const byRep = new Map<
      string,
      {
        name: string;
        finished: number;
        failed: number;
        failedReason: string | null;
      }
    >();
    for (const j of disappeared) {
      const final = finishedById.get(j.id);
      const entry = byRep.get(j.credencialId) ?? {
        name: j.credencialNombre ?? 'Cliente',
        finished: 0,
        failed: 0,
        failedReason: null,
      };
      if (final?.status === 'failed') {
        entry.failed += 1;
        entry.failedReason = entry.failedReason ?? final.failedReason;
      } else {
        entry.finished += 1;
      }
      byRep.set(j.credencialId, entry);
    }

    const entries = [...byRep.values()];
    const totalFailed = entries.reduce((acc, e) => acc + e.failed, 0);

    if (entries.length > 3) {
      // Muchos clientes terminaron en el mismo tick → un solo toast agregado.
      if (totalFailed > 0) {
        toast.error(
          `${entries.length} clientes actualizados (${totalFailed} módulos con error)`
        );
      } else {
        toast.success(`${entries.length} clientes actualizados`);
      }
    } else {
      for (const e of entries) {
        const total = e.finished + e.failed;
        const modulos = total === 1 ? 'módulo' : 'módulos';
        if (e.failed > 0) {
          toast.error(
            `${e.name}: ${e.failed} de ${total} ${modulos} con error`,
            e.failedReason ? { description: e.failedReason } : undefined
          );
        } else {
          toast.success(
            `${e.name}: actualización completada (${total} ${modulos})`
          );
        }
      }
    }

    // Refrescar datos que dependen de los jobs terminados.
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  }, [data, queryClient]);

  // Mapa de jobs activos indexado por credencial de AFIP (el job corre sobre
  // un login, no sobre un cliente).
  const activeByRepresentative = useMemo(() => {
    const map = new Map<string, ActiveJobRow[]>();
    for (const j of data?.active ?? []) {
      const list = map.get(j.credencialId);
      if (list) list.push(j);
      else map.set(j.credencialId, [j]);
    }
    return map;
  }, [data]);

  return {
    activeJobs: data?.active ?? [],
    activeByRepresentative,
  };
}

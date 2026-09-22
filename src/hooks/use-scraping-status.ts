/**
 * ¿El scrapper está en pausa global (SCRAPING_PAUSED, ej. sin créditos de
 * proxy)? Los botones de «actualizar» se deshabilitan con esto — disparar un
 * job que va a fallar solo ensucia. Cacheado: el estado es global y cambia
 * poco; el 503 defensivo cubre la carrera entre el load y el click.
 */
import { useQuery } from '@tanstack/react-query';
import { getScrapingStatus } from '@/actions/job';

export const AVISO_SCRAPING_PAUSADO =
  'Actualizaciones en pausa temporal — se reanudan pronto';

export function useScrapingPausado(): boolean {
  const { data } = useQuery({
    queryKey: ['scraping-status'],
    queryFn: () => getScrapingStatus(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  return data?.scrapingPaused ?? false;
}

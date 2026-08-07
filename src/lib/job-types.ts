import type { JobType } from '@/actions/job';

/** Labels legibles para los tipos de job del scrapper. */
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  deuda: 'Deuda',
  vencimientos: 'Vencimientos',
  notificaciones: 'Notificaciones',
  comprobantes: 'Comprobantes',
  comprobantes_full: 'Comprobantes (full)',
  iva: 'IVA',
  escalas: 'Escalas salariales',
};

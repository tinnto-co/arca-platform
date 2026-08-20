import type { listTareas } from '@/actions/tareas';

export type TareaConDetalle = Awaited<ReturnType<typeof listTareas>>[number];

export type TipoTarea = 'iva' | 'iibb' | 'ddjj' | 'sueldos' | 'convenios' | 'otro';

export const TIPO_LABELS: Record<string, string> = {
  iva: 'IVA',
  iibb: 'IIBB',
  ddjj: 'DDJJ',
  sueldos: 'Sueldos',
  convenios: 'Convenios',
  otro: 'Otro',
};

export const TIPO_COLORS: Record<string, string> = {
  iva: 'bg-blue-100 text-blue-700 border-blue-200',
  iibb: 'bg-purple-100 text-purple-700 border-purple-200',
  ddjj: 'bg-orange-100 text-orange-700 border-orange-200',
  sueldos: 'bg-green-100 text-green-700 border-green-200',
  convenios: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  otro: 'bg-gray-100 text-gray-600 border-gray-200',
};


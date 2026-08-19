import type { listTareas } from '@/actions/tareas';

export type TareaConDetalle = Awaited<ReturnType<typeof listTareas>>[number];

export type TipoTarea = 'iva' | 'iibb' | 'ddjj' | 'sueldos' | 'convenios' | 'otro';
export type EstadoTarea = 'pendiente' | 'presentada' | 'verificada';

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

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  presentada: 'Presentada',
  verificada: 'Verificada',
};

export const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'text-amber-600',
  presentada: 'text-blue-600',
  verificada: 'text-green-600',
};

export const ESTADO_BG: Record<string, string> = {
  pendiente: 'bg-amber-50 border-amber-200',
  presentada: 'bg-blue-50 border-blue-200',
  verificada: 'bg-green-50 border-green-200',
};

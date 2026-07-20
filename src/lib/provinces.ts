/**
 * Catálogo canónico de provincias tal como se guardan en
 * `fiscal_entity.province` e `invoice.receipt_province`
 * (formato estilo Nosis, sin acentos — mismo mapeo que usa el
 * padrón AFIP en arca-scrapper).
 */
export const PROVINCE_LABELS = [
  'Capital Federal',
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Cordoba',
  'Corrientes',
  'Entre Rios',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquen',
  'Rio Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucuman',
] as const;

export type ProvinceLabel = (typeof PROVINCE_LABELS)[number];

export const PROVINCE_SOURCE_LABELS: Record<string, string> = {
  padron: 'Padrón AFIP',
  nosis: 'Nosis',
  manual: 'Manual',
};

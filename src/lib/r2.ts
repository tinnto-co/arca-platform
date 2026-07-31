import { createHash } from 'node:crypto';
// `import type` a propósito: el SSR de `vite dev` corre sobre Node y un import
// real del módulo `bun` tira abajo la app entera al arrancar. El cliente se
// instancia desde el global `Bun`, que existe en producción (`bun server.ts`)
// y en los scripts.
import type { S3Client } from 'bun';

/**
 * Almacenamiento de archivos en Cloudflare R2.
 *
 * Regla del proyecto: NUNCA guardar archivos en base64 en la base de datos.
 * En la DB va la `storage_key` (la ruta dentro del bucket), no una URL:
 * el bucket es privado y las URLs firmadas vencen.
 */

const env = {
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET,
};

let client: S3Client | null = null;

export const isConfigured = (): boolean =>
  Boolean(env.accessKeyId && env.secretAccessKey && env.endpoint && env.bucket);

const getClient = (): S3Client => {
  if (client) return client;
  if (!isConfigured()) {
    throw new Error(
      'R2 no está configurado: faltan R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET'
    );
  }
  if (typeof Bun === 'undefined') {
    throw new Error(
      'R2 necesita el runtime de Bun (el SSR de vite dev corre sobre Node)'
    );
  }
  client = new Bun.S3Client({
    accessKeyId: env.accessKeyId!,
    secretAccessKey: env.secretAccessKey!,
    endpoint: env.endpoint!,
    bucket: env.bucket!,
  });
  return client;
};

/** Deja sólo caracteres seguros para una key de S3/R2. */
const slug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sin-nombre';

/** Extensión a partir del nombre original o del mime type. */
export const extensionFor = (
  name: string | null,
  mimeType: string | null
): string => {
  const fromName = name?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const byMime: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/csv': 'csv',
    'application/xml': 'xml',
    'application/json': 'json',
  };
  return byMime[mimeType ?? ''] ?? 'bin';
};

/**
 * documentos/{orgId}/{clienteId}/{YYYY}/{MM}/{documentId}.{ext}
 * Sin cliente identificado: documentos/{orgId}/_sin-cliente/{credencialId}/...
 */
export const documentKey = (params: {
  orgId: string;
  clienteId?: string | null;
  credencialId?: string | null;
  documentId: string;
  fecha?: Date;
  extension: string;
}): string => {
  const fecha = params.fecha ?? new Date();
  const year = String(fecha.getUTCFullYear());
  const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const scope = params.clienteId
    ? slug(params.clienteId)
    : `_sin-cliente/${slug(params.credencialId ?? 'desconocido')}`;
  return `documentos/${slug(params.orgId)}/${scope}/${year}/${month}/${params.documentId}.${params.extension}`;
};

/** firmas/{orgId}/empleador/{clienteId}.{ext} */
export const firmaEmpleadorKey = (
  orgId: string,
  clientId: string,
  extension: string
): string => `firmas/${slug(orgId)}/empleador/${slug(clientId)}.${extension}`;

/** firmas/{orgId}/contador/{firmanteId}.{ext} */
export const firmaContadorKey = (
  orgId: string,
  firmanteId: string,
  extension: string
): string => `firmas/${slug(orgId)}/contador/${slug(firmanteId)}.${extension}`;

/** eecc/{orgId}/{clienteId}/{ejercicioId}.pdf */
export const eeccKey = (
  orgId: string,
  clientId: string,
  ejercicioId: string
): string => `eecc/${slug(orgId)}/${slug(clientId)}/${slug(ejercicioId)}.pdf`;

export const upload = async (
  key: string,
  data: Buffer | Uint8Array,
  mimeType?: string
): Promise<void> => {
  await getClient()
    .file(key)
    .write(data, mimeType ? { type: mimeType } : undefined);
};

export const download = async (key: string): Promise<Buffer> =>
  Buffer.from(await getClient().file(key).arrayBuffer());

export const exists = async (key: string): Promise<boolean> =>
  getClient().file(key).exists();

export const remove = async (key: string): Promise<void> => {
  await getClient().file(key).delete();
};

/** URL firmada temporal. Sólo para casos donde no podemos proxear el archivo. */
export const presign = (key: string, expiresInSeconds = 300): string =>
  getClient().file(key).presign({ expiresIn: expiresInSeconds });

/** SHA-256 en hex, para deduplicar y verificar integridad. */
export const checksum = (data: Buffer | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

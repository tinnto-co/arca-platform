/**
 * Sube a R2 los documentos que el ETL D6 dejó sin `storage_key`.
 *
 * El binario no está en BD_IDEAL: el ETL sólo copió metadatos (nombre, mime real,
 * tamaño, checksum). Los bytes siguen en base64 en NEW_DB (`document.url`), así que
 * este script los lee de ahí — **sin escribir nada en NEW_DB** — y guarda la key
 * resultante en `documento.storage_key` de BD_IDEAL.
 *
 * Es idempotente: sólo toma las filas con storage_key null.
 *
 *   bun src/scripts/ideal/subir-documentos-r2.ts            # dry-run
 *   bun src/scripts/ideal/subir-documentos-r2.ts --apply    # sube y actualiza BD_IDEAL
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import * as r2 from '../../lib/r2';

const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(
  process.env.HOME!,
  'Desktop/tinnto/ARCA/backups/documentos-base64-20260730'
);

const idealUrl = process.env.IDEAL_DATABASE_URL!;
if (!/localhost|127\.0\.0\.1/.test(idealUrl)) {
  throw new Error(`IDEAL_DATABASE_URL no es local: ${idealUrl}`);
}
const ideal = postgres(idealUrl, { max: 1 });
// Origen de los bytes. Sólo lectura.
const origen = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

interface Doc {
  id: string;
  org_id: string;
  credencial_id: string;
  cliente_id: string | null;
  nombre: string;
  mime_type: string;
  checksum: string | null;
  created_at: Date;
}

const main = async () => {
  if (!r2.isConfigured())
    throw new Error('Faltan las variables R2_* en el entorno');

  const docs: Doc[] = await ideal`
    select id, org_id, credencial_id, cliente_id, nombre, mime_type, checksum, created_at
      from documento
     where storage_key is null
     order by created_at
  `;
  console.log(
    `${docs.length} documentos sin subir${APPLY ? '' : '  (DRY-RUN)'}\n`
  );
  if (docs.length === 0) return;

  if (APPLY) await mkdir(BACKUP_DIR, { recursive: true });

  const stats = {
    ok: 0,
    sinCliente: 0,
    bytes: 0,
    errores: [] as string[],
  };

  for (const doc of docs) {
    const [src] = await origen`
      select url from document where id = ${doc.id} and url like 'data:%'
    `;
    if (!src) {
      stats.errores.push(`${doc.id} (${doc.nombre}): sin base64 en el origen`);
      continue;
    }

    const buf = Buffer.from(
      (src.url as string).slice((src.url as string).indexOf(',') + 1),
      'base64'
    );
    if (buf.length === 0) {
      stats.errores.push(`${doc.id} (${doc.nombre}): base64 inválido`);
      continue;
    }
    // El ETL ya calculó el checksum: si no coincide, el dato viajó mal.
    const sha = r2.checksum(buf);
    if (doc.checksum && doc.checksum !== sha) {
      stats.errores.push(`${doc.id} (${doc.nombre}): checksum distinto al del ETL`);
      continue;
    }

    if (!doc.cliente_id) stats.sinCliente++;
    stats.bytes += buf.length;

    const key = r2.documentKey({
      orgId: doc.org_id,
      clienteId: doc.cliente_id,
      credencialId: doc.credencial_id,
      documentId: doc.id,
      fecha: doc.created_at,
      extension: r2.extensionFor(doc.nombre, doc.mime_type),
    });

    if (!APPLY) {
      if (stats.ok < 5) console.log(`  ${key}  (${buf.length} B, ${doc.mime_type})`);
      stats.ok++;
      continue;
    }

    try {
      await Bun.write(path.join(BACKUP_DIR, `${doc.id}${path.extname(key)}`), buf);
      await r2.upload(key, buf, doc.mime_type);
      await ideal`update documento set storage_key = ${key} where id = ${doc.id}`;
      stats.ok++;
      if (stats.ok % 50 === 0) console.log(`  ${stats.ok}/${docs.length}...`);
    } catch (error) {
      stats.errores.push(`${doc.id} (${doc.nombre}): ${(error as Error).message}`);
    }
  }

  console.log(`\nsubidos: ${stats.ok}/${docs.length}`);
  console.log(`total: ${(stats.bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`sin cliente (van a _sin-cliente/): ${stats.sinCliente}`);
  if (stats.errores.length > 0) {
    console.log(`\nerrores (${stats.errores.length}):`);
    for (const e of stats.errores.slice(0, 20)) console.log(`  ${e}`);
  }
  if (!APPLY)
    console.log('\nDRY-RUN: no se subió ni se modificó nada. Correr con --apply.');
};

await main();
await ideal.end();
await origen.end();

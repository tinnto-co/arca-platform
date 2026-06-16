/**
 * Script: load-conceptos-from-sos-xls.ts
 *
 * Lee el archivo XLS (en realidad HTML) exportado desde SOS Contador
 * (Sueldos > Recibos > "XLS c/conceptos") y carga los valores de
 * concepto en la DB para el período indicado.
 *
 * Para cada empleado del XLS:
 *   1. Busca el liquidacion_import_empleado por clientId + cuil
 *   2. Busca (o crea) el liquidacion_import_recibo para el período/tipo
 *   3. Borra los conceptos existentes y los reinserta desde el XLS
 *
 * Uso:
 *   bun run src/scripts/load-conceptos-from-sos-xls.ts \
 *       --xls "C:/ruta/al/archivo.xls" \
 *       [--dry-run]
 *
 * Ejemplo Flor de Azar:
 *   bun run src/scripts/load-conceptos-from-sos-xls.ts \
 *       --xls "C:/Users/Brian/Desktop/Info conceptos 05-2026/Flor de Azar SA/33-71919623-9_2026-5_0_.xls"
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { db } from '@/lib/db';
import {
  client,
  liquidacionImportEmpleado,
  liquidacionImportRecibo,
  liquidacionImportConceptoValor,
} from '@/drizzle/schema';
import { and, eq, or } from 'drizzle-orm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let xlsPath: string | null = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--xls' && args[i + 1]) {
      xlsPath = args[++i]!;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { xlsPath, dryRun };
}

/** Parsea tabla HTML simple sin dependencias externas. */
function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inCell = false;
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) break;
      const rawTag = html.slice(i + 1, end).trim().toLowerCase();
      const tag = rawTag.replace(/\s.*$/, '');
      if (tag === 'tr') {
        current = [];
      } else if (tag === '/tr') {
        if (current.length > 0) rows.push(current);
      } else if (tag === 'td' || tag === 'th') {
        cell = '';
        inCell = true;
      } else if (tag === '/td' || tag === '/th') {
        current.push(cell.trim());
        inCell = false;
      }
      i = end + 1;
    } else {
      if (inCell) cell += html[i];
      i++;
    }
  }
  return rows;
}

/** "1.332.989,00" o "1332989,00" → "1332989.00". Retorna null si es 0 o vacío. */
function parseMonto(s: string): string | null {
  if (!s || s === '0,00' || s === '0') return null;
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  if (isNaN(n) || n === 0) return null;
  return n.toFixed(2);
}

/** Quita guiones del CUIT: "33-71919623-9" → "33719196239" */
function normalizeCuit(s: string): string {
  return s.replace(/[-\s]/g, '');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { xlsPath, dryRun } = parseArgs();

  if (!xlsPath) {
    console.error('Uso: bun run src/scripts/load-conceptos-from-sos-xls.ts --xls <ruta>');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }

  // 1. Leer y parsear el archivo
  const html = readFileSync(xlsPath, 'latin1');
  const rows = parseHtmlTable(html);

  // Fila de encabezado: la que tiene >20 cols y empieza con "Período" (o variante con encoding roto)
  const headerRow = rows.find((r) => r.length > 20 && r[1] === 'Tipo');
  if (!headerRow) {
    console.error('No se encontró la fila de encabezado (busco la fila con columna "Tipo" en posición 1).');
    process.exit(1);
  }

  // Filas de datos: las que empiezan con el período "2026-"
  const dataRows = rows.filter((r) => r[0]?.startsWith('2026'));

  if (dataRows.length === 0) {
    console.error('No se encontraron filas de empleados (esperaba filas que empiecen con "2026-").');
    process.exit(1);
  }

  // Extraer CUIT de empresa del título (primera fila del archivo)
  const titleText = rows[0]?.[0] ?? '';
  const cuitMatch = titleText.match(/CUIT\s+([\d-]+)/i);
  const empresaCuit = cuitMatch ? normalizeCuit(cuitMatch[1]!) : null;

  console.log(`\nArchivo: ${xlsPath}`);
  console.log(`Empresa CUIT: ${empresaCuit ?? '(no detectado)'}`);
  console.log(`Empleados en XLS: ${dataRows.length}`);
  console.log(`Columnas SOS: ${headerRow.length - 22}`);
  if (dryRun) console.log('*** DRY RUN — sin cambios en DB ***');
  console.log();

  if (!empresaCuit) {
    console.error('No se pudo detectar el CUIT de la empresa en el archivo.');
    process.exit(1);
  }

  // 2. Encontrar el client en la DB por CUIT
  const cuitConGuiones = empresaCuit.replace(/^(\d{2})(\d{8})(\d)$/, '$1-$2-$3');
  const clientRows = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(or(
      eq(client.identityNumber, empresaCuit),
      eq(client.identityNumber, cuitConGuiones),
    ));

  if (clientRows.length === 0) {
    console.error(`No se encontró cliente con CUIT ${empresaCuit} en la DB.`);
    process.exit(1);
  }

  const theClient = clientRows[0]!;
  console.log(`Cliente DB: ${theClient.name} (${theClient.id})`);
  console.log();

  // 3. Procesar cada empleado
  let totalConceptos = 0;
  let totalEmpleadosOk = 0;
  let totalEmpleadosNoEncontrados = 0;

  for (const row of dataRows) {
    const periodo = row[0] ?? '';   // "2026-05"
    const tipo = (row[1] ?? 'sueldo').toLowerCase();
    const cuil = normalizeCuit(row[7] ?? '');
    const legajo = (row[8] ?? '').trim();
    const nombre = (row[9] ?? '').trim();
    const haberesStr = parseMonto(row[10] ?? '') ?? '0.00';
    const noRemStr   = parseMonto(row[11] ?? '') ?? '0.00';
    const descStr    = parseMonto(row[12] ?? '') ?? '0.00';
    const retStr     = parseMonto(row[13] ?? '') ?? '0.00';
    const netoStr    = parseMonto(row[14] ?? '') ?? '0.00';

    // Construir mapa de conceptos no-cero: { codigoSos → monto }
    const conceptos: Record<string, string> = {};
    for (let ci = 22; ci < headerRow.length; ci++) {
      const codigoSos = (headerRow[ci] ?? '').trim();
      const monto = parseMonto(row[ci] ?? '');
      if (codigoSos && monto) {
        conceptos[codigoSos] = monto;
      }
    }

    const nConceptos = Object.keys(conceptos).length;
    console.log(`── ${nombre} | CUIL:${cuil} | Legajo:${legajo} | Período:${periodo} | Neto:${netoStr} | ${nConceptos} conceptos`);

    // Buscar empleado en DB por clientId + cuil
    const empRows = await db
      .select({ id: liquidacionImportEmpleado.id, nombre: liquidacionImportEmpleado.nombre })
      .from(liquidacionImportEmpleado)
      .where(and(
        eq(liquidacionImportEmpleado.clientId, theClient.id),
        eq(liquidacionImportEmpleado.cuil, cuil),
      ));

    if (empRows.length === 0) {
      console.log(`   ⚠  Empleado no encontrado en DB. Saltando.`);
      totalEmpleadosNoEncontrados++;
      continue;
    }

    const emp = empRows[0]!;
    console.log(`   -> DB: ${emp.nombre} (${emp.id.slice(0, 8)}...)`);

    // Buscar recibo del período (acepta "2026-05" y "2026-5")
    const periodoAlt = periodo.replace(/-0(\d)$/, '-$1'); // "2026-05" → "2026-5"
    const reciboRows = await db
      .select({ id: liquidacionImportRecibo.id, origen: liquidacionImportRecibo.origen })
      .from(liquidacionImportRecibo)
      .where(and(
        eq(liquidacionImportRecibo.empleadoId, emp.id),
        or(
          eq(liquidacionImportRecibo.periodo, periodo),
          eq(liquidacionImportRecibo.periodo, periodoAlt),
        ),
        eq(liquidacionImportRecibo.tipo, tipo),
      ));

    if (!dryRun) {
      await db.transaction(async (tx) => {
        let reciboId: string;

        if (reciboRows.length > 0) {
          reciboId = reciboRows[0]!.id;
          await tx
            .update(liquidacionImportRecibo)
            .set({ haberes: haberesStr, noRemunerativo: noRemStr, descuentos: descStr, retenciones: retStr, neto: netoStr, reciboConfirmado: true, updatedAt: new Date() })
            .where(eq(liquidacionImportRecibo.id, reciboId));
          console.log(`   -> Recibo existente actualizado (${reciboId.slice(0, 8)}...)`);
        } else {
          const [ins] = await tx
            .insert(liquidacionImportRecibo)
            .values({ empleadoId: emp.id, periodo, tipo, haberes: haberesStr, noRemunerativo: noRemStr, descuentos: descStr, retenciones: retStr, neto: netoStr, origen: 'generado', reciboConfirmado: true })
            .returning({ id: liquidacionImportRecibo.id });
          if (!ins) throw new Error(`No se pudo crear recibo para ${nombre}`);
          reciboId = ins.id;
          console.log(`   -> Recibo creado (${reciboId.slice(0, 8)}...)`);
        }

        // Reemplazar todos los conceptos
        await tx.delete(liquidacionImportConceptoValor).where(eq(liquidacionImportConceptoValor.reciboId, reciboId));

        for (const [codigo, monto] of Object.entries(conceptos)) {
          await tx.insert(liquidacionImportConceptoValor).values({
            reciboId,
            codigo,
            monto,
            memo: 'source=sos_xls_import',
          });
        }
      });

      console.log(`   OK ${nConceptos} conceptos cargados`);
    } else {
      const reciboStatus = reciboRows.length > 0
        ? `recibo existente (${reciboRows[0]!.id.slice(0, 8)}...)`
        : 'recibo NUEVO a crear';
      console.log(`   [dry] ${reciboStatus} -- ${nConceptos} conceptos a insertar`);
    }

    totalConceptos += nConceptos;
    totalEmpleadosOk++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('Resumen:');
  console.log(`  Empleados procesados OK:        ${totalEmpleadosOk}`);
  console.log(`  Empleados no encontrados en DB: ${totalEmpleadosNoEncontrados}`);
  console.log(`  Total conceptos ${dryRun ? 'a insertar' : 'insertados'}:     ${totalConceptos}`);
  if (dryRun) console.log('\n*** DRY RUN -- correr sin --dry-run para aplicar cambios ***');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

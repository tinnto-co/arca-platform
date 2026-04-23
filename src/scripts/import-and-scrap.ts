import 'dotenv/config';
import * as XLSXModule from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { client, user } from '@/drizzle/schema';

// Con ESM la API de xlsx puede estar en .default
const XLSX =
  (XLSXModule as { default?: typeof XLSXModule }).default ?? XLSXModule;

const OWNER_USER_ID = 'mxpxsmCOv2Biu14TgBPO7Cvbghh6kjkV';
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3001';
/** Espera entre cada scrape (ms). Solo se lanza el siguiente después de este tiempo. */
const SCRAPE_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS) || 120_000; // 2 min por defecto

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normaliza etiqueta para comparar (sin tildes, minúsculas). */
function normLabel(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

async function bulkImportAndNotify(excelPath: string) {
  console.log('🚀 Iniciando carga masiva y notificación...');

  if (!process.env.DATABASE_URL) {
    console.error(
      '❌ Falta DATABASE_URL. Crea un archivo .env en la raíz del proyecto con DATABASE_URL=postgres://USUARIO:CONTRASEÑA@localhost:5432/NOMBRE_DB'
    );
    return;
  }

  const [ownerUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, OWNER_USER_ID))
    .limit(1);
  if (!ownerUser) {
    console.error(
      `❌ No existe el usuario propietario (OWNER_USER_ID=${OWNER_USER_ID}) en la tabla user. Crea el usuario o cambia OWNER_USER_ID en el script.`
    );
    return;
  }

  const workbook = XLSX.readFile(excelPath);
  const sheetNames = workbook.SheetNames;
  console.log(`📑 Hojas en el archivo: ${sheetNames.join(', ')}`);

  const labelCol = 0;
  const firstClientCol = 1;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = (
      XLSX.utils.sheet_to_json as (
        s: typeof sheet,
        opts?: { header?: number }
      ) => unknown[]
    )(sheet, { header: 1 }) as unknown[][];

    if (!matrix.length) {
      console.warn(`⚠️ Hoja "${sheetName}" está vacía, omitiendo.`);
      continue;
    }

    // La fila 0 puede ser título. Buscar la primera fila con varios nombres en columnas B+.
    let headerRowIndex = 0;
    for (let r = 0; r < Math.min(matrix.length, 5); r++) {
      const row = matrix[r] as unknown[] | undefined;
      if (!row) continue;
      const nonEmptyFromB = row
        .slice(firstClientCol)
        .filter((c) => String(c ?? '').trim() !== '').length;
      if (nonEmptyFromB >= 2) {
        headerRowIndex = r;
        break;
      }
    }

    const headerRow = matrix[headerRowIndex] as unknown[] | undefined;
    if (!headerRow || headerRow.length <= firstClientCol) {
      console.warn(
        `⚠️ Hoja "${sheetName}": no hay columnas de clientes, omitiendo.`
      );
      continue;
    }

    let rowCuit = -1,
      rowRelacionClave = -1,
      rowClaveFiscal = -1;
    for (let r = 0; r < matrix.length; r++) {
      const label = normLabel(matrix[r]?.[labelCol]);
      if (label === 'cuit') rowCuit = r;
      if (label === 'relacion de clave') rowRelacionClave = r;
      if (label === 'clave fiscal') rowClaveFiscal = r;
    }

    if (rowCuit < 0 || rowClaveFiscal < 0) {
      console.warn(
        `⚠️ Hoja "${sheetName}": no se encontraron filas 'Cuit' y 'Clave Fiscal', omitiendo.`
      );
      continue;
    }

    const getCell = (row: number, col: number): string =>
      String(matrix[row]?.[col] ?? '').trim();

    const clients: {
      nombre: string;
      cuit: string;
      relacionClave: string;
      claveFiscal: string;
    }[] = [];
    for (let c = firstClientCol; c < headerRow.length; c++) {
      const nombre = getCell(headerRowIndex, c) || 'Cliente Sin Nombre';
      const cuitDirecto = rowCuit >= 0 ? getCell(rowCuit, c) : '';
      const relacionClave =
        rowRelacionClave >= 0 ? getCell(rowRelacionClave, c) : '';
      const claveFiscal = rowClaveFiscal >= 0 ? getCell(rowClaveFiscal, c) : '';
      clients.push({ nombre, cuit: cuitDirecto, relacionClave, claveFiscal });
    }

    console.log(
      `\n📄 Hoja "${sheetName}": ${clients.length} clientes para procesar.`
    );

    for (const row of clients) {
      try {
        const nombre = row.nombre || 'Cliente Sin Nombre';
        const identityNumber =
          row.relacionClave && row.relacionClave !== ''
            ? row.relacionClave.replace(/\D/g, '')
            : row.cuit.replace(/\D/g, '');
        const password = row.claveFiscal;

        if (!identityNumber || !password) {
          console.warn(`⚠️ Saltando a "${nombre}": Faltan datos (CUIT/Clave).`);
          continue;
        }

        console.log(`\n🔹 Procesando: ${nombre} (CUIT: ${identityNumber})`);

        const [existing] = await db
          .select()
          .from(client)
          .where(
            and(
              eq(client.userId, OWNER_USER_ID),
              eq(client.identityNumber, identityNumber)
            )
          )
          .limit(1);
        if (existing) {
          console.log(
            `   ⏭️ Ya existe en la DB (ID: ${existing.id}), notificando para scrapear...`
          );
          await axios.post(`${BACKEND_URL}/api/scrap/new-client`, {
            clientId: existing.id,
          });
          console.log(
            `   ✔️ Notificación de scrape enviada. Esperando ${SCRAPE_DELAY_MS / 1000}s antes del siguiente...`
          );
          await delay(SCRAPE_DELAY_MS);
          continue;
        }

        const [newClient] = await db
          .insert(client)
          .values({
            id: uuidv4(),
            userId: OWNER_USER_ID,
            name: nombre,
            identityNumber: identityNumber,
            identityType: 'cuit',
            password: String(password),
            email: '',
            phone: '',
            status: 'active',
            registeredAt: new Date(),
          })
          .returning();

        console.log(`   ✅ Guardado en DB (ID: ${newClient.id})`);

        console.log(`   📡 Notificando al backend para iniciar scraping...`);
        await axios.post(`${BACKEND_URL}/api/scrap/new-client`, {
          clientId: newClient.id,
        });
        console.log(
          `   ✔️ Notificación de scrape enviada. Esperando ${SCRAPE_DELAY_MS / 1000}s antes del siguiente...`
        );
        await delay(SCRAPE_DELAY_MS);
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          cause?: unknown;
          code?: string;
          detail?: string;
        };
        const detail = err?.cause
          ? String(
              (err.cause as { message?: string; code?: string })?.message ??
                err.cause
            )
          : (err?.detail ?? err?.message ?? String(error));
        console.error(`   ❌ Error con cliente ${row.nombre}:`, detail);
        if (err?.code === '23503') {
          console.error(
            '   💡 Posible FK: verifica que el usuario OWNER_USER_ID exista en la tabla user.'
          );
        }
        continue;
      }
    }
  }

  console.log('\n🏁 ¡Carga masiva finalizada!');
}

// Ejecución
const path = process.argv[2] || './clientes.xlsx';
bulkImportAndNotify(path).catch(console.error);

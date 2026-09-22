/**
 * Worker de lectura de extractos bancarios.
 *
 * Subir veinte extractos y esperar veinte lecturas con la pantalla abierta no
 * es un flujo: cada PDF son entre 30 segundos y dos minutos de modelo. Acá los
 * PDFs ya subidos (estado `pendiente`) se leen de a varios en paralelo y el
 * estudio puede irse a hacer otra cosa; la cola queda en la tabla, así que la
 * revisión es después y desde cualquier pantalla.
 *
 * Vive en el proceso del servidor, como los crons de tareas y contabilidad.
 * No hace falta cablearlo en `server.ts`: lo despierta la propia subida, así
 * que funciona igual en dev (Vite) y en producción.
 *
 * El tope de paralelismo es lo que evita que veinte PDFs a la vez nos hagan
 * pegar contra el límite de la API del modelo.
 */
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { extractoBancario } from '@/drizzle/schema';
import { runWithDbContext } from '../../lib/db-context';
import { leerExtractoDeDocumento } from '@/lib/extracto-lectura';

/** Cuántas lecturas a la vez. Cada una es una llamada al modelo. */
const EN_PARALELO = Number(process.env.EXTRACTOS_EN_PARALELO ?? 3);

/** Un PDF que el modelo no puede leer no se reintenta para siempre. */
const MAX_INTENTOS = 3;

/**
 * Si un `procesando` quedó colgado (se reinició el servidor a mitad de una
 * lectura), después de esto vuelve a la cola. Más largo que la lectura más
 * lenta que vimos, para no pisar una que todavía está corriendo.
 */
const MINUTOS_COLGADO = 15;

let corriendo = false;

/**
 * Procesa la cola hasta vaciarla. Si ya hay una pasada en curso no arranca
 * otra: la que está corriendo va a levantar lo que se suba mientras tanto.
 */
export function despertarWorkerExtractos(): void {
  if (corriendo) return;
  corriendo = true;
  void (async () => {
    try {
      await vaciarCola();
    } catch (error) {
      console.error('[extractos-worker] la pasada terminó con error', error);
    } finally {
      corriendo = false;
    }
  })();
}

async function vaciarCola(): Promise<void> {
  // Vueltas máximas por pasada: cota de seguridad para que un error que no
  // avanza el estado no deje el bucle girando.
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    await devolverColgados();

    const lote = await db
      .select({
        id: extractoBancario.id,
        orgId: extractoBancario.orgId,
      })
      .from(extractoBancario)
      .where(
        and(
          eq(extractoBancario.estado, 'pendiente'),
          lt(extractoBancario.intentos, MAX_INTENTOS)
        )
      )
      .orderBy(asc(extractoBancario.createdAt))
      .limit(EN_PARALELO);

    if (lote.length === 0) return;

    // En paralelo, pero cada uno con su propio contexto de organización: el
    // worker no tiene sesión, así que el RLS se activa por fila.
    await Promise.all(
      lote.map((fila) =>
        runWithDbContext({ orgId: fila.orgId }, () => procesarUno(fila.id))
      )
    );
  }
}

/** Un `procesando` que quedó colgado vuelve a la cola. */
async function devolverColgados(): Promise<void> {
  await db
    .update(extractoBancario)
    .set({ estado: 'pendiente' })
    .where(
      and(
        eq(extractoBancario.estado, 'procesando'),
        lt(
          extractoBancario.updatedAt,
          sql`now() - interval '${sql.raw(String(MINUTOS_COLGADO))} minutes'`
        )
      )
    );
}

async function procesarUno(id: string): Promise<void> {
  // Tomar la fila es la parte que no puede correr dos veces: el update
  // condicional por estado hace de candado entre pasadas concurrentes.
  const tomada = await db
    .update(extractoBancario)
    .set({
      estado: 'procesando',
      intentos: sql`${extractoBancario.intentos} + 1`,
    })
    .where(
      and(
        eq(extractoBancario.id, id),
        inArray(extractoBancario.estado, ['pendiente'])
      )
    )
    .returning({ id: extractoBancario.id });

  if (tomada.length === 0) return; // otra pasada se la llevó

  try {
    const leido = await leerExtractoDeDocumento(id);
    await db
      .update(extractoBancario)
      .set({
        estado: 'extraido',
        extraccion: leido.extraccion,
        banco: leido.banco,
        periodoDesde: leido.periodoDesde,
        periodoHasta: leido.periodoHasta,
        cuentasDetectadas: leido.cuentas,
        movimientosDetectados: leido.movimientos,
        cuadra: leido.cuadra,
        error: null,
        procesadoAt: new Date(),
      })
      .where(eq(extractoBancario.id, id));
  } catch (error) {
    const motivo =
      error instanceof Error ? error.message : 'No se pudo leer el documento';
    console.error('[extractos-worker] falló la lectura', { id, error });
    // Con los intentos agotados queda en `error` para que se vea en la cola;
    // si quedan, vuelve a `pendiente` y la próxima pasada lo reintenta.
    const [{ intentos }] = await db
      .select({ intentos: extractoBancario.intentos })
      .from(extractoBancario)
      .where(eq(extractoBancario.id, id));

    await db
      .update(extractoBancario)
      .set({
        estado: intentos >= MAX_INTENTOS ? 'error' : 'pendiente',
        error: motivo,
        procesadoAt: new Date(),
      })
      .where(eq(extractoBancario.id, id));
  }
}

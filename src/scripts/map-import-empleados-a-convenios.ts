import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  afipEmpleadoresConvenio,
  liquidacionImportEmpleado,
  payrollConvenio,
  payrollConvenioCategoria,
  profile,
} from '@/drizzle/schema';

function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeCategoriaText(value: string): string {
  let t = normalize(value);
  t = t.replace(/\bvende?dora?\b/g, 'vendedores');
  t = t.replace(/\badministrativa\b/g, 'administrativo');
  t = t.replace(/\bgerebte\b/g, 'gerente');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function extractCctCodigo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{2,4})\/(\d{2,4})\b/);
  if (!match) return null;
  const izquierda = String(parseInt(match[1], 10));
  const derecha = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${izquierda}/${derecha}`;
}

function splitNombreCompleto(nombre: string): { apellido: string; nombre: string } {
  if (nombre.includes(',')) {
    const [apellido, nom] = nombre.split(',').map((x) => x.trim());
    return { apellido: apellido || nombre, nombre: nom || apellido || nombre };
  }
  const parts = nombre.trim().split(/\s+/);
  if (parts.length <= 1) return { apellido: nombre.trim(), nombre: nombre.trim() };
  const apellido = parts[0];
  const nom = parts.slice(1).join(' ');
  return { apellido, nombre: nom };
}

function isGerenteFallbackCategoria(raw: string | null | undefined): boolean {
  const c = canonicalizeCategoriaText(raw ?? '');
  return (
    c === 'gerente' ||
    c === 'director' ||
    c === 'gerebte' ||
    c === 'sin categoria' ||
    c === ''
  );
}

function scoreCategoriaMatch(importCat: string, target: { codigo: string; nombre: string }): number {
  const source = canonicalizeCategoriaText(importCat);
  const codigo = canonicalizeCategoriaText(target.codigo);
  const nombre = canonicalizeCategoriaText(target.nombre);
  if (!source) return 0;

  if (source === codigo || source === nombre) return 1000;
  if (source.includes(nombre)) return 700 + nombre.length;
  if (source.includes(codigo)) return 600 + codigo.length;
  if (nombre.includes(source)) return 500 + source.length;

  const tokens = source.split(' ').filter(Boolean);
  let tokenHits = 0;
  for (const token of tokens) {
    if (token.length >= 3 && (nombre.includes(token) || codigo.includes(token))) {
      tokenHits++;
    }
  }
  return tokenHits * 10;
}

async function main() {
  console.log('== Map import empleados a convenios/categorias ==');

  const profilesConSueldos = await db
    .select({ id: profile.id, clientId: profile.client })
    .from(profile)
    .where(eq(profile.liquidaSueldos, true));

  let matched = 0;
  let createdConfigs = 0;
  let updatedConfigs = 0;
  let withoutMatch = 0;

  for (const p of profilesConSueldos) {
    const afipRows = await db
      .select({ cct: afipEmpleadoresConvenio.cct })
      .from(afipEmpleadoresConvenio)
      .where(eq(afipEmpleadoresConvenio.profileId, p.id));

    const cctSet = new Set(
      afipRows
        .map((row) => extractCctCodigo(row.cct))
        .filter((cct): cct is string => Boolean(cct))
    );

    const conveniosClient = await db
      .select()
      .from(payrollConvenio)
      .where(eq(payrollConvenio.clientId, p.clientId));

    const conveniosFiltrados = conveniosClient.filter((conv) => {
      const posibles = [
        conv.cctCodigo,
        extractCctCodigo(conv.nombre),
        extractCctCodigo(conv.descripcion),
      ].filter((v): v is string => Boolean(v));
      return posibles.some((cct) => cctSet.has(cct));
    });

    if (conveniosFiltrados.length === 0) continue;

    const categoriasByConvenio = new Map<
      string,
      Array<{ id: string; codigo: string; nombre: string }>
    >();
    for (const convenio of conveniosFiltrados) {
      const categorias = await db
        .select({
          id: payrollConvenioCategoria.id,
          codigo: payrollConvenioCategoria.codigo,
          nombre: payrollConvenioCategoria.nombre,
        })
        .from(payrollConvenioCategoria)
        .where(eq(payrollConvenioCategoria.convenioId, convenio.id));
      categoriasByConvenio.set(convenio.id, categorias);
    }

    const imports = await db
      .select()
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.profileId, p.id));

    for (const imp of imports) {
      const catImport = imp.categoria ?? '';

      let best:
        | { convenioId: string; categoriaId: string; score: number }
        | null = null;

      for (const convenio of conveniosFiltrados) {
        const categorias = categoriasByConvenio.get(convenio.id) ?? [];
        for (const cat of categorias) {
          const score = scoreCategoriaMatch(catImport, cat);
          if (score <= 0) continue;
          if (!best || score > best.score) {
            best = { convenioId: convenio.id, categoriaId: cat.id, score };
          }
        }
      }

      const needsGerenteFallback =
        !best || best.score < 20 || isGerenteFallbackCategoria(catImport);

      if (needsGerenteFallback) {
        const convenioFallback = conveniosFiltrados[0];
        if (!convenioFallback) {
          withoutMatch++;
          continue;
        }
        const categoriasFallback = categoriasByConvenio.get(convenioFallback.id) ?? [];
        let categoriaGerente = categoriasFallback.find(
          (cat) => canonicalizeCategoriaText(cat.nombre) === 'gerente'
        );
        if (!categoriaGerente) {
          const [createdGerente] = await db
            .insert(payrollConvenioCategoria)
            .values({
              convenioId: convenioFallback.id,
              codigo: 'GER',
              nombre: 'Gerente',
              orden: 999,
            })
            .returning({
              id: payrollConvenioCategoria.id,
              codigo: payrollConvenioCategoria.codigo,
              nombre: payrollConvenioCategoria.nombre,
            });
          categoriaGerente = createdGerente;
          categoriasByConvenio.set(convenioFallback.id, [
            ...categoriasFallback,
            createdGerente,
          ]);
        }
        best = {
          convenioId: convenioFallback.id,
          categoriaId: categoriaGerente.id,
          score: 9999,
        };
      }

      // Si ya tiene convenio asignado en liquidacion_import_empleado, actualizar si cambió
      if (imp.convenioId) {
        if (imp.convenioId !== best.convenioId || imp.categoriaId !== best.categoriaId) {
          await db
            .update(liquidacionImportEmpleado)
            .set({ convenioId: best.convenioId, categoriaId: best.categoriaId, updatedAt: new Date() })
            .where(eq(liquidacionImportEmpleado.id, imp.id));
          updatedConfigs++;
        }
        matched++;
        continue;
      }

      const cuil = String(imp.cuil ?? '').trim();
      if (!cuil) {
        withoutMatch++;
        continue;
      }

      await db
        .update(liquidacionImportEmpleado)
        .set({
          convenioId: best.convenioId,
          categoriaId: best.categoriaId,
          tipoJornada: 'full_time',
          activo: true,
          updatedAt: new Date(),
        })
        .where(eq(liquidacionImportEmpleado.id, imp.id));
      createdConfigs++;
      matched++;
    }
  }

  console.log(`Empleados con match: ${matched}`);
  console.log(`Configs creadas: ${createdConfigs}`);
  console.log(`Configs actualizadas: ${updatedConfigs}`);
  console.log(`Sin match: ${withoutMatch}`);
  console.log('Mapeo finalizado.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en mapeo:', err);
    process.exit(1);
  });


import { eq } from 'drizzle-orm';
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
  const match = /\b(\d{2,4})\/(\d{2,4})\b/.exec(raw);
  if (!match) return null;
  const izquierda = String(parseInt(match[1], 10));
  const derecha = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${izquierda}/${derecha}`;
}

function scoreCategoriaMatch(
  importCat: string,
  target: { codigo: string; nombre: string }
): number {
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
    if (
      token.length >= 3 &&
      (nombre.includes(token) || codigo.includes(token))
    ) {
      tokenHits++;
    }
  }
  return tokenHits * 10;
}

async function main() {
  const report: {
    clientId: string;
    profile: string;
    empleado: string;
    cuil: string;
    categoria: string;
    motivo: string;
  }[] = [];

  const profilesConSueldos = await db
    .select({
      id: profile.id,
      clientId: profile.client,
      profileName: profile.name,
    })
    .from(profile)
    .where(eq(profile.liquidaSueldos, true));

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
      { id: string; codigo: string; nombre: string }[]
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
      if (imp.convenioId) continue;

      const catImport = imp.categoria ?? '';
      if (!catImport.trim()) {
        report.push({
          clientId: p.clientId,
          profile: p.profileName,
          empleado: imp.nombre,
          cuil: imp.cuil,
          categoria: '(vacía)',
          motivo: 'sin categoria en import',
        });
        continue;
      }

      let bestScore = 0;
      for (const convenio of conveniosFiltrados) {
        const categorias = categoriasByConvenio.get(convenio.id) ?? [];
        for (const cat of categorias) {
          const score = scoreCategoriaMatch(catImport, cat);
          if (score > bestScore) bestScore = score;
        }
      }

      if (bestScore < 20) {
        report.push({
          clientId: p.clientId,
          profile: p.profileName,
          empleado: imp.nombre,
          cuil: imp.cuil,
          categoria: catImport,
          motivo: 'sin match >=20',
        });
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`TOTAL ${report.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

/**
 * Motor del asiento automático de banco (TIN-1689).
 *
 * Funciones PURAS (no tocan la DB). La unidad es **mes + concepto + cuenta
 * bancaria**, no el movimiento: el estudio lo pidió así —"si durante
 * septiembre hubo 40 movimientos de comisiones bancarias, se pueden sumar
 * todos y generar un único asiento mensual"—. Mensual y no anual, porque el
 * ajuste por inflación necesita el mes.
 *
 * Por qué también entra la cuenta bancaria en la unidad: la contrapartida es
 * el banco, y cada cuenta bancaria tiene la suya en el plan. Un asiento por
 * cuenta deja el mayor de cada banco comparable contra su propio extracto.
 *
 * Garantía de diseño, igual que en facturas y sueldos: el asiento SIEMPRE
 * balancea. Lo que ninguna regla cubre y cualquier residuo por redondeo van a
 * "Pendiente de revisión", que traba el cierre del período hasta que alguien
 * lo corrija.
 */
import {
  cerrarPorDiferencia,
  importePorcentaje,
  num,
  round2,
  seleccionarPorPrioridad,
  type AsientoArmado,
  type LineaArmada,
  type ReglaLike,
} from './accounting-reglas';
import { CATEGORIA_MOVIMIENTO_LABEL } from './clasificar-movimiento';

/** Un movimiento del extracto, con lo que hace falta para agrupar y mapear. */
export interface MovimientoLike {
  id: string;
  cuentaBancariaId: string;
  /** 'YYYY-MM-DD'. */
  fecha: string;
  direccion: 'ingreso' | 'egreso';
  importe: string | number;
  categoria: string | null;
}

/** Los movimientos de un mes, de una cuenta y de un concepto, sumados. */
export interface GrupoBancario {
  periodo: string;
  cuentaBancariaId: string;
  categoria: string;
  direccion: 'ingreso' | 'egreso';
  total: number;
  movimientos: number;
  /** Para poder mostrar qué lo compone y rehacerlo si cambia. */
  movimientoIds: string[];
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. Sin `Date`: la zona horaria corre el día. */
export function periodoDeFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

/**
 * Agrupa los movimientos del período por cuenta bancaria, concepto y
 * dirección.
 *
 * La dirección separa a propósito: una transferencia que entra es un cobro y
 * una que sale es un pago, y no van a la misma cuenta. Sin categoría, el
 * movimiento cae en 'varios', que es lo que el clasificador ya hace.
 */
export function agruparMovimientos(
  movimientos: MovimientoLike[]
): GrupoBancario[] {
  const mapa = new Map<string, GrupoBancario>();
  for (const m of movimientos) {
    const periodo = periodoDeFecha(m.fecha);
    const categoria = m.categoria ?? 'varios';
    const clave = `${periodo}|${m.cuentaBancariaId}|${categoria}|${m.direccion}`;
    const grupo = mapa.get(clave) ?? {
      periodo,
      cuentaBancariaId: m.cuentaBancariaId,
      categoria,
      direccion: m.direccion,
      total: 0,
      movimientos: 0,
      movimientoIds: [],
    };
    grupo.total = round2(grupo.total + Math.abs(num(m.importe)));
    grupo.movimientos += 1;
    grupo.movimientoIds.push(m.id);
    mapa.set(clave, grupo);
  }
  // Orden estable: el mismo mes genera siempre los asientos en el mismo
  // orden, así regenerar no reordena el libro diario.
  return [...mapa.values()].sort(
    (a, b) =>
      a.periodo.localeCompare(b.periodo) ||
      a.cuentaBancariaId.localeCompare(b.cuentaBancariaId) ||
      a.categoria.localeCompare(b.categoria) ||
      a.direccion.localeCompare(b.direccion)
  );
}

/**
 * ¿Esta regla aplica a este grupo?
 *
 * Las claves que se entienden son las de `CLAVES_CONDICION_POR_MODULO`:
 * `categoria`, `direccion` y `cuenta_bancaria_id`. Una clave desconocida hace
 * que la regla no matchee: es preferible caer a "Pendiente de revisión" que
 * imputar a una cuenta equivocada.
 */
export function reglaMatcheaGrupo(
  regla: ReglaLike,
  grupo: GrupoBancario
): boolean {
  if (regla.tipo === 'default') return true;
  const cond = regla.condicion;
  if (!cond || Object.keys(cond).length === 0) return true;

  for (const [clave, valor] of Object.entries(cond)) {
    const esperado = Array.isArray(valor) ? valor : [valor];
    const actual =
      clave === 'categoria'
        ? grupo.categoria
        : clave === 'direccion'
          ? grupo.direccion
          : clave === 'cuenta_bancaria_id'
            ? grupo.cuentaBancariaId
            : undefined;
    if (actual === undefined) return false;
    if (!esperado.map(String).includes(actual)) return false;
  }
  return true;
}

export function seleccionarReglaGrupo(
  reglas: ReglaLike[],
  grupo: GrupoBancario
): ReglaLike | null {
  return seleccionarPorPrioridad(reglas, grupo, reglaMatcheaGrupo);
}

export interface AsientoBancarioArmado extends AsientoArmado {
  grupo: GrupoBancario;
  /** La regla que lo generó, para poder rastrearlo y regenerarlo. */
  reglaId: string | null;
  /**
   * Por qué este grupo no se puede contabilizar todavía. Con bloqueo no hay
   * asiento: `lineas` queda vacío y generar lo saltea.
   */
  bloqueo: string | null;
}

/**
 * Arma las líneas del asiento de un grupo.
 *
 * `cuentaDelBanco` es la cuenta contable de la cuenta bancaria del grupo: las
 * líneas marcadas `usaCuentaBanco` la usan. Si la cuenta bancaria no tiene
 * cuenta contable asignada, esas líneas no se pueden resolver y todo el grupo
 * va a revisión: es preferible un asiento que avisa a uno imputado a
 * cualquier lado.
 */
export function armarLineasBanco(
  grupo: GrupoBancario,
  reglas: ReglaLike[],
  cuentaPendienteRevisionId: string,
  cuentaDelBancoId: string | null
): AsientoBancarioArmado {
  const lineas: LineaArmada[] = [];
  const regla = seleccionarReglaGrupo(reglas, grupo);

  // Sin la cuenta del banco no hay asiento posible: uno con el Debe y el
  // Haber en "Pendiente de revisión" mueve la plata contra sí misma y ensucia
  // el mayor sin decir nada. Es mejor no generarlo y avisar qué falta.
  if (!cuentaDelBancoId)
    return {
      grupo,
      reglaId: null,
      lineas: [],
      usoPendienteRevision: false,
      motivo: null,
      bloqueo:
        'La cuenta bancaria no tiene cuenta contable asignada (Banco → Cuentas y extractos)',
    };

  /**
   * Sin regla no se genera nada.
   *
   * Antes se armaba contra "Pendiente de revisión" para que la plata quedara
   * registrada y el saldo del banco cerrara. En la práctica eso llenaba la
   * pantalla de asientos que parecían listos y no imputaban nada: a qué
   * cuenta va cada concepto lo decide el estudio, y mientras no lo haya
   * decidido no hay asiento que generar, hay una regla que escribir.
   */
  if (!regla)
    return {
      grupo,
      reglaId: null,
      lineas: [],
      usoPendienteRevision: false,
      motivo: null,
      bloqueo: `Falta la regla para "${
        CATEGORIA_MOVIMIENTO_LABEL[
          grupo.categoria as keyof typeof CATEGORIA_MOVIMIENTO_LABEL
        ] ?? grupo.categoria
      }" ${grupo.direccion === 'ingreso' ? 'que entra' : 'que sale'}`,
    };

  for (const l of regla.lineas) {
    const importe =
      l.base === 'fijo'
        ? round2(num(l.importeFijo))
        : l.base === 'porcentaje'
          ? importePorcentaje(grupo.total, l.porcentaje)
          : grupo.total;
    if (importe === 0) continue;
    lineas.push({
      cuentaId: l.usaCuentaBanco ? cuentaDelBancoId : l.cuentaId!,
      debe: l.lado === 'debe' ? importe : 0,
      haber: l.lado === 'haber' ? importe : 0,
      descripcion: l.descripcion ?? null,
      reglaId: regla.id,
    });
  }

  if (lineas.length === 0)
    return {
      grupo,
      reglaId: regla.id,
      lineas: [],
      usoPendienteRevision: false,
      motivo: null,
      bloqueo: `La regla "${regla.nombre}" no genera ninguna línea para este importe`,
    };

  const { cerro, motivo } = cerrarPorDiferencia(
    lineas,
    cuentaPendienteRevisionId,
    {
      descripcion: 'Diferencia a revisar',
      motivo: `La regla "${regla.nombre}" no cuadra: la diferencia quedó en Pendiente de revisión`,
    }
  );

  return {
    grupo,
    reglaId: regla.id,
    lineas,
    usoPendienteRevision: cerro,
    motivo,
    bloqueo: null,
  };
}

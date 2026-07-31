/**
 * Plan de cuentas base del estudio (RT FACPCE 8/9) para el módulo de Balances.
 *
 * Define la lista canónica de cuentas `scope='base'` que se siembra en cada
 * organización. La jerarquía se resuelve por el código: el padre de una cuenta
 * es la cuenta cuyo código es el prefijo inmediato (se quita el último segmento).
 *
 * Convenciones:
 * - Nodos estructurales y de rubro → type='grupo' (no aceptan movimientos).
 * - Cuentas hoja → type='imputable' (aceptan movimientos), con accountGroup y expectedBalance.
 * - El rango "9.x" queda reservado para cuentas custom de cada empresa, por lo que
 *   el plan base no usa códigos que empiecen con "9.".
 * - Cuentas de sistema (isSystemAccount): no se borran, desactivan ni renombran.
 */

import {
  ACCOUNT_GROUP_LABELS,
  PENDING_REVIEW_CODE,
} from '@/lib/accounting-labels';

export interface BaseAccountSeed {
  code: string;
  name: string;
  type: 'grupo' | 'imputable';
  accountGroup?: string;
  expectedBalance?: 'deudor' | 'acreedor' | 'ambos';
  expenseFunction?: 'administracion' | 'comercializacion' | 'financiero' | 'otro';
  isSystemAccount?: boolean;
  /** Default global de activación de la cuenta base. */
  isActive?: boolean;
}

const VALID_ACCOUNT_GROUPS = new Set<string>(Object.keys(ACCOUNT_GROUP_LABELS));
const VALID_EXPECTED_BALANCE = new Set<string>(['deudor', 'acreedor', 'ambos']);
const VALID_EXPENSE_FUNCTION = new Set<string>([
  'administracion',
  'comercializacion',
  'financiero',
  'otro',
]);

const G = (
  code: string,
  name: string,
  accountGroup?: string
): BaseAccountSeed => ({
  code,
  name,
  type: 'grupo',
  accountGroup,
});

const I = (
  code: string,
  name: string,
  accountGroup: string,
  expectedBalance: 'deudor' | 'acreedor' | 'ambos',
  extra?: Partial<BaseAccountSeed>
): BaseAccountSeed => ({
  code,
  name,
  type: 'imputable',
  accountGroup,
  expectedBalance,
  ...extra,
});

export const BASE_CHART: BaseAccountSeed[] = [
  // ───────────────────────── Cuentas de sistema ─────────────────────────
  { ...G('0', 'Cuentas de sistema'), isSystemAccount: true },
  I('0.001', 'Cuenta pendiente de revisión', 'otros_activos_cte', 'ambos', {
    isSystemAccount: true,
  }),

  // ───────────────────────────── 1. ACTIVO ─────────────────────────────
  G('1', 'Activo'),
  G('1.1', 'Activo Corriente'),

  G('1.1.01', 'Caja y Bancos', 'caja_bancos'),
  I('1.1.01.001', 'Caja', 'caja_bancos', 'deudor'),
  I('1.1.01.002', 'Banco cuenta corriente', 'caja_bancos', 'deudor'),
  I('1.1.01.003', 'Recaudaciones a depositar', 'caja_bancos', 'deudor'),
  I('1.1.01.004', 'Fondo fijo', 'caja_bancos', 'deudor'),
  I('1.1.01.005', 'Caja en moneda extranjera', 'caja_bancos', 'deudor'),
  I('1.1.01.006', 'Banco moneda extranjera', 'caja_bancos', 'deudor'),

  G('1.1.02', 'Inversiones temporarias', 'inversiones_temporarias'),
  I('1.1.02.001', 'Plazo fijo', 'inversiones_temporarias', 'deudor'),
  I(
    '1.1.02.002',
    'Fondos comunes de inversión',
    'inversiones_temporarias',
    'deudor'
  ),

  G('1.1.03', 'Créditos por ventas', 'creditos_ventas'),
  I('1.1.03.001', 'Deudores por ventas', 'creditos_ventas', 'deudor'),
  I('1.1.03.002', 'Documentos a cobrar', 'creditos_ventas', 'deudor'),
  I('1.1.03.003', 'Deudores morosos', 'creditos_ventas', 'deudor'),
  I('1.1.03.004', 'Deudores en gestión judicial', 'creditos_ventas', 'deudor'),
  I(
    '1.1.03.005',
    '(-) Previsión deudores incobrables',
    'creditos_ventas',
    'acreedor'
  ),
  I('1.1.03.006', 'Cheques diferidos a cobrar', 'creditos_ventas', 'deudor'),

  G('1.1.04', 'Otros créditos', 'otros_creditos_cte'),
  I('1.1.04.001', 'IVA crédito fiscal', 'otros_creditos_cte', 'deudor'),
  I('1.1.04.002', 'Anticipos a proveedores', 'otros_creditos_cte', 'deudor'),
  I(
    '1.1.04.003',
    'Retenciones y percepciones sufridas',
    'otros_creditos_cte',
    'deudor'
  ),
  I('1.1.04.004', 'Anticipos de impuestos', 'otros_creditos_cte', 'deudor'),
  I(
    '1.1.04.005',
    'Gastos pagados por adelantado',
    'otros_creditos_cte',
    'deudor'
  ),
  I('1.1.04.006', 'Créditos al personal', 'otros_creditos_cte', 'deudor'),

  G('1.1.05', 'Bienes de cambio', 'bienes_cambio'),
  I('1.1.05.001', 'Mercaderías de reventa', 'bienes_cambio', 'deudor'),
  I('1.1.05.002', 'Materias primas', 'bienes_cambio', 'deudor'),
  I('1.1.05.003', 'Productos terminados', 'bienes_cambio', 'deudor'),
  I('1.1.05.004', 'Mercaderías en tránsito', 'bienes_cambio', 'deudor'),

  G('1.1.06', 'Otros activos corrientes', 'otros_activos_cte'),

  G('1.2', 'Activo No Corriente'),

  G('1.2.01', 'Créditos a largo plazo', 'creditos_largo_plazo'),

  G('1.2.02', 'Bienes de uso', 'bienes_uso'),
  I('1.2.02.001', 'Rodados', 'bienes_uso', 'deudor'),
  I('1.2.02.002', '(-) Amortización acumulada rodados', 'bienes_uso', 'acreedor'),
  I('1.2.02.003', 'Muebles y útiles', 'bienes_uso', 'deudor'),
  I(
    '1.2.02.004',
    '(-) Amortización acumulada muebles y útiles',
    'bienes_uso',
    'acreedor'
  ),
  I('1.2.02.005', 'Equipos de computación', 'bienes_uso', 'deudor'),
  I(
    '1.2.02.006',
    '(-) Amortización acumulada equipos de computación',
    'bienes_uso',
    'acreedor'
  ),
  I('1.2.02.007', 'Instalaciones', 'bienes_uso', 'deudor'),
  I(
    '1.2.02.008',
    '(-) Amortización acumulada instalaciones',
    'bienes_uso',
    'acreedor'
  ),
  I('1.2.02.009', 'Inmuebles', 'bienes_uso', 'deudor'),
  I(
    '1.2.02.010',
    '(-) Amortización acumulada inmuebles',
    'bienes_uso',
    'acreedor'
  ),
  I('1.2.02.011', 'Maquinarias', 'bienes_uso', 'deudor'),
  I(
    '1.2.02.012',
    '(-) Amortización acumulada maquinarias',
    'bienes_uso',
    'acreedor'
  ),

  G('1.2.03', 'Activos intangibles', 'intangibles'),
  I('1.2.03.001', 'Marcas y patentes', 'intangibles', 'deudor'),
  I('1.2.03.002', 'Software y licencias', 'intangibles', 'deudor'),
  I(
    '1.2.03.003',
    '(-) Amortización acumulada intangibles',
    'intangibles',
    'acreedor'
  ),

  G('1.2.04', 'Inversiones permanentes', 'inversiones_permanentes'),

  G('1.2.05', 'Otros activos no corrientes', 'otros_activos_no_cte'),

  // ───────────────────────────── 2. PASIVO ─────────────────────────────
  G('2', 'Pasivo'),
  G('2.1', 'Pasivo Corriente'),

  G('2.1.01', 'Deudas comerciales', 'deudas_comerciales'),
  I('2.1.01.001', 'Proveedores', 'deudas_comerciales', 'acreedor'),
  I('2.1.01.002', 'Documentos a pagar', 'deudas_comerciales', 'acreedor'),
  I('2.1.01.003', 'Anticipos de clientes', 'deudas_comerciales', 'acreedor'),
  I('2.1.01.004', 'Cheques emitidos a pagar', 'deudas_comerciales', 'acreedor'),

  G('2.1.02', 'Deudas financieras', 'deudas_financieras'),
  I('2.1.02.001', 'Préstamos bancarios', 'deudas_financieras', 'acreedor'),
  I('2.1.02.002', 'Intereses a pagar', 'deudas_financieras', 'acreedor'),

  G('2.1.03', 'Deudas sociales', 'deudas_sociales'),
  I('2.1.03.001', 'Sueldos a pagar', 'deudas_sociales', 'acreedor'),
  I('2.1.03.002', 'Cargas sociales a pagar', 'deudas_sociales', 'acreedor'),
  I('2.1.03.003', 'Provisión SAC', 'deudas_sociales', 'acreedor'),
  I('2.1.03.004', 'Provisión vacaciones', 'deudas_sociales', 'acreedor'),

  G('2.1.04', 'Deudas fiscales', 'deudas_fiscales'),
  I('2.1.04.001', 'IVA débito fiscal', 'deudas_fiscales', 'acreedor'),
  I('2.1.04.002', 'IVA a pagar', 'deudas_fiscales', 'acreedor'),
  I(
    '2.1.04.003',
    'Retenciones y percepciones a depositar',
    'deudas_fiscales',
    'acreedor'
  ),
  I(
    '2.1.04.004',
    'Impuesto a las ganancias a pagar',
    'deudas_fiscales',
    'acreedor'
  ),
  I('2.1.04.005', 'Ingresos brutos a pagar', 'deudas_fiscales', 'acreedor'),

  G('2.1.05', 'Otras deudas', 'otras_deudas_cte'),
  I('2.1.05.001', 'Acreedores varios', 'otras_deudas_cte', 'acreedor'),

  G('2.2', 'Pasivo No Corriente'),
  G('2.2.01', 'Deudas a largo plazo', 'deudas_largo_plazo'),
  G('2.2.02', 'Previsiones', 'previsiones'),
  I('2.2.02.001', 'Previsión para juicios', 'previsiones', 'acreedor'),

  // ───────────────────────── 3. PATRIMONIO NETO ────────────────────────
  G('3', 'Patrimonio Neto'),

  G('3.1', 'Capital', 'capital'),
  I('3.1.001', 'Capital social', 'capital', 'acreedor'),
  I('3.1.002', 'Ajuste de capital', 'capital', 'acreedor'),

  G('3.2', 'Aportes irrevocables', 'aportes_irrevocables'),
  I('3.2.001', 'Aportes irrevocables', 'aportes_irrevocables', 'acreedor'),

  G('3.3', 'Primas de emisión', 'primas_emision'),
  I('3.3.001', 'Primas de emisión', 'primas_emision', 'acreedor'),

  G('3.4', 'Reservas', 'reservas'),
  I('3.4.001', 'Reserva legal', 'reservas', 'acreedor'),
  I('3.4.002', 'Reservas facultativas', 'reservas', 'acreedor'),

  G('3.5', 'Resultados no asignados', 'resultados_no_asignados'),
  I('3.5.001', 'Resultados no asignados', 'resultados_no_asignados', 'acreedor'),

  G('3.6', 'Resultado del ejercicio', 'resultado_ejercicio'),
  I('3.6.001', 'Resultado del ejercicio', 'resultado_ejercicio', 'ambos', {
    isSystemAccount: true,
  }),

  // ─────────────────────── 4. RESULTADOS POSITIVOS ─────────────────────
  G('4', 'Resultados positivos'),

  G('4.1', 'Ventas', 'ventas'),
  I('4.1.001', 'Ventas', 'ventas', 'acreedor'),
  I('4.1.002', '(-) Devoluciones y bonificaciones', 'ventas', 'deudor'),

  G('4.2', 'Otros resultados positivos', 'otros_resultados_pos'),
  I('4.2.001', 'Intereses ganados', 'otros_resultados_pos', 'acreedor'),
  I(
    '4.2.002',
    'Diferencias de cambio positivas',
    'otros_resultados_pos',
    'acreedor'
  ),
  I('4.2.003', 'Otros ingresos', 'otros_resultados_pos', 'acreedor'),

  // ─────────────────────── 5. RESULTADOS NEGATIVOS ─────────────────────
  G('5', 'Resultados negativos'),

  G('5.1', 'Costo de ventas', 'costo_ventas'),
  I('5.1.001', 'Costo de mercaderías vendidas', 'costo_ventas', 'deudor'),

  G('5.2', 'Gastos de administración', 'gastos_administracion'),
  I(
    '5.2.001',
    'Sueldos y jornales administración',
    'gastos_administracion',
    'deudor',
    { expenseFunction: 'administracion' }
  ),
  I(
    '5.2.002',
    'Cargas sociales administración',
    'gastos_administracion',
    'deudor',
    { expenseFunction: 'administracion' }
  ),
  I('5.2.003', 'Honorarios', 'gastos_administracion', 'deudor', {
    expenseFunction: 'administracion',
  }),
  I('5.2.004', 'Alquileres', 'gastos_administracion', 'deudor', {
    expenseFunction: 'administracion',
  }),
  I('5.2.005', 'Servicios (luz, gas, agua)', 'gastos_administracion', 'deudor', {
    expenseFunction: 'administracion',
  }),
  I('5.2.006', 'Gastos de oficina', 'gastos_administracion', 'deudor', {
    expenseFunction: 'administracion',
  }),
  I(
    '5.2.007',
    'Amortización bienes de uso administración',
    'gastos_administracion',
    'deudor',
    { expenseFunction: 'administracion' }
  ),
  I('5.2.008', 'Impuestos y tasas', 'gastos_administracion', 'deudor', {
    expenseFunction: 'administracion',
  }),

  G('5.3', 'Gastos de comercialización', 'gastos_comercializacion'),
  I(
    '5.3.001',
    'Sueldos y jornales comercialización',
    'gastos_comercializacion',
    'deudor',
    { expenseFunction: 'comercializacion' }
  ),
  I(
    '5.3.002',
    'Cargas sociales comercialización',
    'gastos_comercializacion',
    'deudor',
    { expenseFunction: 'comercializacion' }
  ),
  I('5.3.003', 'Publicidad y propaganda', 'gastos_comercializacion', 'deudor', {
    expenseFunction: 'comercializacion',
  }),
  I('5.3.004', 'Fletes y acarreos', 'gastos_comercializacion', 'deudor', {
    expenseFunction: 'comercializacion',
  }),
  I('5.3.005', 'Comisiones', 'gastos_comercializacion', 'deudor', {
    expenseFunction: 'comercializacion',
  }),
  I('5.3.006', 'Deudores incobrables', 'gastos_comercializacion', 'deudor', {
    expenseFunction: 'comercializacion',
  }),

  G('5.4', 'Gastos financieros', 'gastos_financieros'),
  I('5.4.001', 'Intereses perdidos', 'gastos_financieros', 'deudor', {
    expenseFunction: 'financiero',
  }),
  I('5.4.002', 'Gastos y comisiones bancarias', 'gastos_financieros', 'deudor', {
    expenseFunction: 'financiero',
  }),
  I(
    '5.4.003',
    'Diferencias de cambio negativas',
    'gastos_financieros',
    'deudor',
    { expenseFunction: 'financiero' }
  ),
  I('5.4.004', 'RECPAM', 'gastos_financieros', 'ambos', {
    expenseFunction: 'financiero',
  }),

  G('5.5', 'Impuesto a las ganancias', 'impuesto_ganancias'),
  I('5.5.001', 'Impuesto a las ganancias', 'impuesto_ganancias', 'deudor'),

  G('5.6', 'Otros resultados negativos', 'otros_resultados_neg'),
  I('5.6.001', 'Otros egresos', 'otros_resultados_neg', 'deudor', {
    expenseFunction: 'otro',
  }),
];

/** Devuelve el código del padre (prefijo inmediato), o null si es raíz. */
export function parentCodeOf(code: string): string | null {
  const idx = code.lastIndexOf('.');
  return idx === -1 ? null : code.slice(0, idx);
}

/**
 * Valida la integridad del plan de cuentas base antes de seedearlo (UST5).
 * Devuelve la lista de errores encontrados ([] = válido). Chequea:
 * unicidad de códigos, jerarquía (padre existe, padre es agrupación, sin ciclos),
 * rubros/atributos válidos, y existencia de la cuenta de sistema pending_review.
 */
export function validateBaseChart(chart: BaseAccountSeed[] = BASE_CHART): string[] {
  const errors: string[] = [];
  const byCode = new Map<string, BaseAccountSeed>();

  // 1. Unicidad de códigos.
  for (const a of chart) {
    if (byCode.has(a.code)) errors.push(`Código duplicado: ${a.code}`);
    byCode.set(a.code, a);
  }

  for (const a of chart) {
    const parent = parentCodeOf(a.code);

    // 2. Jerarquía: el padre debe existir y ser una agrupación.
    if (parent !== null && !byCode.has(parent)) {
      errors.push(`Cuenta ${a.code}: el padre "${parent}" no existe en el plan`);
    } else if (parent !== null && byCode.get(parent)?.type === 'imputable') {
      errors.push(
        `Cuenta ${a.code}: su padre "${parent}" es imputable (debe ser agrupación)`
      );
    }

    // 3. Rubros y atributos dentro de los enums válidos.
    if (a.accountGroup && !VALID_ACCOUNT_GROUPS.has(a.accountGroup)) {
      errors.push(`Cuenta ${a.code}: rubro inválido "${a.accountGroup}"`);
    }
    if (a.expectedBalance && !VALID_EXPECTED_BALANCE.has(a.expectedBalance)) {
      errors.push(
        `Cuenta ${a.code}: expectedBalance inválido "${a.expectedBalance}"`
      );
    }
    if (a.expenseFunction && !VALID_EXPENSE_FUNCTION.has(a.expenseFunction)) {
      errors.push(
        `Cuenta ${a.code}: expenseFunction inválido "${a.expenseFunction}"`
      );
    }

    // Las imputables requieren rubro y saldo esperado.
    if (a.type === 'imputable') {
      if (!a.accountGroup)
        errors.push(`Cuenta imputable ${a.code}: falta accountGroup`);
      if (!a.expectedBalance)
        errors.push(`Cuenta imputable ${a.code}: falta expectedBalance`);
    }

    // 2b. Sin ciclos (defensivo: la jerarquía por prefijo no debería permitirlos).
    const visited = new Set<string>();
    let cur: string | null = a.code;
    while (cur !== null) {
      if (visited.has(cur)) {
        errors.push(`Ciclo detectado en la jerarquía de ${a.code}`);
        break;
      }
      visited.add(cur);
      const next = parentCodeOf(cur);
      if (next !== null && !byCode.has(next)) break;
      cur = next;
    }
  }

  // 4. Cuentas de sistema: al menos pending_review debe existir y estar marcada.
  const pr = byCode.get(PENDING_REVIEW_CODE);
  if (!pr) {
    errors.push(
      `Falta la cuenta de sistema pending_review (${PENDING_REVIEW_CODE})`
    );
  } else if (!pr.isSystemAccount) {
    errors.push(
      `La cuenta ${PENDING_REVIEW_CODE} (pending_review) debe tener isSystemAccount=true`
    );
  }

  return errors;
}

/**
 * Motor de fórmulas para liquidación de sueldos.
 * Evalúa expresiones seguras con variables numéricas (sin eval() arbitrario).
 * Permite modificar fórmulas sin cambiar código.
 */

export interface PayrollFormulaContext {
  basico?: number;
  antiguedad?: number; // años
  bruto?: number;
  totalRemunerativo?: number;
  totalNoRemunerativo?: number;
  totalDescuentos?: number;
  neto?: number;
  horasExtra?: number;
  presentismo?: number;
  comisiones?: number;
  bonos?: number;
  [key: string]: number | undefined;
}

const ALLOWED_VARS = new Set([
  'basico',
  'antiguedad',
  'bruto',
  'totalRemunerativo',
  'totalNoRemunerativo',
  'totalDescuentos',
  'neto',
  'horasExtra',
  'presentismo',
  'comisiones',
  'bonos',
  'cantidad',
  'valor',
]);

/**
 * Parsea y evalúa una fórmula con el contexto dado.
 * Soporta: números, + - * / ( ), nombres de variables permitidos.
 * Ejemplos:
 *   "0.11 * basico" -> 11% del básico
 *   "basico * 0.01 * antiguedad" -> 1% por año de antigüedad
 *   "1000" -> monto fijo
 */
export function evaluatePayrollFormula(
  formula: string,
  context: PayrollFormulaContext
): number {
  const expr = formula.trim();
  if (!expr) return 0;

  const tokens = tokenize(expr);
  const parsed = parseExpression(tokens);
  return evaluate(parsed, context);
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[+\-*/()]/.test(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let name = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      tokens.push(name);
      continue;
    }
    i++;
  }
  return tokens;
}

type AST =
  | { type: 'number'; value: number }
  | { type: 'var'; name: string }
  | { type: 'binop'; op: string; left: AST; right: AST }
  | { type: 'unary'; op: string; arg: AST };

let tokenIndex = 0;

function parseExpression(tokens: string[]): AST {
  tokenIndex = 0;
  function parseExpr(): AST {
    let left = parseTerm();
    while (tokenIndex < tokens.length) {
      const t = tokens[tokenIndex];
      if (t === '+' || t === '-') {
        tokenIndex++;
        left = { type: 'binop', op: t, left, right: parseTerm() };
      } else break;
    }
    return left;
  }
  function parseTerm(): AST {
    let left = parseFactor();
    while (tokenIndex < tokens.length) {
      const t = tokens[tokenIndex];
      if (t === '*' || t === '/') {
        tokenIndex++;
        left = { type: 'binop', op: t, left, right: parseFactor() };
      } else break;
    }
    return left;
  }
  function parseFactor(): AST {
    if (tokenIndex >= tokens.length) return { type: 'number', value: 0 };
    const t = tokens[tokenIndex];
    if (t === '(') {
      tokenIndex++;
      const inner = parseExpr();
      if (tokenIndex < tokens.length && tokens[tokenIndex] === ')')
        tokenIndex++;
      return inner;
    }
    if (t === '-' || t === '+') {
      tokenIndex++;
      const arg = parseFactor();
      return { type: 'unary', op: t, arg };
    }
    if (/^\d*\.?\d+$/.test(t)) {
      tokenIndex++;
      return { type: 'number', value: parseFloat(t) };
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) {
      if (!ALLOWED_VARS.has(t)) {
        throw new Error(`Variable no permitida en fórmula: ${t}`);
      }
      tokenIndex++;
      return { type: 'var', name: t };
    }
    throw new Error(`Token inválido en fórmula: ${t}`);
  }
  return parseExpr();
}

function evaluate(node: AST, context: PayrollFormulaContext): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'var': {
      const v = context[node.name];
      return typeof v === 'number' ? v : 0;
    }
    case 'unary':
      if (node.op === '-') return -evaluate(node.arg, context);
      return evaluate(node.arg, context);
    case 'binop': {
      const l = evaluate(node.left, context);
      const r = evaluate(node.right, context);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? 0 : l / r;
        default:
          return 0;
      }
    }
    default:
      return 0;
  }
}

/**
 * Redondea a 2 decimales para montos.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

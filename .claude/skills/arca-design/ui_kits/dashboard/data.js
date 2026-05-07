const CLIENTS = [
  { initials:'LP', name:'Lopez Perez S.A.', cuit:'30-71234567-8', status:'ok',   statusText:'Al día',        amount:'$ 2.840.500', bg:'#1E3460' },
  { initials:'MC', name:'Martínez & Cía.',  cuit:'30-69871234-2', status:'pend', statusText:'Pendiente',     amount:'$ 1.120.000', bg:'#7A5C2E' },
  { initials:'FB', name:'Fábrica Buenos Aires', cuit:'30-70123456-7', status:'ok', statusText:'Al día',      amount:'$ 4.670.200', bg:'#2B4A2B' },
  { initials:'RG', name:'Rodríguez Group',  cuit:'30-68456789-1', status:'late', statusText:'Vencido',       amount:'$ 890.300',   bg:'#8A2D2D' },
  { initials:'TC', name:'Textil Córdoba',   cuit:'30-71987654-3', status:'ok',   statusText:'Al día',        amount:'$ 3.210.800', bg:'#4A3A6B' },
];

const VENCIMIENTOS = [
  { d:'28',  m:'ABR', label:'IVA — Posición mensual', sub:'Grupo 2 · CUIT termina en 2-3',     amount:'$ 845.200', urgent:true  },
  { d:'30',  m:'ABR', label:'Ganancias — Anticipo',   sub:'Régimen general · Personas jurídicas', amount:'$ 1.420.000', urgent:false },
  { d:'05',  m:'MAY', label:'Ingresos Brutos — CABA', sub:'Convenio multilateral',              amount:'$ 320.800', urgent:false },
  { d:'12',  m:'MAY', label:'Aportes Autónomos',      sub:'Categoría B · abr 2026',             amount:'$ 186.450', urgent:false },
];

const ACTIVIDAD = [
  { type:'upload', tone:'info', title:'Nueva factura cargada', meta:'Lopez Perez S.A. · Factura A-0001-00234', time:'hace 12 min' },
  { type:'check',  tone:'pos',  title:'Presentación aprobada', meta:'Martínez & Cía. · IVA mar 2026',           time:'hace 48 min' },
  { type:'alert',  tone:'neg',  title:'Vencimiento inminente', meta:'Rodríguez Group · Ganancias anticipo',    time:'hace 2 h' },
  { type:'msg',    tone:'warn', title:'Mensaje de cliente',     meta:'Fábrica Buenos Aires · consulta IVA',     time:'hace 3 h' },
  { type:'check',  tone:'pos',  title:'Pago confirmado',        meta:'Textil Córdoba · IIBB abr 2026',          time:'hace 5 h' },
  { type:'upload', tone:'info', title:'Comprobante subido',     meta:'Lopez Perez S.A. · Retención Ganancias',  time:'ayer 18:40' },
];

// Chart path over 12 months (abr 2025 -> abr 2026), normalized y in [0..1]
const CHART_POINTS = [0.32, 0.40, 0.36, 0.48, 0.58, 0.52, 0.62, 0.70, 0.66, 0.76, 0.84, 0.92];
const CHART_LABELS = ['may','jun','jul','ago','sep','oct','nov','dic','ene','feb','mar','abr'];

// Stacked cashflow (ingresos top / egresos bottom), 6 weeks
const CASH = [
  { label:'S-5', in:62, out:44 },
  { label:'S-4', in:70, out:52 },
  { label:'S-3', in:58, out:49 },
  { label:'S-2', in:78, out:61 },
  { label:'S-1', in:84, out:58 },
  { label:'S',   in:92, out:66 },
];

Object.assign(window, { CLIENTS, VENCIMIENTOS, ACTIVIDAD, CHART_POINTS, CHART_LABELS, CASH });

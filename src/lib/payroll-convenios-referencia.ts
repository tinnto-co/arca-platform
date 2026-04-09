type EscalaPeriodo = {
  periodo: string;
  vigenciaDesde: string;
  vigenciaHasta?: string;
  montoBasico: string;
  montoNoRemunerativo: string;
};

type CategoriaPlantilla = {
  codigo: string;
  nombre: string;
  orden: number;
  escalas: EscalaPeriodo[];
};

export type ConvenioPlantilla = {
  nombre: string;
  descripcion: string;
  categorias: CategoriaPlantilla[];
};

const COMERCIO_NO_REM = "100000";
const COMERCIO_ESCALA_MARZO_2026: CategoriaPlantilla[] = [
  { codigo: "MAEST_A", nombre: "Maestranza A", orden: 10, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1055795", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "MAEST_B", nombre: "Maestranza B", orden: 20, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1058852", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "MAEST_C", nombre: "Maestranza C", orden: 30, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1069560", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "ADM_A", nombre: "Administrativo A", orden: 40, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1067268", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "ADM_B", nombre: "Administrativo B", orden: 50, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1071860", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "ADM_C", nombre: "Administrativo C", orden: 60, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1076448", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "ADM_D", nombre: "Administrativo D", orden: 70, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1090218", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "ADM_E", nombre: "Administrativo E", orden: 80, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1101690", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "ADM_F", nombre: "Administrativo F", orden: 90, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1118519", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "CAJ_A", nombre: "Cajeros A", orden: 100, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1071091", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "CAJ_B", nombre: "Cajeros B", orden: 110, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1076448", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "CAJ_C", nombre: "Cajeros C", orden: 120, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1083333", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "AUX_A", nombre: "Personal Auxiliar A", orden: 130, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1071091", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "AUX_B", nombre: "Personal Auxiliar B", orden: 140, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1078740", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "AUX_C", nombre: "Personal Auxiliar C", orden: 150, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1103985", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "AUXE_A", nombre: "Auxiliar Especializado A", orden: 160, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1080274", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "AUXE_B", nombre: "Auxiliar Especializado B", orden: 170, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1094041", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "VEN_A", nombre: "Vendedores A", orden: 180, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1071091", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "VEN_B", nombre: "Vendedores B", orden: 190, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1094044", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "VEN_C", nombre: "Vendedores C", orden: 200, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1101690", montoNoRemunerativo: COMERCIO_NO_REM }] },
  { codigo: "VEN_D", nombre: "Vendedores D", orden: 210, escalas: [{ periodo: "Marzo 2026", vigenciaDesde: "2026-03-01", vigenciaHasta: "2026-03-31", montoBasico: "1118519", montoNoRemunerativo: COMERCIO_NO_REM }] },
];

const GASTRO_ESTABLECIMIENTOS = [
  "1★ / 1 tenedor D / 1 copa",
  "2★ / 2 tenedores C / 2 copas",
  "3★ / 3 tenedores B / 3 copas",
  "4★ / 4 tenedores A",
  "5★ / 5 tenedores",
];

function gastroCategoria(
  cat: number,
  est: number,
  orden: number,
  basico: string,
  noRem: string
): CategoriaPlantilla {
  return {
    codigo: `CAT_${cat}_EST_${est}`,
    nombre: `Categoría ${cat} - ${GASTRO_ESTABLECIMIENTOS[est - 1]}`,
    orden,
    escalas: [
      {
        periodo: "Enero 2026",
        vigenciaDesde: "2026-01-01",
        vigenciaHasta: "2026-01-31",
        montoBasico: basico,
        montoNoRemunerativo: noRem,
      },
    ],
  };
}

const GASTRO_ESCALA_ENERO_2026: CategoriaPlantilla[] = [
  gastroCategoria(1, 1, 10, "863100", "28471"),
  gastroCategoria(1, 2, 20, "883005", "29127"),
  gastroCategoria(1, 3, 30, "904614", "29840"),
  gastroCategoria(1, 4, 40, "936102", "30879"),
  gastroCategoria(1, 5, 50, "1051572", "34688"),
  gastroCategoria(2, 1, 60, "913132", "30121"),
  gastroCategoria(2, 2, 70, "941394", "31053"),
  gastroCategoria(2, 3, 80, "960556", "31685"),
  gastroCategoria(2, 4, 90, "994209", "32795"),
  gastroCategoria(2, 5, 100, "1116464", "36828"),
  gastroCategoria(3, 1, 110, "957763", "31593"),
  gastroCategoria(3, 2, 120, "1000796", "33013"),
  gastroCategoria(3, 3, 130, "1028505", "33927"),
  gastroCategoria(3, 4, 140, "1063872", "35093"),
  gastroCategoria(3, 5, 150, "1169652", "38583"),
  gastroCategoria(4, 1, 160, "1008944", "33281"),
  gastroCategoria(4, 2, 170, "1041347", "34350"),
  gastroCategoria(4, 3, 180, "1061042", "35000"),
  gastroCategoria(4, 4, 190, "1118950", "36910"),
  gastroCategoria(4, 5, 200, "1241416", "40950"),
  gastroCategoria(5, 1, 210, "1055194", "34807"),
  gastroCategoria(5, 2, 220, "1083468", "35740"),
  gastroCategoria(5, 3, 230, "1107799", "36542"),
  gastroCategoria(5, 4, 240, "1182037", "38991"),
  gastroCategoria(5, 5, 250, "1292598", "42638"),
  gastroCategoria(6, 1, 260, "1125835", "37137"),
  gastroCategoria(6, 2, 270, "1165173", "38435"),
  gastroCategoria(6, 3, 280, "1206540", "39799"),
  gastroCategoria(6, 4, 290, "1246088", "41104"),
  gastroCategoria(6, 5, 300, "1328659", "43828"),
  gastroCategoria(7, 3, 310, "1340418", "44216"),
  gastroCategoria(7, 4, 320, "1604141", "52915"),
  gastroCategoria(7, 5, 330, "1717027", "56639"),
];

export const CONVENIOS_REFERENCIA: ConvenioPlantilla[] = [
  {
    nombre: "Comercio",
    descripcion:
      "CCT 130/75. Fuente: Estudio Vilaplana - escala salarial empleados de comercio (marzo 2026).",
    categorias: COMERCIO_ESCALA_MARZO_2026,
  },
  {
    nombre: "Gastronomía",
    descripcion:
      "CCT 389/04 UTHGRA-FEHGRA. Fuente: Estudio Vilaplana - escala salarial gastronómicos (enero 2026).",
    categorias: GASTRO_ESCALA_ENERO_2026,
  },
];

export function getPlantillaPorActividad(actividad: string): ConvenioPlantilla | null {
  const a = (actividad ?? "").toLowerCase();
  if (a.includes("comercio")) {
    return CONVENIOS_REFERENCIA.find((c) => c.nombre === "Comercio") ?? null;
  }
  if (a.includes("gastron")) {
    return CONVENIOS_REFERENCIA.find((c) => c.nombre === "Gastronomía") ?? null;
  }
  return null;
}


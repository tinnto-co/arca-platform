/**
 * Genera el manual de uso del módulo de Contabilidad en PDF.
 *
 *   bun run src/scripts/generate-manual-contabilidad.tsx
 *
 * Las capturas se toman del navegador y se pasan por `SHOTS_DIR`. El manual se
 * arma con el mismo motor que los Estados Contables (@react-pdf/renderer), así
 * que no hace falta ninguna herramienta extra.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

const SHOTS_DIR = process.env.SHOTS_DIR ?? '';
const OUT =
  process.env.OUT ?? join(process.cwd(), 'Manual-Contabilidad-Arca.pdf');

/** Capturas por orden de toma; el índice es el que usa cada sección. */
const shots =
  SHOTS_DIR && existsSync(SHOTS_DIR)
    ? readdirSync(SHOTS_DIR)
        .filter((f) => f.endsWith('.jpg') || f.endsWith('.png'))
        .sort(
          (a, b) =>
            Number(/-(\d+)\.\w+$/.exec(a)?.[1] ?? 0) -
            Number(/-(\d+)\.\w+$/.exec(b)?.[1] ?? 0)
        )
        .map((f) => join(SHOTS_DIR, f))
    : [];

const C = {
  ink: '#12131a',
  ink2: '#3d4150',
  ink3: '#8a8f9e',
  line: '#e3e5ea',
  accent: '#1e3a5f',
  soft: '#f6f7f9',
  warn: '#b45309',
  warnBg: '#fffbeb',
};

const s = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 52,
    paddingHorizontal: 48,
    fontSize: 9.5,
    color: C.ink2,
    fontFamily: 'Helvetica',
    // Ojo: `lineHeight` acá se hereda al pie fijo y react-pdf lo descarta sin
    // avisar. Va en cada estilo de texto, no en la página.
  },
  coverWrap: { marginTop: 170, alignItems: 'center' },
  coverKicker: {
    fontSize: 9,
    letterSpacing: 2.5,
    color: C.ink3,
    marginBottom: 14,
  },
  coverTitle: {
    fontSize: 30,
    lineHeight: 1.25,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginBottom: 8,
  },
  coverSub: { fontSize: 12, color: C.ink2, marginBottom: 40 },
  coverMeta: { fontSize: 8.5, color: C.ink3 },

  h1: {
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginBottom: 3,
  },
  h1Cont: {
    fontSize: 9,
    letterSpacing: 1.6,
    color: C.ink3,
    marginBottom: 14,
  },
  h1Rule: {
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    width: 44,
    marginBottom: 12,
  },
  h2: {
    fontSize: 11.5,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginTop: 14,
    marginBottom: 4,
  },
  p: { fontSize: 9.5, marginBottom: 6, lineHeight: 1.35 },
  lead: { fontSize: 10.5, color: C.ink2, marginBottom: 12, lineHeight: 1.4 },

  li: { flexDirection: 'row', marginBottom: 3.5, paddingRight: 6 },
  liBullet: { width: 12, color: C.accent },
  liText: { flex: 1, fontSize: 9.5, lineHeight: 1.35 },

  stepNum: {
    width: 15,
    fontFamily: 'Helvetica-Bold',
    color: C.accent,
  },

  shot: {
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 3,
  },
  caption: {
    fontSize: 8,
    color: C.ink3,
    marginBottom: 10,
    lineHeight: 1.3,
    fontStyle: 'italic',
  },

  note: {
    backgroundColor: C.warnBg,
    borderLeftWidth: 2.5,
    borderLeftColor: C.warn,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginTop: 8,
    marginBottom: 8,
    fontSize: 9,
    lineHeight: 1.4,
    color: C.warn,
  },
  box: {
    backgroundColor: C.soft,
    padding: 9,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 3,
    fontSize: 9,
    lineHeight: 1.4,
  },

  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 3.5,
  },
  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.ink3,
    paddingBottom: 3,
    marginTop: 6,
    fontSize: 8,
    color: C.ink3,
    fontFamily: 'Helvetica-Bold',
  },
  tc1: { width: '32%', fontSize: 9.5, paddingRight: 8, lineHeight: 1.3 },
  tc2: { width: '68%', fontSize: 9.5, lineHeight: 1.3 },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: C.ink3,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    paddingTop: 6,
  },
});

const Li = ({ children }: { children: React.ReactNode }) => (
  <View style={s.li}>
    <Text style={s.liBullet}>•</Text>
    <Text style={s.liText}>{children}</Text>
  </View>
);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <View style={s.li}>
    <Text style={s.stepNum}>{n}.</Text>
    <Text style={s.liText}>{children}</Text>
  </View>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <View style={s.note}>
    <Text>{children}</Text>
  </View>
);

const Box = ({ children }: { children: React.ReactNode }) => (
  <View style={s.box}>
    <Text>{children}</Text>
  </View>
);

const Row = ({ a, b }: { a: string; b: string }) => (
  <View style={s.tRow}>
    <Text style={s.tc1}>{a}</Text>
    <Text style={s.tc2}>{b}</Text>
  </View>
);

const Shot = ({
  i,
  caption,
  w,
}: {
  i: number;
  caption: string;
  /** Ancho en % cuando la captura tiene que ceder lugar al texto. */
  w?: number;
}) =>
  shots[i] ? (
    <View wrap={false}>
      <Image style={w ? [s.shot, { width: `${w}%` }] : s.shot} src={shots[i]} />
      <Text style={s.caption}>{caption}</Text>
    </View>
  ) : null;

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>Arca · Manual de Contabilidad</Text>
    <Text
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
    />
  </View>
);

const Cap = ({
  titulo,
  bajada,
  cont,
  children,
}: {
  titulo: string;
  bajada?: string;
  /** Sigue el capítulo anterior: título chico, sin la regla del encabezado. */
  cont?: boolean;
  children: React.ReactNode;
}) => (
  <Page size="A4" style={s.page}>
    {cont ? (
      <Text style={s.h1Cont}>{titulo}</Text>
    ) : (
      <>
        <Text style={s.h1}>{titulo}</Text>
        <View style={s.h1Rule} />
      </>
    )}
    {bajada ? <Text style={s.lead}>{bajada}</Text> : null}
    {children}
    <Footer />
  </Page>
);

function Manual() {
  const hoy = process.env.FECHA ?? '';
  return (
    <Document
      title="Manual de Contabilidad — Arca"
      author="Arca"
      subject="Manual de uso del módulo de Contabilidad"
    >
      {/* ── Carátula ── */}
      <Page size="A4" style={s.page}>
        <View style={s.coverWrap}>
          <Text style={s.coverKicker}>MANUAL DE USO</Text>
          <Text style={s.coverTitle}>Contabilidad</Text>
          <Text style={s.coverSub}>
            Del plan de cuentas a los Estados Contables firmados
          </Text>
          <Text style={s.coverMeta}>
            Arca · Plataforma para estudios contables
          </Text>
          {hoy ? <Text style={s.coverMeta}>{hoy}</Text> : null}
        </View>
        <Footer />
      </Page>

      {/* ── 1. Panorama ── */}
      <Cap
        titulo="1 · Cómo se organiza"
        bajada="El módulo cubre el ciclo contable completo de una empresa: cargar los asientos, revisarlos, ajustar por inflación, emitir los Estados Contables y cerrar el ejercicio. Todo se hace sobre una empresa y un ejercicio a la vez."
      >
        <Text style={s.h2}>Lo primero: elegir la empresa</Text>
        <Text style={s.p}>
          Arriba a la derecha está el selector de empresa. Todo lo que veas
          debajo pertenece a esa empresa. Si el estudio administra varias, este
          es el interruptor que cambia de una a otra.
        </Text>

        <Text style={s.h2}>Las secciones</Text>
        <Text style={s.p}>
          La barra superior tiene las secciones de uso frecuente. Las que se
          tocan una vez y se olvidan —plan de cuentas, ejercicios, índices,
          auditoría— viven en el menú «Más», a la derecha.
        </Text>
        <Shot
          i={1}
          caption="El menú «Más» agrupa lo que no se usa todos los días."
        />
      </Cap>

      <Cap titulo="1 · CÓMO SE ORGANIZA (CONT.)" cont>
        <Text style={s.h2}>Qué hay en cada sección</Text>
        <View style={s.tHead}>
          <Text style={s.tc1}>Sección</Text>
          <Text style={s.tc2}>Para qué</Text>
        </View>
        <Row
          a="Plan de cuentas"
          b="Las cuentas de la empresa. Viene un plan base y se le agregan las propias."
        />
        <Row
          a="Ejercicios"
          b="Los períodos contables y el asistente de cierre."
        />
        <Row a="Asientos" b="El libro diario: alta, edición y anulación." />
        <Row
          a="Reglas"
          b="Cómo se imputan automáticamente las facturas y los sueldos."
        />
        <Row
          a="Contabilizar"
          b="Genera asientos desde facturas y liquidaciones ya cargadas."
        />
        <Row
          a="Pendientes"
          b="Lo que se contabilizó sin regla y espera una decisión."
        />
        <Row a="Mayor" b="Movimientos por cuenta, con su saldo." />
        <Row a="Balance" b="Sumas y saldos. Papel de trabajo." />
        <Row a="Bienes de uso" b="Registro de bienes y Anexo I." />
        <Row a="Índices" b="La serie de FACPCE para el ajuste por inflación." />
        <Row
          a="Ajuste por inflación"
          b="La preplanilla del ajuste y su asiento."
        />
        <Row
          a="Estados Contables"
          b="Los estados, notas, anexos, informe y exportes."
        />
        <Row a="Auditoría" b="Quién hizo qué y cuándo." />
      </Cap>

      {/* ── 2. Preparar ── */}
      <Cap
        titulo="2 · Preparar la empresa"
        bajada="Se hace una sola vez por empresa. Sin esto, no se puede cargar ni un asiento."
      >
        <Text style={s.h2}>Plan de cuentas</Text>
        <Text style={s.p}>
          Cada empresa arranca con un plan base de 91 cuentas, ya clasificadas
          por rubro y por su tratamiento frente al ajuste por inflación. Las
          cuentas propias se agregan con «Nueva cuenta».
        </Text>
        <Shot
          i={2}
          caption="El plan se navega por niveles. Las cuentas «Base» vienen con el sistema."
        />
        <Li>
          Solo se imputan asientos a las cuentas <Text>imputables</Text>; las de
          agrupación son títulos.
        </Li>
        <Li>
          Cada cuenta declara su rubro de exposición, que es lo que define en
          qué renglón del balance aparece.
        </Li>
        <Li>
          «Importar / Exportar» permite subir un plan desde Excel o bajar el
          actual como plantilla.
        </Li>

        <Text style={s.h2}>Ejercicios</Text>
        <Text style={s.p}>
          Un ejercicio es el período contable, normalmente doce meses. Al
          crearlo se generan sus doce períodos mensuales.
        </Text>
        <Box>
          Si el ejercicio anterior no está en el sistema y solo lo necesitás
          para la columna comparativa, creá el ejercicio con la opción «Solo
          para el comparativo». No hay que cerrarlo ni ajustarlo: se transcriben
          los saldos del balance ya presentado en una planilla de dos columnas.
        </Box>
      </Cap>

      {/* ── 3. Cargar ── */}
      <Cap
        titulo="3 · Cargar los movimientos"
        bajada="Hay tres caminos y conviven: a mano, desde facturas y desde sueldos."
      >
        <Text style={s.h2}>Asientos</Text>
        <Shot
          i={4}
          caption="El libro diario, con filtros por fecha, cuenta y origen."
        />
        <Text style={s.p}>
          Cada asiento muestra su origen: <Text>Manual</Text> si lo cargó una
          persona, o el proceso que lo generó. Desplegando la flecha se ven sus
          líneas.
        </Text>
        <Li>Un asiento debe cuadrar: la suma del Debe iguala la del Haber.</Li>
        <Li>
          Los asientos no se borran: se anulan, y quedan en el libro como
          historial.
        </Li>
        <Li>
          No se puede imputar a un período cerrado. Para corregir algo viejo hay
          que reabrir el período.
        </Li>

        <Text style={s.h2}>Reglas, Contabilizar y Pendientes</Text>
        <Text style={s.p}>
          Las <Text>reglas</Text> dicen a qué cuenta va cada cosa. Con las
          reglas cargadas, <Text>Contabilizar</Text> genera los asientos de las
          facturas y las liquidaciones de sueldos del período.
        </Text>
        <Note>
          Lo que no encaja en ninguna regla no se imputa a ciegas: va a
          «Pendientes» y frena el cierre del período hasta que alguien lo
          resuelva. Es a propósito.
        </Note>
      </Cap>

      <Cap titulo="3 · CARGAR LOS MOVIMIENTOS (CONT.)" cont>
        <Text style={s.h2}>Bienes de uso</Text>
        <Text style={s.p}>
          Cada bien se carga con su fecha de alta, valor de origen y vida útil.
          De ahí sale el Anexo I y la sugerencia de amortización del ejercicio.
        </Text>
        <Shot
          i={7}
          caption="El Anexo I se arma solo con los bienes cargados."
        />
        <Note>
          El asiento de amortización no se genera solo: el sistema lo sugiere y
          vos lo cargás. Así queda con tu número y tu fecha.
        </Note>
      </Cap>

      {/* ── 4. Ajuste ── */}
      <Cap
        titulo="4 · Ajuste por inflación"
        bajada="Reexpresa el ejercicio a moneda de cierre según la RT 6 / RT 54, y calcula el RECPAM. Va antes de refundir: después las cuentas de resultado quedan en cero y el balance saldría en valores históricos."
      >
        <Text style={s.h2}>Los índices</Text>
        <Text style={s.p}>
          El sistema trae la serie «Índice RT 6 — Res. JG 539/18» de FACPCE
          desde 1993 y la actualiza sola todos los días. También se puede subir
          la planilla a mano o cargar un coeficiente puntual.
        </Text>

        <Text style={s.h2}>La preplanilla</Text>
        <Shot
          i={5}
          caption="Saldo histórico, coeficiente, ajustado y diferencia, cuenta por cuenta."
        />
        <Text style={s.p}>Se mira en cuatro vistas:</Text>
        <Li>
          <Text>Resumen por cuenta</Text> — el cuadro grande, para cruzar contra
          el papel de trabajo.
        </Li>
        <Li>
          <Text>Detalle mes a mes</Text> — la anticuación: cada mes con su
          coeficiente.
        </Li>
        <Li>
          <Text>Coeficientes</Text> — los coeficientes con el índice del que
          salen.
        </Li>
        <Li>
          <Text>Asiento</Text> — el borrador, antes de tocar el libro diario.
        </Li>

        <Text style={s.h2}>Generar el asiento</Text>
        <Text style={s.p}>
          Mientras está en <Text>BORRADOR</Text> no hay nada registrado.
          «Generar asiento» lo escribe en el libro diario con origen propio, y a
          partir de ahí todos los estados salen ajustados.
        </Text>
        <Box>
          Si después de generarlo entra un asiento nuevo, el ajuste se marca
          DESACTUALIZADO y hay que regenerarlo. El sistema no lo hace solo, pero
          no te deja olvidarlo: sin ajuste al día no se puede refundir.
        </Box>
      </Cap>

      {/* ── 5. Estados ── */}
      <Cap
        titulo="5 · Estados Contables"
        bajada="Los estados no se arman: se leen del libro diario. Cambia un asiento y cambian solos."
      >
        <Shot
          i={0}
          w={84}
          caption="El índice lateral agrupa las secciones en Estados, Notas y anexos, y Documento."
        />
        <Text style={s.p}>
          Arriba, dos controles valen para todas las secciones: el{' '}
          <Text>ejercicio</Text> y la <Text>valuación</Text>.
        </Text>
        <View style={s.tHead}>
          <Text style={s.tc1}>Valuación</Text>
          <Text style={s.tc2}>Qué muestra</Text>
        </View>
        <Row
          a="Ajustado por inflación"
          b="Como se presentan los EECC. Incluye el asiento de ajuste."
        />
        <Row
          a="Valores históricos"
          b="El mismo estado sin el ajuste. Papel de trabajo."
        />

        <Text style={s.h2}>Las secciones</Text>
        <Row
          a="Situación Patrimonial"
          b="Activo, pasivo y patrimonio neto, con el comparativo del ejercicio anterior."
        />
        <Row
          a="Resultados"
          b="Del resultado bruto al del ejercicio. El RECPAM va en línea propia."
        />
        <Row
          a="Evolución del PN"
          b="Una columna por cuenta de patrimonio y filas por causa de variación."
        />
        <Row
          a="Flujo de Efectivo"
          b="Método directo. El RECPAM va dentro de actividades operativas."
        />
        <Row
          a="Composición de rubros"
          b="Qué cuentas componen cada rubro. Es una nota más, y se numera por su posición."
        />
        <Row
          a="Inventario"
          b="Todas las cuentas con su saldo, en cuatro columnas en cascada."
        />
        <Row a="Anexo I / Anexo II" b="Bienes de uso y gastos por función." />
        <Row a="Notas" b="Texto libre en Markdown, ordenables." />
        <Row
          a="Informe del auditor"
          b="Se arma desde una plantilla y se rellena con los datos de la empresa."
        />
        <Row
          a="Orden del documento"
          b="En qué posición sale cada sección en el PDF y el Excel."
        />
        <Row a="Exportar" b="Los documentos finales." />

        <Box>
          Cada renglón del balance dice a dónde ir: «Caja y Bancos (Nota 3.1)»,
          «Gastos de administración (s/Anexo II)». La numeración sale sola de la
          posición de la nota, así que nunca apunta al lugar equivocado.
        </Box>
      </Cap>

      {/* ── 6. Notas, orden e informe ── */}
      <Cap
        titulo="6 · Notas, orden e informe"
        bajada="Las tres secciones que definen cómo queda el documento que se firma."
      >
        <Text style={s.h2}>Orden del documento</Text>
        <Shot
          i={8}
          caption="Se arrastra desde el asa o se mueve con las flechas."
        />
        <Text style={s.p}>
          Lista todas las secciones del balance y define en qué orden salen. Una
          nota puede quedar entre dos estados, un anexo antes de otro: lo que la
          presentación pida.
        </Text>
        <Li>
          Las notas se <Text>numeran por su posición</Text>. Moverlas renumera
          todo, incluidas las referencias de los estados.
        </Li>
        <Li>
          Los anexos se renombran ahí mismo. Su nombre no se puede deducir: hay
          estudios que llaman «Anexo I» al costo de mercadería vendida.
        </Li>
        <Li>Una sección sin datos no se imprime, esté donde esté.</Li>
      </Cap>

      <Cap titulo="6 · NOTAS, ORDEN E INFORME (CONT.)" cont>
        <Text style={s.h2}>Informe del auditor</Text>
        <Shot
          i={9}
          caption="La plantilla se rellena con el nombre, el CUIT y el domicilio de la empresa."
        />
        <Text style={s.p}>Se arma en dos pasos:</Text>
        <Step n={1}>
          Elegís una plantilla del estudio, o el «Modelo estándar (RT 37)» que
          trae el sistema.
        </Step>
        <Step n={2}>
          El sistema reemplaza las variables —razón social, CUIT, domicilio,
          fecha de cierre, rango de notas y anexos— y el texto queda editable.
        </Step>
        <Text style={s.p}>
          El lugar y la fecha van en sus campos, abajo. Esa fecha aparece
          también en la leyenda al pie de cada estado.
        </Text>
        <Note>
          Una variable que quedó sin completar se imprime tal cual —
          {'{{notas}}'}— y se avisa arriba. En un documento que se firma, un
          hueco visible es mejor que un párrafo que quedó mal sin que nadie lo
          note.
        </Note>
        <Text style={s.p}>
          Con «Guardar plantilla» el texto actual queda disponible para
          cualquier otra empresa.
        </Text>

        <Text style={s.h2}>La firma del contador</Text>
        <Text style={s.p}>
          Se carga una sola vez, en <Text>Administración</Text>, en la tarjeta
          «Firma del contador (Estados Contables)». No se configura por empresa:
          es la del estudio y sale al pie de cada estado y de cada anexo de
          todos los clientes.
        </Text>
        <Row a="Nombre y apellido" b="Como firma. Ej.: Dr. Juan Pérez." />
        <Row a="Título" b="Contador Público, si no se cambia." />
        <Row a="Universidad" b="La de la matrícula. Ej.: U.B.A." />
        <Row a="Consejo profesional" b="Ej.: C.P.C.E.C.A.B.A." />
        <Row a="Tomo y folio" b="Los de la matrícula." />
        <Row
          a="Imagen de la firma"
          b="Opcional. Se imprime arriba del nombre."
        />
        <View style={{ height: 8 }} />
        <Li>
          La imagen va <Text>embebida en cada PDF</Text> que se genera, así que
          tiene un tope de 300 KB. Una firma recortada pesa unos pocos
          kilobytes; si subís el escaneo entero de la hoja, lo rechaza.
        </Li>
        <Li>
          Conviene <Text>PNG con fondo transparente</Text>: un JPG llega con su
          recuadro blanco y se nota sobre la hoja.
        </Li>
        <Li>
          Sin imagen no falla nada: se deja la línea en blanco para firmar a
          mano sobre el impreso.
        </Li>
        <Note>
          Es lo último que suele faltar y lo primero que se ve. Cargala antes de
          generar el paquete: los EECC ya exportados no la incorporan solos, hay
          que volver a generarlos.
        </Note>
      </Cap>

      {/* ── 7. Cerrar ── */}
      <Cap
        titulo="7 · Cerrar el ejercicio"
        bajada="Tres asientos en orden: refundición, cierre patrimonial y apertura del ejercicio siguiente."
      >
        <Shot
          i={3}
          caption="El chequeo previo, con lo que bloquea en rojo y lo que solo avisa en ámbar."
        />
        <Text style={s.h2}>El chequeo previo</Text>
        <Text style={s.p}>
          Lo que el sistema puede afirmar, bloquea. Lo que es criterio del
          contador, avisa.
        </Text>
        <Row a="Períodos cerrados" b="Los doce del ejercicio. Bloquea." />
        <Row a="Asientos pendientes" b="Nada esperando decisión. Bloquea." />
        <Row a="Balance cuadrado" b="Debe igual a Haber. Bloquea." />
        <Row a="Reglas consistentes" b="Sin condiciones inválidas. Bloquea." />
        <Row
          a="Impuesto a las ganancias"
          b="Avisa si cierra con ganancia y no hay provisión."
        />

        <Text style={s.h2}>Las etapas</Text>
        <Step n={1}>
          <Text>Verificación</Text> — el chequeo de arriba.
        </Step>
        <Step n={2}>
          <Text>Ajustes manuales</Text> — el momento de cargar amortizaciones,
          provisiones y devengamientos.
        </Step>
        <Step n={3}>
          <Text>Refundición</Text> — las cuentas de resultado se vacían contra
          «Resultado del ejercicio». Requiere el ajuste por inflación al día.
        </Step>
        <Step n={4}>
          <Text>Cierre patrimonial</Text> — los saldos patrimoniales van a cero.
        </Step>
        <Step n={5}>
          <Text>Apertura</Text> — se reabren en el ejercicio siguiente, que se
          crea si no existe. Es el arrastre de saldos.
        </Step>
        <Box>
          La apertura arrastra todo lo patrimonial: existencias, efectivo,
          bienes de uso con su amortización acumulada y el patrimonio neto. No
          hay que elegir nada.
        </Box>
      </Cap>

      {/* ── 8. Exportar ── */}
      <Cap
        titulo="8 · Exportar"
        bajada="Cuatro documentos, todos con la valuación elegida arriba."
      >
        <Shot i={10} caption="Los exportes de la solapa Estados Contables." />
        <Row
          a="Paquete contable (EECC)"
          b="El balance completo: carátula, estados, notas, anexos, informe y firmas. Queda guardado en el ejercicio."
        />
        <Row
          a="Libro Mayor"
          b="Todas las cuentas con sus movimientos, una página por cuenta. Formato rubricable."
        />
        <Row
          a="Libro Inventarios y Balances"
          b="Inventario al cierre más los estados. Formato rubricable."
        />
        <Row
          a="Estados en Excel"
          b="Una hoja por estado, para cruzar contra el papel de trabajo."
        />

        <Text style={s.h2}>Aprobar los EECC</Text>
        <Text style={s.p}>
          El botón «Aprobar EECC», arriba a la derecha, congela las notas, el
          orden y el informe. Para volver a editarlos hay que reabrir a
          borrador, y eso queda registrado en Auditoría.
        </Text>

        <Text style={s.h2}>Antes de firmar, revisá</Text>
        <Li>
          Que el ajuste por inflación esté generado y no diga DESACTUALIZADO.
        </Li>
        <Li>
          Que no queden variables sin completar en el informe del auditor.
        </Li>
        <Li>Que el orden del documento sea el que presenta el estudio.</Li>
        <Li>Que los anexos tengan el nombre y el número que usan ustedes.</Li>
        <Li>
          Que los datos del contador estén cargados en Administración: salen al
          pie de cada estado.
        </Li>
      </Cap>
    </Document>
  );
}

const buf = await renderToBuffer((<Manual />) as never);
writeFileSync(OUT, buf);
console.log(
  `✔ ${OUT} · ${Math.round(buf.length / 1024)} KB · ${shots.length} capturas`
);

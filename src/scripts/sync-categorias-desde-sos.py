"""
Lee los archivos de legajos SOS (HTML disfrazado de .xls), compara la columna
'Categoria' de cada empleado con el campo `categoria` en liquidacion_import_empleado,
y genera:
  - Un UPDATE por cada empleado activo sin categoria en DB pero con categoria en SOS
  - Un reporte de discrepancias cuando ambos tienen valor pero difieren

Uso:
  python src/scripts/sync-categorias-desde-sos.py

Requiere: psycopg2  (pip install psycopg2-binary)
"""

import glob, os, re, sys, unicodedata
from html.parser import HTMLParser
from dotenv import load_dotenv

# Forzar UTF-8 en stdout para evitar errores de codificación en Windows
sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

import psycopg2

SOS_DIR = "C:/Users/Brian/Downloads/SOS_empresas_legajos"


# ── Utilidades de normalización ───────────────────────────────────────────────

def norm(s: str) -> str:
    """Lowercase, sin acentos, sin puntuación extra, espacios colapsados."""
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def norm_empresa(s: str) -> str:
    """Normaliza nombre de empresa quitando sufijos legales comunes."""
    s = norm(s)
    for suf in ['sociedad de responsabilidad limitada', 's r l', 'srl', 'sa',
                's a', 'sociedad anonima', 'e i', 'sci fi']:
        s = re.sub(r'\b' + suf + r'\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def norm_nombre(s: str) -> str:
    """Normaliza nombre de persona."""
    # SOS: 'Apellido, Nombre' o 'APELLIDO, NOMBRE'
    # DB: puede ser 'APELLIDO, NOMBRE' o 'Apellido, Nombre'
    return norm(s)


# ── Parser HTML de los XLS ────────────────────────────────────────────────────

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self._row = []
        self._cell = ''
        self._in_cell = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self._row = []
        elif tag in ('td', 'th'):
            self._in_cell = True
            self._cell = ''

    def handle_endtag(self, tag):
        if tag == 'tr':
            if self._row:
                self.rows.append(self._row)
        elif tag in ('td', 'th'):
            self._row.append(self._cell.strip())
            self._in_cell = False

    def handle_data(self, data):
        if self._in_cell:
            self._cell += data

    def handle_entityref(self, name):
        if self._in_cell:
            import html
            self._cell += html.unescape(f'&{name};')


def parse_xls(path: str) -> list[dict]:
    """Devuelve lista de empleados con campos relevantes."""
    for enc in ('latin-1', 'utf-8', 'cp1252'):
        try:
            with open(path, encoding=enc) as f:
                content = f.read()
            break
        except UnicodeDecodeError:
            continue

    parser = TableParser()
    parser.feed(content)

    rows = parser.rows
    if len(rows) < 3:
        return []

    # Fila de encabezado: buscar la que tenga "Apellido y Nombre"
    header_idx = None
    for i, row in enumerate(rows):
        if any('Apellido' in c for c in row):
            header_idx = i
            break
    if header_idx is None:
        return []

    header = rows[header_idx]
    # El encabezado tiene una celda vacía al inicio que los datos no tienen.
    # Buscamos en header[1:] para que el índice resultante coincida con las filas de datos.
    header_data = header[1:] if header and header[0] == '' else header

    def find_col(names):
        for name in names:
            for i, h in enumerate(header_data):
                if name.lower() in h.lower():
                    return i
        return None

    col_nombre    = find_col(['Apellido y Nombre'])
    col_categoria = find_col(['Categoria', 'Categoría'])
    col_situacion = find_col(['Situacion', 'Situación'])
    col_egreso    = find_col(['Fecha de Egreso'])

    if col_nombre is None:
        return []

    empleados = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(filter(lambda x: x is not None,
                                  [col_nombre, col_categoria, col_situacion, 0])):
            continue
        nombre = row[col_nombre].strip() if col_nombre is not None else ''
        if not nombre or nombre.startswith('Reporte'):
            continue
        categoria = row[col_categoria].strip() if col_categoria is not None else ''
        situacion = row[col_situacion].strip() if col_situacion is not None else ''
        egreso    = row[col_egreso].strip()    if col_egreso is not None and len(row) > col_egreso else ''

        # Ignorar empleados dados de baja en SOS
        if egreso or (situacion and 'baja' in situacion.lower()):
            continue

        empleados.append({
            'nombre':    nombre,
            'categoria': categoria if categoria.lower() not in ('', 'sin categoria') else None,
            'situacion': situacion,
        })

    return empleados


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # Cargar todos los profiles
    cur.execute("SELECT id, name FROM profile ORDER BY name")
    profiles = cur.fetchall()  # [(id, name), ...]
    profile_map = {norm_empresa(name): pid for pid, name in profiles}

    # Cargar todos los empleados activos de liquidacion_import_empleado
    cur.execute("""
        SELECT e.id, e.nombre, e.categoria, e.profile_id
        FROM liquidacion_import_empleado e
        WHERE e.activo = true
    """)
    db_empleados = cur.fetchall()  # [(id, nombre, categoria, profile_id)]

    # Agrupar empleados por profile_id → dict norm_nombre → (id, categoria_actual)
    emp_by_profile: dict[str, dict[str, tuple]] = {}
    for eid, enombre, ecat, epid in db_empleados:
        if epid not in emp_by_profile:
            emp_by_profile[epid] = {}
        emp_by_profile[epid][norm_nombre(enombre)] = (eid, ecat)

    # Resultados
    actualizaciones = []   # (eid, nombre_db, empresa, cat_sos)
    discrepancias   = []   # (empresa, nombre, cat_db, cat_sos)
    ya_coinciden    = []
    sin_match_emp   = []   # empleados SOS sin match en DB

    # Recorrer carpetas
    carpetas = sorted([
        d for d in os.listdir(SOS_DIR)
        if os.path.isdir(os.path.join(SOS_DIR, d)) and d != 'SOS_empresas_legajos'
    ])

    empresas_procesadas = 0
    empresas_no_match   = []

    for carpeta in carpetas:
        norm_carp = norm_empresa(carpeta)
        profile_id = profile_map.get(norm_carp)

        # Intento de match parcial si no hay exacto
        if profile_id is None:
            for pk, pid in profile_map.items():
                # Coincidencia si todos los tokens de la carpeta están en el nombre DB
                tokens = norm_carp.split()
                if len(tokens) >= 2 and all(t in pk for t in tokens):
                    profile_id = pid
                    break

        if profile_id is None:
            empresas_no_match.append(carpeta)
            continue

        xls_files = glob.glob(os.path.join(SOS_DIR, carpeta, '*.xls'))
        if not xls_files:
            continue

        empresas_procesadas += 1
        emp_db = emp_by_profile.get(profile_id, {})

        for xls_path in xls_files:
            sos_empleados = parse_xls(xls_path)
            for sos in sos_empleados:
                nk = norm_nombre(sos['nombre'])
                match = emp_db.get(nk)

                if match is None:
                    # Intento fuzzy: buscar si algún key contiene todos los tokens
                    tokens = [t for t in nk.split() if len(t) > 2]
                    for dbk, val in emp_db.items():
                        if all(t in dbk for t in tokens):
                            match = val
                            break

                if match is None:
                    sin_match_emp.append((carpeta, sos['nombre'], sos['categoria']))
                    continue

                eid, cat_db = match
                cat_sos = sos['categoria']

                if cat_db is None and cat_sos:
                    actualizaciones.append((eid, sos['nombre'], carpeta, cat_sos))
                elif cat_db and cat_sos and norm(cat_db) != norm(cat_sos):
                    discrepancias.append((carpeta, sos['nombre'], cat_db, cat_sos))
                elif cat_db == cat_sos or (not cat_db and not cat_sos):
                    ya_coinciden.append((carpeta, sos['nombre']))

    # ── Aplicar actualizaciones ───────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"CATEGORIAS A ACTUALIZAR (cat DB = NULL, cat SOS tiene valor): {len(actualizaciones)}")
    print(f"{'='*70}")
    for eid, nombre, empresa, cat_sos in actualizaciones:
        print(f"  [{empresa}] {nombre} → \"{cat_sos}\"")
        cur.execute(
            "UPDATE liquidacion_import_empleado SET categoria = %s WHERE id = %s",
            (cat_sos, eid)
        )

    print(f"\n{'='*70}")
    print(f"DISCREPANCIAS (cat DB ≠ cat SOS): {len(discrepancias)}")
    print(f"{'='*70}")
    for empresa, nombre, cat_db, cat_sos in discrepancias:
        print(f"  [{empresa}] {nombre}")
        print(f"    DB:  \"{cat_db}\"")
        print(f"    SOS: \"{cat_sos}\"")

    print(f"\n{'='*70}")
    print(f"SIN MATCH EN DB (empleados activos SOS no encontrados): {len(sin_match_emp)}")
    print(f"{'='*70}")
    for empresa, nombre, cat in sin_match_emp:
        print(f"  [{empresa}] {nombre} | cat: {cat or '—'}")

    print(f"\n{'='*70}")
    print(f"RESUMEN")
    print(f"{'='*70}")
    print(f"  Empresas procesadas:     {empresas_procesadas}")
    print(f"  Empresas sin match DB:   {len(empresas_no_match)}")
    print(f"  Empleados actualizados:  {len(actualizaciones)}")
    print(f"  Discrepancias:           {len(discrepancias)}")
    print(f"  Ya coincidían:           {len(ya_coinciden)}")
    print(f"  Sin match en DB:         {len(sin_match_emp)}")

    if empresas_no_match:
        print(f"\n  Carpetas sin match en DB:")
        for c in empresas_no_match:
            print(f"    - {c}")

    conn.commit()
    cur.close()
    conn.close()
    print("\nListo.")


if __name__ == '__main__':
    main()

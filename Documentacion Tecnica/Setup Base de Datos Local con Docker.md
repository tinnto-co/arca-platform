# Setup: Base de Datos Local con Docker

Este documento explica cómo crear una copia local de la base de datos de producción usando Docker. Es útil para desarrollar sin depender de la base remota, probar cambios de esquema sin riesgo, o trabajar sin conexión.

---

## Requisitos previos

- **Docker Desktop** instalado y corriendo.
- **Acceso a la base de datos de producción** (URL con credenciales).
- El archivo `docker-compose.yml` en la raíz del proyecto (ya existe).

---

## Conceptos clave

### ¿Qué es un dump?

Un **dump** es una exportación completa de una base de datos: estructura (tablas, índices, tipos, enums) y datos. Es básicamente un "snapshot" de la base en un momento dado, guardado en un archivo.

La herramienta que lo genera es `pg_dump`, incluida en PostgreSQL.

### ¿Qué es Docker Compose?

Docker Compose permite definir y levantar servicios (contenedores) con un solo comando. En este proyecto, el archivo `docker-compose.yml` define un contenedor de PostgreSQL con las credenciales locales.

### ¿Qué es un volumen Docker?

Un **volumen** (`pgdata` en nuestro caso) es un espacio de almacenamiento persistente gestionado por Docker. Los datos de PostgreSQL se guardan ahí, así que si parás y volvés a levantar el contenedor, los datos siguen estando.

---

## Estructura del `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:17          # Imagen oficial de PostgreSQL versión 17
    container_name: arca-local-db  # Nombre del contenedor (para referenciarlo con docker exec)
    restart: unless-stopped     # Se reinicia automáticamente salvo que lo pares vos
    ports:
      - "5432:5432"             # Mapea el puerto local 5432 al puerto del contenedor
    environment:
      POSTGRES_USER: arca       # Usuario que se crea al inicializar
      POSTGRES_PASSWORD: arca   # Contraseña
      POSTGRES_DB: arca         # Base de datos que se crea automáticamente
    volumes:
      - pgdata:/var/lib/postgresql/data  # Los datos persisten en este volumen

volumes:
  pgdata:  # Declaración del volumen para que Docker lo gestione
```

La URL local resultante es: `postgres://arca:arca@localhost:5432/arca`

---

## Secuencia completa paso a paso

### Paso 1 — Generar el dump de producción

Como no necesariamente tenés `pg_dump` instalado localmente, usamos un contenedor temporal de Docker para ejecutarlo:

```bash
docker run --rm postgres:17 pg_dump \
  "postgres://USUARIO:PASSWORD@HOST:PORT/DATABASE" \
  --no-owner --no-acl -Fc > dump.pgdump
```

**Flags explicados:**
- `--rm`: elimina el contenedor temporal una vez que termina (no deja basura).
- `--no-owner`: no incluye sentencias `ALTER OWNER`, porque el usuario local puede diferir del remoto.
- `--no-acl`: no incluye permisos (`GRANT`/`REVOKE`), por la misma razón.
- `-Fc`: formato **custom** de PostgreSQL. Es binario comprimido, más rápido de restaurar que el SQL plano. Requiere `pg_restore` (no se puede abrir como texto).

El archivo resultante `dump.pgdump` queda en la raíz del proyecto. No se commitea (está en `.gitignore` o debería estarlo).

### Paso 2 — Levantar la base local

```bash
docker compose up -d
```

- `up`: crea y arranca los contenedores definidos en `docker-compose.yml`.
- `-d`: modo detached, corre en segundo plano (no bloquea la terminal).

La primera vez descarga la imagen `postgres:17` desde Docker Hub (~100 MB). Las siguientes veces es instantáneo.

Para verificar que levantó correctamente:
```bash
docker compose ps
# o
docker exec arca-local-db pg_isready -U arca -d arca
```

### Paso 3 — Copiar el dump al contenedor y restaurar

```bash
# Copiar el archivo al sistema de archivos del contenedor
docker cp dump.pgdump arca-local-db:/dump.pgdump

# Restaurar
MSYS_NO_PATHCONV=1 docker exec arca-local-db \
  pg_restore -U arca -d arca --no-owner --no-acl /dump.pgdump
```

**Notas:**
- `docker cp` transfiere archivos entre el host y el contenedor.
- `MSYS_NO_PATHCONV=1` es necesario en Windows con Git Bash para evitar que convierta `/dump.pgdump` a una ruta de Windows (`C:/Program Files/Git/dump.pgdump`). Sin esto, el comando falla.
- `pg_restore` es el inverso de `pg_dump`: lee el formato custom y reconstruye la base.

### Paso 4 — Cambiar el `.env` para usar la base local

En el archivo `.env` del proyecto, comentar la URL remota y descomentar la local:

```env
# Remota (producción) — comentar para desarrollo local
#DATABASE_URL=postgres://postgres:PASSWORD@5.78.132.83:5438/postgres
#MIGRATION_URL=postgres://postgres:PASSWORD@5.78.132.83:5438/postgres

# Local (Docker) — descomentar para desarrollo local
DATABASE_URL=postgres://arca:arca@localhost:5432/arca
MIGRATION_URL=postgres://arca:arca@localhost:5432/arca
```

`DATABASE_URL` es la que usa la app en runtime. `MIGRATION_URL` es la que usa Drizzle para `bun run db:push` (pueden ser distintas en entornos con read replicas, pero acá apuntan al mismo lugar).

### Paso 5 — Levantar la app

```bash
bun run dev
```

---

## Comandos útiles del día a día

```bash
# Ver si el contenedor está corriendo
docker compose ps

# Ver logs del contenedor
docker compose logs db

# Parar el contenedor (sin borrar datos)
docker compose stop

# Volver a levantarlo
docker compose start

# Parar Y eliminar el contenedor (los datos en el volumen se conservan)
docker compose down

# Parar, eliminar contenedor Y borrar el volumen (datos perdidos, reset total)
docker compose down -v

# Conectarse a la base directamente con psql
docker exec -it arca-local-db psql -U arca -d arca

# Ver todas las tablas
MSYS_NO_PATHCONV=1 docker exec arca-local-db psql -U arca -d arca -c "\dt"
```

---

## Actualizar el dump (cuando producción cambia)

Repetir los pasos 1 y 3. Si la base local ya tiene datos, `pg_restore` puede dar errores de "ya existe" en algunos objetos — es normal y no rompe nada. Para hacer un reset limpio:

```bash
# Borrar todo el volumen y empezar de cero
docker compose down -v
docker compose up -d
# Esperar que inicialice, luego restaurar de nuevo
MSYS_NO_PATHCONV=1 docker exec arca-local-db \
  pg_restore -U arca -d arca --no-owner --no-acl /dump.pgdump
```

---

## Consideraciones de seguridad

- El archivo `dump.pgdump` contiene **todos los datos de producción**. No commitearlo a git nunca. Asegurarse que esté en `.gitignore`.
- Las credenciales de producción en `.env` tampoco se commitean. El `.env` ya está en `.gitignore`.

---

## Cómo saber que estás conectado a la base local

Es importante verificarlo antes de hacer cambios de esquema o correr scripts.

### Drizzle Studio

```bash
bun run db:studio
```

Abre en `https://local.drizzle.studio`. El studio usa la variable `MIGRATION_URL` del `.env` — no muestra la URL en pantalla, pero podés verificarla directamente:

```bash
grep MIGRATION_URL .env
```

Si devuelve `localhost:5432` → estás en local. Si devuelve `5.78.132.83` → estás en producción.

También podés abrir cualquier tabla en el studio (por ejemplo `client`) y ver si hay datos que reconocés del dump restaurado.

### Conexión directa con psql

```bash
MSYS_NO_PATHCONV=1 docker exec -it arca-local-db psql -U arca -d arca
```

Desde ahí podés correr cualquier consulta SQL directamente para verificar datos.

---

## Diferencias importantes entre local y producción

### El dump se desactualiza

La base local es una foto del momento en que hiciste el dump. Si en producción se agregan clientes, facturas, empleados, etc., tu local no los tiene. Cuando necesités datos frescos, repetís la secuencia de la sección "Actualizar el dump".

### `bun run db:push` aplica cambios solo en local

Drizzle usa `MIGRATION_URL` del `.env` para aplicar cambios de esquema. Con las líneas locales activas, `bun run db:push` modifica únicamente tu base Docker. Producción no se toca. Esto te permite experimentar con cambios de esquema sin riesgo.

### Los otros servicios siguen apuntando a donde estaban

La base local solo aisla la base de datos. El resto de los servicios sigue igual:
- El scrapper AFIP (`BACKEND_API_URL`) sigue apuntando a `localhost:3002`.
- Gemini (`GEMINI_API_KEY`) sigue siendo el mismo.
- Better Auth sigue usando la misma configuración.

### Git es completamente independiente

Cambiar de branch, hacer commits, o hacer pull no afecta la base local para nada. El volumen Docker vive fuera del repositorio.

---

## Flujo recomendado del día a día

```bash
# Al empezar a trabajar
docker compose start   # si el contenedor estaba parado

# Al terminar
docker compose stop    # pausa el contenedor, los datos quedan intactos

# Cuando necesitás datos frescos de producción
docker run --rm postgres:17 pg_dump \
  "postgres://USUARIO:PASSWORD@HOST:PORT/DATABASE" \
  --no-owner --no-acl -Fc > dump.pgdump
docker compose down -v
docker compose up -d
docker cp "$(pwd)/dump.pgdump" arca-local-db:/dump.pgdump
MSYS_NO_PATHCONV=1 docker exec arca-local-db \
  pg_restore -U arca -d arca --no-owner --no-acl /dump.pgdump
```

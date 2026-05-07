# Réplica de lectura en PostgreSQL para el bot de Arca

El agente AI hace queries contra la base de datos en cada pregunta. Para proteger la primaria de queries pesadas o mal optimizadas, lo ideal es que el bot consulte contra una réplica de solo lectura.

---

## 1. Self-hosted (caso actual — servidor propio en 5.78.132.83)

**Cómo funciona**: PostgreSQL tiene streaming replication nativo. Un servidor secundario replica el WAL (Write-Ahead Log) de la primaria en tiempo real y acepta conexiones de solo lectura.

**Pasos**:
1. En la primaria: configurar `postgresql.conf` (`wal_level = replica`, `max_wal_senders = 3`) y `pg_hba.conf` para permitir la conexión del replica
2. Crear un usuario de replicación: `CREATE ROLE replicator WITH REPLICATION LOGIN`
3. En el servidor secundario: `pg_basebackup` para clonar la primaria, configurar `recovery.conf` / `standby.signal` apuntando a la primaria
4. Iniciar el secundario — queda en modo hot standby (acepta SELECTs)
5. El bot se conecta al host del secundario con el usuario `bot_readonly`

**Pros**:
- Costo cero si ya tenés un segundo servidor disponible
- Control total sobre la configuración
- Lag típico de replicación < 1 segundo en redes locales

**Contras**:
- Tenés que operar y monitorear la réplica (failover manual, backups, etc.)
- Si el servidor primario está en un VPS sin un segundo VPS disponible, necesitás contratar otro servidor
- Complejidad operacional alta si no tenés experiencia con Postgres replication

---

## 2. RDS (AWS) con Read Replica

**Cómo funciona**: AWS crea una instancia secundaria que replica automáticamente desde tu RDS primaria. Te da un endpoint separado de solo lectura.

**Pasos**:
1. En la consola de RDS → tu instancia → "Create read replica"
2. Elegís región y clase de instancia (podés usar una más chica que la primaria)
3. AWS te da un endpoint como `mi-db-replica.xxxx.rds.amazonaws.com`
4. Creás el usuario `bot_readonly` en la primaria (se replica automáticamente)
5. El bot se conecta al endpoint de la réplica

**Pros**:
- Setup en 5 minutos desde la consola
- AWS maneja failover, backups y monitoreo del lag
- Multi-AZ disponible si necesitás alta disponibilidad
- Podés pausar/escalar la réplica independientemente de la primaria

**Contras**:
- Costo adicional (igual o menor que la primaria según el tier)
- Si tu DB actual no está en RDS, migrar tiene fricción
- El lag de replicación puede crecer bajo carga pesada (visible en CloudWatch)

---

## 3. Supabase

**Cómo funciona**: Supabase tiene read replicas disponibles en el plan Pro+. Es una réplica gestionada con un connection string separado.

**Pasos**:
1. En el dashboard de Supabase → Settings → Database → "Add read replica"
2. Elegís la región
3. Te dan un connection string de la réplica
4. Creás `bot_readonly` en la primaria y usás el string de la réplica en el bot

**Pros**:
- El más simple si ya usás Supabase
- Dashboard con métricas de lag incluidas
- Supabase maneja todo (backups, failover, upgrades)

**Contras**:
- Solo disponible en plan Pro ($25/mes) o superior
- Menos flexibilidad de configuración que self-hosted o RDS
- Si migrás desde tu Postgres actual, el proceso de migración tiene sus pasos

---

## 4. PgBouncer + réplica lógica (avanzado)

**Cómo funciona**: En lugar de replicación física, usás replicación lógica (replicar tablas específicas, no todo el servidor). PgBouncer hace connection pooling y puede rutear queries de solo lectura a la réplica automáticamente.

**Pros**:
- Podés replicar solo las tablas que el bot necesita (más liviano)
- Connection pooling mejora la performance del bot

**Contras**:
- Mucho más complejo de configurar y operar
- Replicación lógica tiene limitaciones (no replica DDL automáticamente)
- Solo tiene sentido si ya tenés PgBouncer o volúmenes de conexiones muy altos

---

## Comparación rápida

| Opción | Setup | Costo extra | Operación | Recomendado si... |
|--------|-------|-------------|-----------|-------------------|
| Self-hosted | Alto | Servidor adicional (~$6/mes en Hetzner) | Manual | Tenés experiencia ops y otro VPS disponible |
| RDS Read Replica | Bajo | ~igual a la instancia primaria | AWS lo gestiona | Ya estás en AWS |
| Supabase | Muy bajo | Plan Pro+ ($25/mes) | Supabase lo gestiona | Ya usás Supabase o querés lo más simple |
| PgBouncer + lógica | Muy alto | Variable | Manual | Casos muy específicos de performance |

---

## Para el caso concreto de Arca

La DB actual está en `5.78.132.83` — servidor propio. Las opciones más realistas son:

1. **Self-hosted en un segundo VPS** (Hetzner/DigitalOcean ~$6/mes) con streaming replication — más económico, más trabajo operativo
2. **Migrar a Supabase o RDS** y usar su read replica gestionada — más caro pero cero operación

### Mitigación inmediata sin réplica

Si no querés montar una réplica todavía, el rol `bot_readonly` con los timeouts configurados ya limita bastante el daño posible:

```sql
-- Rol de solo lectura con timeouts de seguridad
CREATE ROLE bot_readonly WITH LOGIN PASSWORD 'tu_password';
GRANT CONNECT ON DATABASE postgres TO bot_readonly;
GRANT USAGE ON SCHEMA public TO bot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bot_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO bot_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO bot_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO bot_readonly;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM bot_readonly;
REVOKE CREATE ON SCHEMA public FROM bot_readonly;

ALTER ROLE bot_readonly SET statement_timeout = '10s';
ALTER ROLE bot_readonly SET idle_in_transaction_session_timeout = '30s';
```

Una query que tarde más de 10 segundos es cancelada automáticamente — el bot nunca puede trabar la DB.

### Integración en el agente (agent.ts)

Una vez que tenés la URL de la réplica (o del usuario bot_readonly apuntando a donde sea):

```env
BOT_DATABASE_URL=postgres://bot_readonly:password@host:5438/postgres
```

```typescript
// src/routes/api/agent.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const botClient = postgres(process.env.BOT_DATABASE_URL!, { prepare: false });
const readonlyDb = drizzle(botClient);

// En el execute del tool executeQuery:
const result = await readonlyDb.execute(sql.raw(withLimit));
```

# Portal del Cliente — Plan de Implementación

**Fecha:** 2026-06-22
**Feature:** BLAK-G — Roles / Usuarios y Organizaciones: Portal de consulta para clientes
**Branch:** `feature/mejoras-sugeridas`

---

## Contexto

El portal del cliente permite que cada cliente (representative) tenga su propio usuario para consultar su información fiscal directamente, sin pasar por el estudio contable.

### Lo que ya existe (no tocar)

- Tabla `representative_user_access` en el schema — vincula un usuario Better Auth a un `representative`, con flags de permisos granulares (`canViewDebts`, `canViewIva`, `canViewPayroll`, `canUploadDocuments`, `canChatAi`)
- Rutas `/_client/portal/*` — layout separado con sidebar propio "Portal del Cliente"
- Server functions en `src/actions/client-portal.tsx` — dashboard, deudas, vencimientos, notificaciones, solicitudes, documentos
- Guard en `src/routes/_client/route.tsx` — si no hay `representativeUserAccess`, redirect a `/login`
- Módulo `portal_cliente` en `organizationModule` — activable desde el admin

### Lo que falta (a construir)

1. Server functions para gestión de usuarios portal (lado estudio)
2. Tab "Portal" en el detalle de cliente para crear/editar/revocar accesos
3. Fix del redirect post-login para usuarios portal

---

## Arquitectura de la solución

### Tipo de usuario portal

Un usuario portal es un usuario Better Auth normal **sin membership en ninguna organización**. Su identidad dentro de la app se resuelve exclusivamente por `representativeUserAccess`. Esto significa:

- Al intentar acceder a `/_authed/*`, `getSessionWithOrg()` tira error → bloqueado naturalmente
- Al acceder a `/_client/portal/*`, el guard verifica `representativeUserAccess` → OK
- No necesita rol ni organización activa

---

## Pieza 1: Server functions de administración del portal

**Archivo:** `src/actions/client-portal.tsx` (agregar al final de la sección "Studio-side server functions")

### `listPortalUsers({ representativeId })`

Lista todos los usuarios con acceso a un representative.

```
getSessionWithOrg()
→ validar que representative.organizationId == orgId  (seguridad multi-tenant)
→ SELECT representativeUserAccess JOIN user (drizzle/auth)
→ retorna: id, userId, name, email, role, permisos, createdAt
```

### `createPortalUser({ representativeId, name, email, password, permissions })`

Crea un usuario nuevo y le da acceso al representative.

```
getSessionWithOrg() + assertCanWrite(role)
→ validar que representative.organizationId == orgId
→ auth.api.createUser({ name, email, password, role: 'user' })   ← Better Auth admin
→ INSERT representativeUserAccess con los permisos recibidos
→ retorna el access row creado
```

**Nota:** `auth.api.createUser` crea el usuario sin requerir verificación de email, lo que es el comportamiento deseado ya que el estudio gestiona las credenciales.

### `updatePortalUserPermissions({ accessId, canViewDebts, canViewIva, canViewPayroll, canUploadDocuments, canChatAi })`

Actualiza los permisos de un acceso existente.

```
getSessionWithOrg() + assertCanWrite(role)
→ SELECT representativeUserAccess JOIN representative para validar orgId
→ UPDATE representativeUserAccess SET permisos
```

### `resetPortalUserPassword({ userId, newPassword })`

Cambia la contraseña de un usuario portal.

```
getSessionWithOrg() + assertCanWrite(role)
→ validar que el userId tiene representativeUserAccess en un representative de esta org
→ auth.api.setUserPassword({ userId, newPassword })   ← Better Auth admin
```

### `revokePortalAccess({ accessId })`

Elimina el acceso de un usuario al portal. El usuario Better Auth queda en la DB (no se elimina) por trazabilidad.

```
getSessionWithOrg() + assertCanWrite(role)
→ validar que el accessId corresponde a un representative de esta org
→ DELETE representativeUserAccess WHERE id = accessId
```

---

## Pieza 2: Tab "Portal" en el detalle de cliente

**Archivo:** `src/components/client-detail-page.tsx`

### Cambios

1. Agregar `TabsTrigger value="portal"` con ícono `UserCheck` (Lucide) al lado de "Solicitudes"
2. Agregar `TabsContent value="portal"` con el componente `PortalAccessTab`
3. Importar las nuevas server functions

### Componente `PortalAccessTab`

```
PortalAccessTab
├── Header: título + botón "Agregar usuario"
├── Tabla de usuarios con acceso:
│   ├── Nombre
│   ├── Email
│   ├── Permisos (badges: IVA, Deudas, Sueldos, Documentos, Chat IA)
│   ├── Fecha de alta
│   └── Acciones: [Editar] [Revocar]
└── Empty state si no hay usuarios
```

### Dialog "Agregar usuario"

Campos:
- Nombre completo (text)
- Email (email)
- Contraseña (password) — el estudio la define y se la comunica al cliente

Permisos (checkboxes, todos activados por defecto excepto Sueldos):
- Ver deudas
- Ver IVA
- Ver sueldos (desactivado por defecto — dato sensible)
- Subir documentos
- Chat con IA

### Dialog "Editar acceso"

- Mismos checkboxes de permisos (pre-llenados con valores actuales)
- Sección separada: "Cambiar contraseña" con campo nueva contraseña + botón confirmar

### Confirmación "Revocar acceso"

Alert dialog estándar: "¿Confirmar revocar acceso de {nombre}?"

---

## Pieza 3: Fix del redirect post-login

**Archivo:** `src/components/login-form.tsx`

### Problema actual

Después de `authClient.signIn.email()`, el `callbackURL` siempre apunta a `/` (dashboard del estudio). Un usuario portal que inicia sesión queda en una pantalla de error porque no tiene `activeOrganizationId`.

### Solución

Después del signin exitoso, antes de navegar, consultar `getPortalSession()`:

```ts
// Post signIn exitoso:
try {
  const portalSession = await getPortalSession();
  if (portalSession) {
    navigate({ to: '/portal' });
    return;
  }
} catch {
  // No es usuario portal, continúa flujo normal
}
navigate({ to: searchParams.redirect || '/' });
```

Esto agrega una consulta extra solo al momento del login, no en cada request.

---

## Flujo completo de uso

```
1. Estudio abre detalle de cliente → tab "Portal"
2. Click "Agregar usuario" → llena nombre, email, contraseña, permisos
3. Se crea usuario en Better Auth + representativeUserAccess
4. Estudio comunica email/contraseña al cliente (por teléfono, WhatsApp, etc.)
5. Cliente entra a la URL de la app, login con sus credenciales
6. Post-login detecta que es usuario portal → redirect a /portal
7. Cliente ve su dashboard: vencimientos, deudas, notificaciones, solicitudes
8. El estudio puede editar permisos o revocar el acceso en cualquier momento
```

---

## Orden de implementación

1. Server functions (`src/actions/client-portal.tsx`)
2. Tab "Portal" en `client-detail-page.tsx`
3. Fix login redirect (`src/components/login-form.tsx`)

---

## Consideraciones de seguridad

- Toda server function de administración valida `orgId` contra `representative.organizationId` — un estudio no puede tocar datos de otro
- `createPortalUser` usa `auth.api.createUser` (Better Auth admin), que corre exclusivamente en server functions — nunca expuesto al cliente
- Un usuario portal no puede escalar a acceso del estudio: no tiene membership, `getSessionWithOrg()` siempre falla para él
- `revokePortalAccess` elimina solo el access row, no el usuario — permite recuperar acceso si fue revocado por error (solo volviendo a crear el access row con el mismo userId)

---

## Archivos a modificar/crear

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/actions/client-portal.tsx` | Agregar 5 server functions al final |
| `src/components/client-detail-page.tsx` | Agregar tab + componente PortalAccessTab |
| `src/components/login-form.tsx` | Fix redirect post-login |

No se requieren migraciones de base de datos.

---

## Pendientes y plan de prueba

### Prueba funcional (a realizar antes de considerar la feature completa)

**Como usuario del estudio:**

1. Ir a Clientes → abrir cualquier cliente
2. Verificar que aparece el tab "Portal" (al lado de "Solicitudes")
3. Click "Agregar usuario" → completar nombre, email, contraseña (mín. 8 caracteres) y permisos
4. Confirmar que el usuario aparece en la tabla con sus badges de permisos

**Como usuario portal (ventana incógnita):**

5. Abrir la app en modo incógnito
6. Login con el email y contraseña creados en el paso 3
7. Verificar que aterriza en `/portal` (no en el dashboard del estudio)
8. Verificar que el dashboard muestra los datos del cliente correcto y respeta los permisos configurados

**Verificar edición y revocación:**

9. Desde el estudio, editar permisos del usuario (quitar alguno) → recargar la ventana incógnita → confirmar que el cambio se refleja
10. Desde el estudio, revocar acceso → recargar la ventana incógnita → confirmar que redirige a `/login`

### Pendiente funcional inmediato

- **Guard del módulo `portal_cliente`:** el tab "Portal" aparece en todos los clientes sin importar si el módulo está activado para la org. Habría que ocultarlo cuando `portal_cliente` está desactivado en `organizationModule`.

### Pendiente funcional futuro

- **Usuario portal con múltiples clientes:** la DB lo soporta (un row de `representativeUserAccess` por representative), pero `getPortalSession()` toma el primero con `.limit(1)`. Si un usuario tiene acceso a más de un cliente, no hay forma de cambiar entre ellos desde el portal.
- **Log de accesos:** no hay auditoría de quién entró al portal ni cuándo.

---

## Lógica aplicada en la implementación

### Decisión de diseño: usuario sin organización

La pregunta central era cómo distinguir un usuario portal de un usuario del estudio. La solución fue **no inventar un nuevo tipo de usuario** — un usuario portal es simplemente un usuario Better Auth normal al que nunca se le asigna membership en ninguna organización.

Esto tiene una consecuencia directa y elegante: todas las rutas del estudio (`/_authed/*`) ya están protegidas por `getSessionWithOrg()`, que lanza error si no hay `activeOrganizationId`. El bloqueo es automático sin ninguna lógica adicional. El sistema de doble ruta preexistente (`/_authed` para el estudio, `/_client` para el portal) ya hacía la separación — solo faltaba el flujo de gestión de accesos.

### Patrón de seguridad multi-tenant en las server functions

Todas las server functions de administración del portal siguen el mismo patrón de validación en cadena:

```
1. getSessionWithOrg()           → confirma que hay un miembro autenticado con org activa
2. assertCanWrite(role)          → bloquea viewers
3. assertRepresentativeOwnership → confirma que el representative pertenece a esa org
```

El tercer paso es el crítico para multi-tenancy: un estudio A no puede crear ni revocar usuarios de un representative que pertenece al estudio B, aunque conozca su UUID. Se implementó como helper privado `assertRepresentativeOwnership()` para no repetir la query en cada función.

Para `updatePortalUserPermissions` y `revokePortalAccess` el input es un `accessId` (UUID del row de acceso), no el `representativeId` directamente. El patrón se adapta: primero se resuelve el `representativeId` desde el access row, y después se valida ownership de ese representative. Esto evita que el frontend tenga que pasar el `representativeId` en cada mutación.

Para `resetPortalUserPassword` el input es un `userId`. La validación es diferente: se buscan todos los `representativeUserAccess` de ese usuario, y se verifica que al menos uno de sus representatives pertenezca al org del llamante. Si el usuario tiene acceso a representatives de múltiples estudios (caso posible en teoría), cualquiera de los estudios puede cambiarle la contraseña — decisión aceptable dado que el estudio que creó al usuario es quien gestiona sus credenciales.

### Creación de usuario: Better Auth admin API

Se usa `auth.api.createUser` del plugin `admin` de Better Auth. Este endpoint corre exclusivamente en el servidor (dentro de un `createServerFn`), nunca se expone al cliente. A diferencia del registro normal, no envía email de verificación ni requiere que el usuario sea el llamante — es una creación programática con permisos de administrador.

La verificación de email duplicado (`SELECT user WHERE email = ?`) se hace antes de llamar a `auth.api.createUser` para dar un mensaje de error claro en castellano, en lugar del error genérico que devolvería Better Auth.

### Reset de contraseña: `auth.api.setUserPassword`

Verificado que existe en Better Auth 1.5.5 (en `better-auth.D39hJv0B.cjs`). Toma `{ userId, newPassword }` y actualiza el hash en la tabla `account` con `providerId = 'credential'`. No requiere la contraseña actual — es un reset administrativo.

### Redirect post-login: detección lazy

En lugar de leer el tipo de usuario durante el login (que requeriría pasar información adicional en la sesión), se hace una consulta a `getPortalSession()` después del signin exitoso. Si tiene `representativeUserAccess`, es usuario portal → va a `/portal`. Si no, flujo normal → va a `/` o al redirect parameter.

El `.catch(() => null)` es intencional: `getPortalSession()` lanza error cuando el usuario no tiene acceso portal (comportamiento normal para usuarios del estudio). El catch convierte eso en `null` sin romper el flujo.

Esta consulta extra solo ocurre en el momento del login, no en cada navegación, por lo que el impacto en performance es mínimo.

### Estado local del componente `PortalAccessTab`

Se optó por manejar el estado de los tres dialogs (crear, editar, revocar) con `useState` local en lugar de un store o URL params, dado que son flujos transitorios que no necesitan persistencia ni compartirse entre rutas. El dialog de edición pre-carga los permisos actuales del usuario al abrirse (`openEdit(u)` copia los valores al estado `editPerms`), de modo que los checkboxes reflejan el estado real sin necesidad de una query adicional.

El cambio de contraseña dentro del dialog de edición es una mutación independiente (`resetPasswordMutation`) que no cierra el dialog al completarse — el usuario puede cambiar contraseña y luego seguir editando permisos en la misma sesión.

-- Para qué se entró, no sólo que se entró.
--
-- Sin esto la bitácora dice "adriana entró a Estudio BLAKG el martes", que es
-- un dato técnico. Con el motivo pasa a ser algo que se le puede mostrar a un
-- cliente que pregunta quién vio sus datos: "alta del estudio", "consulta de
-- soporte #412", "revisión de una sincronización que falló".
ALTER TABLE "superadmin_acceso" ADD COLUMN IF NOT EXISTS "motivo" text;

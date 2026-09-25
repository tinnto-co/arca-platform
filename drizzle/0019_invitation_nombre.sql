-- El nombre de quien se invita, para no pedírselo cuando llega.
--
-- Al dar de alta un estudio, el superadmin carga nombre, apellido y correo del
-- responsable. El correo ya viaja en la invitación; el nombre no tenía dónde
-- guardarse y la persona terminaba tipeándolo de nuevo en la pantalla de alta,
-- cuando quien la invitó ya lo había escrito.
--
-- Es una columna de Better Auth ampliada: su adaptador selecciona campos por
-- nombre, así que una columna de más le es indiferente.
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "nombre" text;

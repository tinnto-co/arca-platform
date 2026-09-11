-- Tres cosas que la vista de chats necesita y la conversación no guardaba:
--
--   fijado      el usuario ancla una conversación arriba de la lista.
--   etiqueta    de qué habla, en una palabra ("Clientes", "Vencimientos"). La
--               escribe el agente al cerrar el primer turno, junto con el
--               título; se muestra antes de la fecha en el listado.
--   compartido  deja que cualquier miembro de la MISMA organización la abra en
--               solo lectura. No la saca de la org: la policy de tenant sigue
--               filtrando por org_id, y el server fn que la lee comprueba el
--               flag además del org.
--
-- `fijado` y `compartido` van NOT NULL con default para no tener que distinguir
-- "false" de "nunca se tocó" en cada consulta.
ALTER TABLE "agent_conversation" ADD COLUMN IF NOT EXISTS "fijado" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD COLUMN IF NOT EXISTS "etiqueta" text;
--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD COLUMN IF NOT EXISTS "compartido" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- El listado ordena por fijado y después por fecha; sin esto cada apertura del
-- panel hace un sort en memoria sobre todas las conversaciones del usuario.
CREATE INDEX IF NOT EXISTS "idx_agent_conversation_fijado" ON "agent_conversation" USING btree ("user_id","fijado","updated_at" DESC);

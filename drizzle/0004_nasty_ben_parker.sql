ALTER TABLE "client" ADD COLUMN "situacion_default_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "condicion_default_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "actividad_default_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "contratacion_default_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "siniestrado_default_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "zona_default_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "obra_social_default_id" uuid;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD COLUMN "fecha_ingreso" timestamp;--> statement-breakpoint
ALTER TABLE "obra_social" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "payroll_actividad" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "payroll_condicion" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "payroll_modalidad_contratacion" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "payroll_siniestrado" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "payroll_situacion" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "payroll_zona" ADD COLUMN "codigo_sos" text;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_situacion_default_id_payroll_situacion_id_fk" FOREIGN KEY ("situacion_default_id") REFERENCES "public"."payroll_situacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_condicion_default_id_payroll_condicion_id_fk" FOREIGN KEY ("condicion_default_id") REFERENCES "public"."payroll_condicion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_actividad_default_id_payroll_actividad_id_fk" FOREIGN KEY ("actividad_default_id") REFERENCES "public"."payroll_actividad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_contratacion_default_id_payroll_modalidad_contratacion_id_fk" FOREIGN KEY ("contratacion_default_id") REFERENCES "public"."payroll_modalidad_contratacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_siniestrado_default_id_payroll_siniestrado_id_fk" FOREIGN KEY ("siniestrado_default_id") REFERENCES "public"."payroll_siniestrado"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_zona_default_id_payroll_zona_id_fk" FOREIGN KEY ("zona_default_id") REFERENCES "public"."payroll_zona"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_obra_social_default_id_obra_social_id_fk" FOREIGN KEY ("obra_social_default_id") REFERENCES "public"."obra_social"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_social" ADD CONSTRAINT "obra_social_codigo_sos_unique" UNIQUE("codigo_sos");--> statement-breakpoint
ALTER TABLE "payroll_actividad" ADD CONSTRAINT "payroll_actividad_codigo_sos_unique" UNIQUE("codigo_sos");--> statement-breakpoint
ALTER TABLE "payroll_condicion" ADD CONSTRAINT "payroll_condicion_codigo_sos_unique" UNIQUE("codigo_sos");--> statement-breakpoint
ALTER TABLE "payroll_modalidad_contratacion" ADD CONSTRAINT "payroll_modalidad_contratacion_codigo_sos_unique" UNIQUE("codigo_sos");--> statement-breakpoint
ALTER TABLE "payroll_siniestrado" ADD CONSTRAINT "payroll_siniestrado_codigo_sos_unique" UNIQUE("codigo_sos");--> statement-breakpoint
ALTER TABLE "payroll_situacion" ADD CONSTRAINT "payroll_situacion_codigo_sos_unique" UNIQUE("codigo_sos");--> statement-breakpoint
ALTER TABLE "payroll_zona" ADD CONSTRAINT "payroll_zona_codigo_sos_unique" UNIQUE("codigo_sos");
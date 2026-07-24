CREATE TABLE "iibb_liquidacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"representative_id" uuid NOT NULL,
	"profile_id" uuid,
	"periodo" text NOT NULL,
	"provincia" text NOT NULL,
	"alicuota" numeric(7, 6) DEFAULT '0.01' NOT NULL,
	"saldo_a_favor" numeric(18, 2) DEFAULT '0' NOT NULL,
	"percepciones_agentes" numeric(18, 2) DEFAULT '0' NOT NULL,
	"percepciones_aduaneras" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retenciones_agentes" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retenciones_bancarias" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "iibb_liquidacion_unique" UNIQUE("org_id","representative_id","profile_id","periodo","provincia")
);
--> statement-breakpoint
ALTER TABLE "iibb_liquidacion" ADD CONSTRAINT "iibb_liquidacion_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iibb_liquidacion" ADD CONSTRAINT "iibb_liquidacion_profile_id_client_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;
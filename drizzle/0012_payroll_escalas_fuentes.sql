ALTER TABLE "payroll_escala"
ADD COLUMN "monto_no_remunerativo" numeric(12, 2) DEFAULT '0' NOT NULL;

ALTER TABLE "payroll_escala"
ADD COLUMN "periodo_label" text;

ALTER TABLE "payroll_escala"
ADD COLUMN "fuente" text;

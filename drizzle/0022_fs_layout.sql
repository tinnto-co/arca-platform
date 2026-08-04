-- Orden de las secciones del documento y rótulos de los anexos.
-- Las dos columnas nacen con default, así que no reescriben la tabla y los
-- balances existentes siguen exponiéndose con el orden de siempre.
ALTER TABLE "financial_statement"
  ADD COLUMN "layout" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "section_labels" jsonb NOT NULL DEFAULT '{}'::jsonb;

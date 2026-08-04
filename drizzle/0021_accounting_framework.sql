-- Norma contable por empresa: define cómo se cita el ajuste por inflación en
-- los Estados Contables. El estudio prepara sus balances bajo RT 54 (entes
-- pequeños); la RT 6 queda para el resto.
CREATE TYPE "accounting_framework" AS ENUM ('rt54', 'rt6');

-- La columna nace con default, así que no reescribe la tabla.
ALTER TABLE "client"
  ADD COLUMN "accounting_framework" "accounting_framework" NOT NULL DEFAULT 'rt54';

-- Reclasificación de cuentas según las respuestas del estudio (julio 2026).
--
-- Los defaults nuevos solo alcanzan a los planes que se siembren de ahora en
-- más; esto actualiza los ya sembrados. La condición sobre el valor actual es
-- deliberada: si el contador ya reclasificó una cuenta a mano, no se pisa.

-- Inversiones temporarias: pasan a monetarias. El estudio las considera
-- equivalentes de efectivo, y el efectivo es monetario.
UPDATE "accounting_account"
SET "inflation_nature" = 'monetaria'
WHERE "account_group" = 'inversiones_temporarias'
  AND "inflation_nature" = 'no_monetaria_valor_corriente';

-- Al integrar el efectivo del EFE dejan de ser una causa de variación.
UPDATE "accounting_account"
SET "cash_flow_activity" = NULL
WHERE "account_group" = 'inversiones_temporarias'
  AND "cash_flow_activity" = 'investing';

-- Inversiones permanentes: se valúan a VPP, que ya está en moneda de cierre.
UPDATE "accounting_account"
SET "inflation_nature" = 'no_monetaria_valor_corriente'
WHERE "account_group" = 'inversiones_permanentes'
  AND "inflation_nature" = 'no_monetaria_costo';

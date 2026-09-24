# Empresas cargadas en la plataforma que NO figuran en la planilla de clientes

**Fecha:** 30/07/2026 — generada contra NEW_DB (post-limpieza de espejos y reps sueltos)
**Para el estudio:** marcar para cada una si **es cliente** (la sumamos a la planilla) o **no** (la damos de baja de la plataforma).

## Con actividad reciente (probablemente clientes reales que faltan en la planilla)

| ¿Cliente? | Empresa | CUIT | Login AFIP (quién la accede) | Comprobantes | Últ. movimiento |
|---|---|---|---|---|---|
| ☐ | VALENTECH S.A. | 30718212479 | Melman Roberto Ezequiel | 11.937 | 07/2026 |
| ☐ | BRAINS MARKET S.R.L. | 30708371544 | Ferreria Gastón Leonardo | 2.113 | 07/2026 |
| ☐ | MUNDO CONCORDE S.A. | 33719344149 | Sayegh Jonathan | 915 | 07/2026 |
| ☐ | BESOROT TOVOT S.A. | 30719305535 | Jafif Alberto Uriel | 385 | 07/2026 |
| ☐ | IMÁGENES MUSCULOESQUELÉTICAS ARGENTINA SRL | 30717273318 | Rolón Alejandro Ulises | 310 | 07/2026 |
| ☐ | GAVAGE SRL | 30715039148 | Ferreria Gastón Leonardo | 34 | 07/2026 |
| ☐ | GRUPO MYD S.A. | 30718061802 | Martínez Cerda Jorge Enrique | 2.016 | 04/2026 |
| ☐ | TEX MEDIA GROUP S.R.L. | 30716852594 | Ferreria Gastón Leonardo | 28 | 05/2026 |
| ☐ | SUCESIÓN DE LERMAN BROSS CELIA | 27923981956 | Moffson Juan Cruz | 26 | 04/2026 |
| ☐ | LUZ CAL S.R.L. | 30714452122 | Sidelnik Aldo | 12 | 04/2026 |
| ☐ | BYTEWAVE S.A. | 30718281810 | Martínez Cerda Jorge Enrique | 5 | 07/2026 |

## Sin ningún comprobante (posibles bajas / cargas erróneas)

| ¿Cliente? | Empresa | CUIT | Login AFIP |
|---|---|---|---|
| ☐ | ALDEZE S.R.L. | 30710412894 | Sidelnik Aldo |
| ☐ | ALVEDI S.R.L. | 30710185391 | Sidelnik Aldo |
| ☐ | BLIEINARA S.R.L. | 30712176683 | Cattach Claudia |
| ☐ | CARNICERÍA KOSHER AJIM S.A. | 30715866508 | Uriel León |
| ☐ | CLAUMI S.R.L. | 30709745960 | Cattach Claudia |
| ☐ | CONSTRUCTORA ARK-FA SRL | 33711983649 | Deze Construcciones Srl |
| ☐ | HERDAR S.R.L. | 30712270337 | Darío Moisés Saban |
| ☐ | SR. FUTTON S.R.L. | 30712284443 | Molina Néstor Adrián |
| ☐ | TURIM S.A. | 30715984802 | Iskandarani Ariel Alejandro |
| ☐ | URIEL LEÓN Y JAIME LEÓN SOC. DE HECHO | 30714967599 | Uriel León |
| ☐ | YEVAREJEJA S.A. | 33716007079 | Cattach Claudia |
| ☐ | MUGIWARAS SA | ⚠️ sin CUIT cargado | Martínez Cerda Jorge Enrique |

## Notas

- Las 11 con actividad tienen facturación scrapeada al día — casi seguro son clientes que faltan en la planilla.
- Las 12 sin comprobantes parecen relaciones AFIP tildadas de más en algún alta.
- Casos vinculados: **BESOROT TOVOT** define el destino de su login JAFIF ALBERTO URIEL (rep sin otros clients). **MUGIWARAS SA** no tiene CUIT cargado en la plataforma — corregir o dar de baja.
- Con la respuesta del estudio: las "sí" se agregan a la planilla (sin cambios en BD); las "no" se dan de baja con backup (mismo procedimiento que los espejos).

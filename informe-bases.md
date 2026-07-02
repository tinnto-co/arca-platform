# INFORME COMPARATIVO: BASE LOCAL vs PRODUCCIÓN
Generado: 24/6/2026, 16:26:32

## 1. VOLUMEN DE TABLAS

| Tabla                              | Local  | Prod   | Diferencia |
|------------------------------------|--------|--------|------------|
| organization                       |      2 |      2 | =          |
| user                               |      1 |      1 | =          |
| member                             |      4 |      4 | =          |
| client                             |    127 |    128 | +1 prod    |
| payroll_situacion                  |     26 |     26 | =          |
| payroll_condicion                  |     12 |     12 | =          |
| payroll_actividad                  |    129 |    129 | =          |
| payroll_modalidad_contratacion     |     78 |     78 | =          |
| payroll_zona                       |    362 |    362 | =          |
| payroll_siniestrado                |     14 |     14 | =          |
| payroll_tipo_empresa               |      8 |      8 | =          |
| obra_social                        |    563 |    563 | =          |
| payroll_convenio                   |     67 |     67 | =          |
| payroll_convenio_categoria         |   1880 |   1880 | =          |
| payroll_escala                     |   7420 |   7420 | =          |
| payroll_concepto                   |     37 |     37 | =          |
| conceptos_completos_sos            |    231 |    231 | =          |
| lsd_perfil_concepto                |    716 |    716 | =          |
| liquidacion_import_empleado        |    241 |    241 | =          |
| liquidacion_import_recibo          |    164 |    168 | +4 prod    |
| liquidacion_import_concepto_valor  |   2148 |   2197 | +49 prod   |
| payroll_lsd_presentacion           |      0 |      0 | =          |
| invoice                            |  60045 |  61468 | +1423 prod |
| movements                          |      0 |      0 | =          |
| notification                       |    662 |    663 | +1 prod    |
| job                                |  17848 |  17572 | +276 local |

## 2. ESTRUCTURA DE CATÁLOGOS AFIP

### 2.1 payroll_situacion — muestra de códigos

LOCAL (primeros 8):
  codigo="01"  codigo_sos=1070  nombre="Activo"
  codigo="05"  codigo_sos=1074  nombre="Licencia por maternidad"
  codigo="06"  codigo_sos=1075  nombre="Suspensiones otras causales"
  codigo="09"  codigo_sos=1078  nombre="Suspendido. Ley 20744 art.223bis"
  codigo="10"  codigo_sos=1079  nombre="Licencia por excedencia"
  codigo="11"  codigo_sos=1080  nombre="Licencia por maternidad Down"
  codigo="12"  codigo_sos=1081  nombre="Licencia por vacaciones"
  codigo="13"  codigo_sos=1082  nombre="Licencia sin goce de haberes"

PROD (primeros 8):
  codigo="01"  codigo_sos=1070  nombre="Activo"
  codigo="05"  codigo_sos=1074  nombre="Licencia por maternidad"
  codigo="06"  codigo_sos=1075  nombre="Suspensiones otras causales"
  codigo="09"  codigo_sos=1078  nombre="Suspendido. Ley 20744 art.223bis"
  codigo="10"  codigo_sos=1079  nombre="Licencia por excedencia"
  codigo="11"  codigo_sos=1080  nombre="Licencia por maternidad Down"
  codigo="12"  codigo_sos=1081  nombre="Licencia por vacaciones"
  codigo="13"  codigo_sos=1082  nombre="Licencia sin goce de haberes"

### 2.2 payroll_modalidad_contratacion — muestra de códigos

LOCAL (primeros 5):
  codigo="022"  codigo_sos=1128  nombre="A Tiempo completo determinado (contrato a plazo fijo)"
  codigo="021"  codigo_sos=1127  nombre="A tiempo parcial determinado (contrato a plazo fijo)"
  codigo="002"  codigo_sos=1115  nombre="Becarios - Residencias médicas Ley 22127"
  codigo="001"  codigo_sos=1107  nombre="A tiempo parcial: Indeterminado /permanente"
  codigo="008"  codigo_sos=1114  nombre="A Tiempo completo indeterminado /Trabajo permanente"

PROD (primeros 5):
  codigo="002"  codigo_sos=1115  nombre="Becarios - Residencias médicas Ley 22127"
  codigo="003"  codigo_sos=1109  nombre="De aprendizaje L.25013"
  codigo="008"  codigo_sos=1114  nombre="A Tiempo completo indeterminado /Trabajo permanente"
  codigo="010"  codigo_sos=NULL  nombre="Practica profesionalizante - Dcto. 1374/11 - Pasantias sin o"
  codigo="011"  codigo_sos=1117  nombre="Trabajo de temporada"

## 3. COLUMNAS — diferencias de schema

✓ client — columnas idénticas
✓ payroll_situacion — columnas idénticas
✓ payroll_convenio — columnas idénticas
✓ liquidacion_import_empleado — columnas idénticas
✓ liquidacion_import_recibo — columnas idénticas

## 4. CONVENIOS CCT

Total local: 67  |  Total prod: 67

## 5. ESCALAS — rango de fechas

LOCAL: 7420 escalas  |  desde Sun Feb 01 2026 00:00:00 GMT-0300 (hora estándar de Argentina)  hasta Fri Jan 01 2027 06:00:00 GMT-0300 (hora estándar de Argentina)
PROD:  7420 escalas  |  desde Sun Feb 01 2026 03:00:00 GMT-0300 (hora estándar de Argentina)  hasta Fri Jan 01 2027 09:00:00 GMT-0300 (hora estándar de Argentina)

## 6. RECIBOS — distribución por período

| Período   | Local | Prod |
|-----------|-------|------|
| 2026-02 |    75 |   75 |
| 2026-03 |    68 |   68 |
| 2026-04 |     2 |    2 |
| 2026-05 |    18 |   19 |
| 2026-06 |     1 |    4 |

## 7. EMPLEADOS — estado

LOCAL: 241 empleados en 35 clientes
PROD:  241 empleados en 35 clientes

## 8. MIGRACIONES DRIZZLE APLICADAS

LOCAL:
  0000_modern_kulan_gath
  0001_add_comprobantes_full_enu
  m
  0002_dear_night_nurse
  0003_add_vencimientos_enum
  0004_great_zzzax
  0005_stale_electro
  0006_mean_peter_parker
  0010_concepto_sos
PROD:
  0000_modern_kulan_gath
  0001_add_comprobantes_full_enu
  m
  0002_dear_night_nurse
  0003_add_vencimientos_enum
  0004_great_zzzax
  0005_stale_electro
  0006_mean_peter_parker
  0010_concepto_sos
  0000_melted_green_goblin
  0001_bitter_miss_america
  710141e22cadf60b625ef304bffab3f96b88968ed651882432bc49449637d553

---
Fin del informe.
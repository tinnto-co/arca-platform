import { relations } from "drizzle-orm/relations";
import { cliente, agentConversation, organization, user, clienteCredencial, credencialAfip, plantillaInformeAuditor, ajusteInflacion, ejercicio, asiento, ajusteInflacionLinea, cuenta, bienDeUso, cierreSueldos, cuentaBancaria, periodoContable, agentRun, recibo, empleado, obraSocial, situacionRevista, tarea, tareaComentario, session, deuda, proyeccionImpuesto, convenioCategoria, escalaSalarial, vencimiento, actividad, condicionTrabajador, convenio, localidad, modalidadContratacion, nacionalidad, provincia, siniestrado, zona, ivaDeclaracion, notificacion, documento, accesoUsuarioCliente, agentMessage, anexoCmv, asientoLinea, reglaMapeo, alerta, job, tareaPaso, account, agentAction, clienteCct, baseCalculo, clienteConcepto, conceptoAfip, concepto, cct, cctFuente, comprobante, contraparte, comprobanteTipo, comprobanteAlicuota, clienteEeccConfig, firmante, clienteCuenta, conciliacionComprobante, movimientoBancario, clienteEmpleadorConfig, liquidacionIibb, organizationModule, lsdPresentacion, member, reglaMapeoLinea, riesgoSnapshot, reciboConcepto, solicitud, notificacionAdjunto, jobLog, eecc, convenioFuente, invitation, tareaColumna, tareaCliente, tareaNotificacion, evento, baseCalculoConcepto } from "./schema";

export const agentConversationRelations = relations(agentConversation, ({one, many}) => ({
	cliente: one(cliente, {
		fields: [agentConversation.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [agentConversation.orgId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [agentConversation.userId],
		references: [user.id]
	}),
	agentRuns: many(agentRun),
	agentMessages: many(agentMessage),
}));

export const clienteRelations = relations(cliente, ({one, many}) => ({
	agentConversations: many(agentConversation),
	clienteCredencials: many(clienteCredencial),
	ajusteInflacions: many(ajusteInflacion),
	bienDeUsos: many(bienDeUso),
	cierreSueldos: many(cierreSueldos),
	cuentaBancarias: many(cuentaBancaria),
	periodoContables: many(periodoContable),
	recibos: many(recibo),
	deudas: many(deuda),
	proyeccionImpuestos: many(proyeccionImpuesto),
	vencimientos: many(vencimiento),
	empleados: many(empleado),
	ivaDeclaracions: many(ivaDeclaracion),
	notificacions: many(notificacion),
	documentos: many(documento),
	agentRuns: many(agentRun),
	accesoUsuarioClientes: many(accesoUsuarioCliente),
	anexoCmvs: many(anexoCmv),
	asientos: many(asiento),
	alertas: many(alerta),
	agentActions: many(agentAction),
	clienteCcts: many(clienteCct),
	clienteConceptos: many(clienteConcepto),
	comprobantes: many(comprobante),
	convenios: many(convenio),
	organization: one(organization, {
		fields: [cliente.orgId],
		references: [organization.id]
	}),
	clienteEeccConfigs: many(clienteEeccConfig),
	clienteCuentas: many(clienteCuenta),
	clienteEmpleadorConfigs: many(clienteEmpleadorConfig),
	liquidacionIibbs: many(liquidacionIibb),
	lsdPresentacions: many(lsdPresentacion),
	reglaMapeos: many(reglaMapeo),
	riesgoSnapshots: many(riesgoSnapshot),
	solicituds: many(solicitud),
	cuentas: many(cuenta),
	ejercicios: many(ejercicio),
	eeccs: many(eecc),
	tareaClientes: many(tareaCliente),
	eventos: many(evento),
	jobs: many(job),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	agentConversations: many(agentConversation),
	plantillaInformeAuditors: many(plantillaInformeAuditor),
	ajusteInflacions: many(ajusteInflacion),
	bienDeUsos: many(bienDeUso),
	cierreSueldos: many(cierreSueldos),
	cuentaBancarias: many(cuentaBancaria),
	recibos: many(recibo),
	deudas: many(deuda),
	credencialAfips: many(credencialAfip),
	vencimientos: many(vencimiento),
	empleados: many(empleado),
	notificacions: many(notificacion),
	documentos: many(documento),
	agentRuns: many(agentRun),
	anexoCmvs: many(anexoCmv),
	asientos: many(asiento),
	alertas: many(alerta),
	agentActions: many(agentAction),
	clienteCcts: many(clienteCct),
	clienteConceptos: many(clienteConcepto),
	comprobantes: many(comprobante),
	convenios: many(convenio),
	clientes: many(cliente),
	liquidacionIibbs: many(liquidacionIibb),
	organizationModules: many(organizationModule),
	lsdPresentacions: many(lsdPresentacion),
	members: many(member),
	reglaMapeos: many(reglaMapeo),
	solicituds: many(solicitud),
	cuentas: many(cuenta),
	ejercicios: many(ejercicio),
	eeccs: many(eecc),
	firmantes: many(firmante),
	invitations: many(invitation),
	tareaColumnas: many(tareaColumna),
	tareas: many(tarea),
	eventos: many(evento),
	jobs: many(job),
}));

export const userRelations = relations(user, ({many}) => ({
	agentConversations: many(agentConversation),
	plantillaInformeAuditors: many(plantillaInformeAuditor),
	ajusteInflacions: many(ajusteInflacion),
	bienDeUsos: many(bienDeUso),
	cierreSueldos_cerradoPor: many(cierreSueldos, {
		relationName: "cierreSueldos_cerradoPor_user_id"
	}),
	cierreSueldos_reabiertoPor: many(cierreSueldos, {
		relationName: "cierreSueldos_reabiertoPor_user_id"
	}),
	periodoContables: many(periodoContable),
	tareaComentarios: many(tareaComentario),
	sessions: many(session),
	vencimientos: many(vencimiento),
	notificacions_asignadaA: many(notificacion, {
		relationName: "notificacion_asignadaA_user_id"
	}),
	notificacions_resueltaPor: many(notificacion, {
		relationName: "notificacion_resueltaPor_user_id"
	}),
	agentRuns: many(agentRun),
	accesoUsuarioClientes: many(accesoUsuarioCliente),
	asientos_anuladoPor: many(asiento, {
		relationName: "asiento_anuladoPor_user_id"
	}),
	asientos_creadoPor: many(asiento, {
		relationName: "asiento_creadoPor_user_id"
	}),
	alertas_asignadaA: many(alerta, {
		relationName: "alerta_asignadaA_user_id"
	}),
	alertas_resueltaPor: many(alerta, {
		relationName: "alerta_resueltaPor_user_id"
	}),
	tareaPasos: many(tareaPaso),
	accounts: many(account),
	agentActions: many(agentAction),
	conciliacionComprobantes: many(conciliacionComprobante),
	members: many(member),
	solicituds: many(solicitud),
	ejercicios_cerradoPor: many(ejercicio, {
		relationName: "ejercicio_cerradoPor_user_id"
	}),
	ejercicios_reabiertoPor: many(ejercicio, {
		relationName: "ejercicio_reabiertoPor_user_id"
	}),
	eeccs_aprobadoPor: many(eecc, {
		relationName: "eecc_aprobadoPor_user_id"
	}),
	eeccs_pdfGeneradoPor: many(eecc, {
		relationName: "eecc_pdfGeneradoPor_user_id"
	}),
	invitations: many(invitation),
	tareas_asignadoA: many(tarea, {
		relationName: "tarea_asignadoA_user_id"
	}),
	tareas_estadoCambiadoPor: many(tarea, {
		relationName: "tarea_estadoCambiadoPor_user_id"
	}),
	tareas_creadoPor: many(tarea, {
		relationName: "tarea_creadoPor_user_id"
	}),
	tareaClientes: many(tareaCliente),
}));

export const clienteCredencialRelations = relations(clienteCredencial, ({one}) => ({
	cliente: one(cliente, {
		fields: [clienteCredencial.clienteId],
		references: [cliente.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [clienteCredencial.credencialId],
		references: [credencialAfip.id]
	}),
}));

export const credencialAfipRelations = relations(credencialAfip, ({one, many}) => ({
	clienteCredencials: many(clienteCredencial),
	deudas: many(deuda),
	organization: one(organization, {
		fields: [credencialAfip.orgId],
		references: [organization.id]
	}),
	vencimientos: many(vencimiento),
	notificacions: many(notificacion),
	documentos: many(documento),
	alertas: many(alerta),
	jobs: many(job),
}));

export const plantillaInformeAuditorRelations = relations(plantillaInformeAuditor, ({one}) => ({
	organization: one(organization, {
		fields: [plantillaInformeAuditor.orgId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [plantillaInformeAuditor.creadoPor],
		references: [user.id]
	}),
}));

export const ajusteInflacionRelations = relations(ajusteInflacion, ({one, many}) => ({
	organization: one(organization, {
		fields: [ajusteInflacion.orgId],
		references: [organization.id]
	}),
	cliente: one(cliente, {
		fields: [ajusteInflacion.clienteId],
		references: [cliente.id]
	}),
	ejercicio: one(ejercicio, {
		fields: [ajusteInflacion.ejercicioId],
		references: [ejercicio.id]
	}),
	asiento: one(asiento, {
		fields: [ajusteInflacion.asientoId],
		references: [asiento.id]
	}),
	user: one(user, {
		fields: [ajusteInflacion.aplicadoPor],
		references: [user.id]
	}),
	ajusteInflacionLineas: many(ajusteInflacionLinea),
}));

export const ejercicioRelations = relations(ejercicio, ({one, many}) => ({
	ajusteInflacions: many(ajusteInflacion),
	periodoContables: many(periodoContable),
	anexoCmvs: many(anexoCmv),
	asientos: many(asiento),
	user_cerradoPor: one(user, {
		fields: [ejercicio.cerradoPor],
		references: [user.id],
		relationName: "ejercicio_cerradoPor_user_id"
	}),
	cliente: one(cliente, {
		fields: [ejercicio.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [ejercicio.orgId],
		references: [organization.id]
	}),
	user_reabiertoPor: one(user, {
		fields: [ejercicio.reabiertoPor],
		references: [user.id],
		relationName: "ejercicio_reabiertoPor_user_id"
	}),
	eeccs: many(eecc),
}));

export const asientoRelations = relations(asiento, ({one, many}) => ({
	ajusteInflacions: many(ajusteInflacion),
	cierreSueldos: many(cierreSueldos),
	asientoLineas: many(asientoLinea),
	agentRun: one(agentRun, {
		fields: [asiento.aiRunId],
		references: [agentRun.id]
	}),
	user_anuladoPor: one(user, {
		fields: [asiento.anuladoPor],
		references: [user.id],
		relationName: "asiento_anuladoPor_user_id"
	}),
	cliente: one(cliente, {
		fields: [asiento.clienteId],
		references: [cliente.id]
	}),
	user_creadoPor: one(user, {
		fields: [asiento.creadoPor],
		references: [user.id],
		relationName: "asiento_creadoPor_user_id"
	}),
	ejercicio: one(ejercicio, {
		fields: [asiento.ejercicioId],
		references: [ejercicio.id]
	}),
	organization: one(organization, {
		fields: [asiento.orgId],
		references: [organization.id]
	}),
	periodoContable: one(periodoContable, {
		fields: [asiento.periodoId],
		references: [periodoContable.id]
	}),
	reglaMapeo: one(reglaMapeo, {
		fields: [asiento.reglaId],
		references: [reglaMapeo.id]
	}),
}));

export const ajusteInflacionLineaRelations = relations(ajusteInflacionLinea, ({one}) => ({
	ajusteInflacion: one(ajusteInflacion, {
		fields: [ajusteInflacionLinea.ajusteId],
		references: [ajusteInflacion.id]
	}),
	cuenta: one(cuenta, {
		fields: [ajusteInflacionLinea.cuentaId],
		references: [cuenta.id]
	}),
}));

export const cuentaRelations = relations(cuenta, ({one, many}) => ({
	ajusteInflacionLineas: many(ajusteInflacionLinea),
	bienDeUsos_cuentaAmortizacionAcumuladaId: many(bienDeUso, {
		relationName: "bienDeUso_cuentaAmortizacionAcumuladaId_cuenta_id"
	}),
	bienDeUsos_cuentaAmortizacionGastoId: many(bienDeUso, {
		relationName: "bienDeUso_cuentaAmortizacionGastoId_cuenta_id"
	}),
	bienDeUsos_cuentaBienId: many(bienDeUso, {
		relationName: "bienDeUso_cuentaBienId_cuenta_id"
	}),
	cuentaBancarias: many(cuentaBancaria),
	asientoLineas: many(asientoLinea),
	clienteCuentas: many(clienteCuenta),
	reglaMapeoLineas: many(reglaMapeoLinea),
	cuenta_cuentaAjusteId: one(cuenta, {
		fields: [cuenta.cuentaAjusteId],
		references: [cuenta.id],
		relationName: "cuenta_cuentaAjusteId_cuenta_id"
	}),
	cuentas_cuentaAjusteId: many(cuenta, {
		relationName: "cuenta_cuentaAjusteId_cuenta_id"
	}),
	cliente: one(cliente, {
		fields: [cuenta.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [cuenta.orgId],
		references: [organization.id]
	}),
	cuenta_padreId: one(cuenta, {
		fields: [cuenta.padreId],
		references: [cuenta.id],
		relationName: "cuenta_padreId_cuenta_id"
	}),
	cuentas_padreId: many(cuenta, {
		relationName: "cuenta_padreId_cuenta_id"
	}),
}));

export const bienDeUsoRelations = relations(bienDeUso, ({one}) => ({
	cliente: one(cliente, {
		fields: [bienDeUso.clienteId],
		references: [cliente.id]
	}),
	user: one(user, {
		fields: [bienDeUso.creadoPor],
		references: [user.id]
	}),
	cuenta_cuentaAmortizacionAcumuladaId: one(cuenta, {
		fields: [bienDeUso.cuentaAmortizacionAcumuladaId],
		references: [cuenta.id],
		relationName: "bienDeUso_cuentaAmortizacionAcumuladaId_cuenta_id"
	}),
	cuenta_cuentaAmortizacionGastoId: one(cuenta, {
		fields: [bienDeUso.cuentaAmortizacionGastoId],
		references: [cuenta.id],
		relationName: "bienDeUso_cuentaAmortizacionGastoId_cuenta_id"
	}),
	cuenta_cuentaBienId: one(cuenta, {
		fields: [bienDeUso.cuentaBienId],
		references: [cuenta.id],
		relationName: "bienDeUso_cuentaBienId_cuenta_id"
	}),
	organization: one(organization, {
		fields: [bienDeUso.orgId],
		references: [organization.id]
	}),
}));

export const cierreSueldosRelations = relations(cierreSueldos, ({one}) => ({
	organization: one(organization, {
		fields: [cierreSueldos.orgId],
		references: [organization.id]
	}),
	cliente: one(cliente, {
		fields: [cierreSueldos.clienteId],
		references: [cliente.id]
	}),
	asiento: one(asiento, {
		fields: [cierreSueldos.asientoId],
		references: [asiento.id]
	}),
	user_cerradoPor: one(user, {
		fields: [cierreSueldos.cerradoPor],
		references: [user.id],
		relationName: "cierreSueldos_cerradoPor_user_id"
	}),
	user_reabiertoPor: one(user, {
		fields: [cierreSueldos.reabiertoPor],
		references: [user.id],
		relationName: "cierreSueldos_reabiertoPor_user_id"
	}),
}));

export const cuentaBancariaRelations = relations(cuentaBancaria, ({one, many}) => ({
	cliente: one(cliente, {
		fields: [cuentaBancaria.clienteId],
		references: [cliente.id]
	}),
	cuenta: one(cuenta, {
		fields: [cuentaBancaria.cuentaContableId],
		references: [cuenta.id]
	}),
	organization: one(organization, {
		fields: [cuentaBancaria.orgId],
		references: [organization.id]
	}),
	movimientoBancarios: many(movimientoBancario),
}));

export const periodoContableRelations = relations(periodoContable, ({one, many}) => ({
	user: one(user, {
		fields: [periodoContable.cerradoPor],
		references: [user.id]
	}),
	cliente: one(cliente, {
		fields: [periodoContable.clienteId],
		references: [cliente.id]
	}),
	ejercicio: one(ejercicio, {
		fields: [periodoContable.ejercicioId],
		references: [ejercicio.id]
	}),
	asientos: many(asiento),
}));

export const reciboRelations = relations(recibo, ({one, many}) => ({
	agentRun: one(agentRun, {
		fields: [recibo.aiRunId],
		references: [agentRun.id]
	}),
	cliente: one(cliente, {
		fields: [recibo.clienteId],
		references: [cliente.id]
	}),
	empleado: one(empleado, {
		fields: [recibo.empleadoId],
		references: [empleado.id]
	}),
	obraSocial: one(obraSocial, {
		fields: [recibo.obraSocialId],
		references: [obraSocial.id]
	}),
	organization: one(organization, {
		fields: [recibo.orgId],
		references: [organization.id]
	}),
	situacionRevista_situacionRevista1Id: one(situacionRevista, {
		fields: [recibo.situacionRevista1Id],
		references: [situacionRevista.id],
		relationName: "recibo_situacionRevista1Id_situacionRevista_id"
	}),
	situacionRevista_situacionRevista2Id: one(situacionRevista, {
		fields: [recibo.situacionRevista2Id],
		references: [situacionRevista.id],
		relationName: "recibo_situacionRevista2Id_situacionRevista_id"
	}),
	situacionRevista_situacionRevista3Id: one(situacionRevista, {
		fields: [recibo.situacionRevista3Id],
		references: [situacionRevista.id],
		relationName: "recibo_situacionRevista3Id_situacionRevista_id"
	}),
	reciboConceptos: many(reciboConcepto),
}));

export const agentRunRelations = relations(agentRun, ({one, many}) => ({
	recibos: many(recibo),
	empleados: many(empleado),
	ivaDeclaracions: many(ivaDeclaracion),
	documentos: many(documento),
	cliente: one(cliente, {
		fields: [agentRun.clienteId],
		references: [cliente.id]
	}),
	agentConversation: one(agentConversation, {
		fields: [agentRun.conversationId],
		references: [agentConversation.id]
	}),
	organization: one(organization, {
		fields: [agentRun.orgId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [agentRun.userId],
		references: [user.id]
	}),
	asientos: many(asiento),
	agentActions: many(agentAction),
	comprobantes: many(comprobante),
	conciliacionComprobantes: many(conciliacionComprobante),
	movimientoBancarios: many(movimientoBancario),
}));

export const empleadoRelations = relations(empleado, ({one, many}) => ({
	recibos: many(recibo),
	actividad: one(actividad, {
		fields: [empleado.actividadId],
		references: [actividad.id]
	}),
	agentRun: one(agentRun, {
		fields: [empleado.aiRunId],
		references: [agentRun.id]
	}),
	convenioCategoria: one(convenioCategoria, {
		fields: [empleado.categoriaId],
		references: [convenioCategoria.id]
	}),
	cliente: one(cliente, {
		fields: [empleado.clienteId],
		references: [cliente.id]
	}),
	condicionTrabajador: one(condicionTrabajador, {
		fields: [empleado.condicionId],
		references: [condicionTrabajador.id]
	}),
	convenio: one(convenio, {
		fields: [empleado.convenioId],
		references: [convenio.id]
	}),
	localidad: one(localidad, {
		fields: [empleado.localidadId],
		references: [localidad.id]
	}),
	modalidadContratacion: one(modalidadContratacion, {
		fields: [empleado.modalidadContratacionId],
		references: [modalidadContratacion.id]
	}),
	nacionalidad: one(nacionalidad, {
		fields: [empleado.nacionalidadId],
		references: [nacionalidad.id]
	}),
	obraSocial: one(obraSocial, {
		fields: [empleado.obraSocialId],
		references: [obraSocial.id]
	}),
	organization: one(organization, {
		fields: [empleado.orgId],
		references: [organization.id]
	}),
	provincia: one(provincia, {
		fields: [empleado.provinciaId],
		references: [provincia.id]
	}),
	siniestrado: one(siniestrado, {
		fields: [empleado.siniestradoId],
		references: [siniestrado.id]
	}),
	situacionRevista: one(situacionRevista, {
		fields: [empleado.situacionId],
		references: [situacionRevista.id]
	}),
	zona: one(zona, {
		fields: [empleado.zonaId],
		references: [zona.id]
	}),
}));

export const obraSocialRelations = relations(obraSocial, ({many}) => ({
	recibos: many(recibo),
	empleados: many(empleado),
}));

export const situacionRevistaRelations = relations(situacionRevista, ({many}) => ({
	recibos_situacionRevista1Id: many(recibo, {
		relationName: "recibo_situacionRevista1Id_situacionRevista_id"
	}),
	recibos_situacionRevista2Id: many(recibo, {
		relationName: "recibo_situacionRevista2Id_situacionRevista_id"
	}),
	recibos_situacionRevista3Id: many(recibo, {
		relationName: "recibo_situacionRevista3Id_situacionRevista_id"
	}),
	empleados: many(empleado),
}));

export const tareaComentarioRelations = relations(tareaComentario, ({one}) => ({
	tarea: one(tarea, {
		fields: [tareaComentario.tareaId],
		references: [tarea.id]
	}),
	user: one(user, {
		fields: [tareaComentario.autorId],
		references: [user.id]
	}),
}));

export const tareaRelations = relations(tarea, ({one, many}) => ({
	tareaComentarios: many(tareaComentario),
	tareaPasos: many(tareaPaso),
	organization: one(organization, {
		fields: [tarea.orgId],
		references: [organization.id]
	}),
	tareaColumna: one(tareaColumna, {
		fields: [tarea.columnaId],
		references: [tareaColumna.id]
	}),
	user_asignadoA: one(user, {
		fields: [tarea.asignadoA],
		references: [user.id],
		relationName: "tarea_asignadoA_user_id"
	}),
	user_estadoCambiadoPor: one(user, {
		fields: [tarea.estadoCambiadoPor],
		references: [user.id],
		relationName: "tarea_estadoCambiadoPor_user_id"
	}),
	user_creadoPor: one(user, {
		fields: [tarea.creadoPor],
		references: [user.id],
		relationName: "tarea_creadoPor_user_id"
	}),
	tareaClientes: many(tareaCliente),
	tareaNotificacions: many(tareaNotificacion),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const deudaRelations = relations(deuda, ({one}) => ({
	cliente: one(cliente, {
		fields: [deuda.clienteId],
		references: [cliente.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [deuda.credencialId],
		references: [credencialAfip.id]
	}),
	organization: one(organization, {
		fields: [deuda.orgId],
		references: [organization.id]
	}),
}));

export const proyeccionImpuestoRelations = relations(proyeccionImpuesto, ({one}) => ({
	cliente: one(cliente, {
		fields: [proyeccionImpuesto.clienteId],
		references: [cliente.id]
	}),
}));

export const escalaSalarialRelations = relations(escalaSalarial, ({one}) => ({
	convenioCategoria: one(convenioCategoria, {
		fields: [escalaSalarial.categoriaId],
		references: [convenioCategoria.id]
	}),
}));

export const convenioCategoriaRelations = relations(convenioCategoria, ({one, many}) => ({
	escalaSalarials: many(escalaSalarial),
	empleados: many(empleado),
	convenio: one(convenio, {
		fields: [convenioCategoria.convenioId],
		references: [convenio.id]
	}),
}));

export const vencimientoRelations = relations(vencimiento, ({one, many}) => ({
	cliente: one(cliente, {
		fields: [vencimiento.clienteId],
		references: [cliente.id]
	}),
	user: one(user, {
		fields: [vencimiento.completadoPor],
		references: [user.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [vencimiento.credencialId],
		references: [credencialAfip.id]
	}),
	organization: one(organization, {
		fields: [vencimiento.orgId],
		references: [organization.id]
	}),
	tareaClientes: many(tareaCliente),
}));

export const actividadRelations = relations(actividad, ({many}) => ({
	empleados: many(empleado),
}));

export const condicionTrabajadorRelations = relations(condicionTrabajador, ({many}) => ({
	empleados: many(empleado),
}));

export const convenioRelations = relations(convenio, ({one, many}) => ({
	empleados: many(empleado),
	cct: one(cct, {
		fields: [convenio.cctCodigo],
		references: [cct.codigo]
	}),
	cliente: one(cliente, {
		fields: [convenio.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [convenio.orgId],
		references: [organization.id]
	}),
	convenioCategorias: many(convenioCategoria),
	convenioFuentes: many(convenioFuente),
}));

export const localidadRelations = relations(localidad, ({many}) => ({
	empleados: many(empleado),
}));

export const modalidadContratacionRelations = relations(modalidadContratacion, ({many}) => ({
	empleados: many(empleado),
}));

export const nacionalidadRelations = relations(nacionalidad, ({many}) => ({
	empleados: many(empleado),
}));

export const provinciaRelations = relations(provincia, ({many}) => ({
	empleados: many(empleado),
}));

export const siniestradoRelations = relations(siniestrado, ({many}) => ({
	empleados: many(empleado),
}));

export const zonaRelations = relations(zona, ({many}) => ({
	empleados: many(empleado),
}));

export const ivaDeclaracionRelations = relations(ivaDeclaracion, ({one}) => ({
	agentRun: one(agentRun, {
		fields: [ivaDeclaracion.aiRunId],
		references: [agentRun.id]
	}),
	cliente: one(cliente, {
		fields: [ivaDeclaracion.clienteId],
		references: [cliente.id]
	}),
}));

export const notificacionRelations = relations(notificacion, ({one, many}) => ({
	user_asignadaA: one(user, {
		fields: [notificacion.asignadaA],
		references: [user.id],
		relationName: "notificacion_asignadaA_user_id"
	}),
	cliente: one(cliente, {
		fields: [notificacion.clienteId],
		references: [cliente.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [notificacion.credencialId],
		references: [credencialAfip.id]
	}),
	organization: one(organization, {
		fields: [notificacion.orgId],
		references: [organization.id]
	}),
	user_resueltaPor: one(user, {
		fields: [notificacion.resueltaPor],
		references: [user.id],
		relationName: "notificacion_resueltaPor_user_id"
	}),
	notificacionAdjuntos: many(notificacionAdjunto),
	tareaNotificacions: many(tareaNotificacion),
}));

export const documentoRelations = relations(documento, ({one, many}) => ({
	agentRun: one(agentRun, {
		fields: [documento.aiRunId],
		references: [agentRun.id]
	}),
	cliente: one(cliente, {
		fields: [documento.clienteId],
		references: [cliente.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [documento.credencialId],
		references: [credencialAfip.id]
	}),
	organization: one(organization, {
		fields: [documento.orgId],
		references: [organization.id]
	}),
	notificacionAdjuntos: many(notificacionAdjunto),
}));

export const accesoUsuarioClienteRelations = relations(accesoUsuarioCliente, ({one}) => ({
	cliente: one(cliente, {
		fields: [accesoUsuarioCliente.clienteId],
		references: [cliente.id]
	}),
	user: one(user, {
		fields: [accesoUsuarioCliente.userId],
		references: [user.id]
	}),
}));

export const agentMessageRelations = relations(agentMessage, ({one}) => ({
	agentConversation: one(agentConversation, {
		fields: [agentMessage.conversationId],
		references: [agentConversation.id]
	}),
}));

export const anexoCmvRelations = relations(anexoCmv, ({one}) => ({
	cliente: one(cliente, {
		fields: [anexoCmv.clienteId],
		references: [cliente.id]
	}),
	ejercicio: one(ejercicio, {
		fields: [anexoCmv.ejercicioId],
		references: [ejercicio.id]
	}),
	organization: one(organization, {
		fields: [anexoCmv.orgId],
		references: [organization.id]
	}),
}));

export const asientoLineaRelations = relations(asientoLinea, ({one}) => ({
	asiento: one(asiento, {
		fields: [asientoLinea.asientoId],
		references: [asiento.id]
	}),
	cuenta: one(cuenta, {
		fields: [asientoLinea.cuentaId],
		references: [cuenta.id]
	}),
}));

export const reglaMapeoRelations = relations(reglaMapeo, ({one, many}) => ({
	asientos: many(asiento),
	cliente: one(cliente, {
		fields: [reglaMapeo.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [reglaMapeo.orgId],
		references: [organization.id]
	}),
	reglaMapeoLineas: many(reglaMapeoLinea),
}));

export const alertaRelations = relations(alerta, ({one}) => ({
	user_asignadaA: one(user, {
		fields: [alerta.asignadaA],
		references: [user.id],
		relationName: "alerta_asignadaA_user_id"
	}),
	cliente: one(cliente, {
		fields: [alerta.clienteId],
		references: [cliente.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [alerta.credencialId],
		references: [credencialAfip.id]
	}),
	organization: one(organization, {
		fields: [alerta.orgId],
		references: [organization.id]
	}),
	job: one(job, {
		fields: [alerta.origenId],
		references: [job.id]
	}),
	user_resueltaPor: one(user, {
		fields: [alerta.resueltaPor],
		references: [user.id],
		relationName: "alerta_resueltaPor_user_id"
	}),
}));

export const jobRelations = relations(job, ({one, many}) => ({
	alertas: many(alerta),
	jobLogs: many(jobLog),
	cliente: one(cliente, {
		fields: [job.clienteId],
		references: [cliente.id]
	}),
	credencialAfip: one(credencialAfip, {
		fields: [job.credencialId],
		references: [credencialAfip.id]
	}),
	organization: one(organization, {
		fields: [job.orgId],
		references: [organization.id]
	}),
}));

export const tareaPasoRelations = relations(tareaPaso, ({one}) => ({
	tarea: one(tarea, {
		fields: [tareaPaso.tareaId],
		references: [tarea.id]
	}),
	user: one(user, {
		fields: [tareaPaso.completadoPor],
		references: [user.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const agentActionRelations = relations(agentAction, ({one}) => ({
	agentRun: one(agentRun, {
		fields: [agentAction.agentRunId],
		references: [agentRun.id]
	}),
	cliente: one(cliente, {
		fields: [agentAction.clienteId],
		references: [cliente.id]
	}),
	user: one(user, {
		fields: [agentAction.decididoPor],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [agentAction.orgId],
		references: [organization.id]
	}),
}));

export const clienteCctRelations = relations(clienteCct, ({one}) => ({
	cliente: one(cliente, {
		fields: [clienteCct.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [clienteCct.orgId],
		references: [organization.id]
	}),
}));

export const clienteConceptoRelations = relations(clienteConcepto, ({one}) => ({
	baseCalculo: one(baseCalculo, {
		fields: [clienteConcepto.baseCalculoId],
		references: [baseCalculo.id]
	}),
	cliente: one(cliente, {
		fields: [clienteConcepto.clienteId],
		references: [cliente.id]
	}),
	conceptoAfip: one(conceptoAfip, {
		fields: [clienteConcepto.conceptoAfipId],
		references: [conceptoAfip.id]
	}),
	concepto: one(concepto, {
		fields: [clienteConcepto.conceptoId],
		references: [concepto.id]
	}),
	organization: one(organization, {
		fields: [clienteConcepto.orgId],
		references: [organization.id]
	}),
}));

export const baseCalculoRelations = relations(baseCalculo, ({many}) => ({
	clienteConceptos: many(clienteConcepto),
	conceptos: many(concepto),
	baseCalculoConceptos: many(baseCalculoConcepto),
}));

export const conceptoAfipRelations = relations(conceptoAfip, ({many}) => ({
	clienteConceptos: many(clienteConcepto),
}));

export const conceptoRelations = relations(concepto, ({one, many}) => ({
	clienteConceptos: many(clienteConcepto),
	baseCalculo: one(baseCalculo, {
		fields: [concepto.baseCalculoId],
		references: [baseCalculo.id]
	}),
	reciboConceptos: many(reciboConcepto),
	baseCalculoConceptos: many(baseCalculoConcepto),
}));

export const cctFuenteRelations = relations(cctFuente, ({one}) => ({
	cct: one(cct, {
		fields: [cctFuente.cctCodigo],
		references: [cct.codigo]
	}),
}));

export const cctRelations = relations(cct, ({many}) => ({
	cctFuentes: many(cctFuente),
	convenios: many(convenio),
}));

export const comprobanteRelations = relations(comprobante, ({one, many}) => ({
	agentRun: one(agentRun, {
		fields: [comprobante.aiRunId],
		references: [agentRun.id]
	}),
	cliente: one(cliente, {
		fields: [comprobante.clienteId],
		references: [cliente.id]
	}),
	contraparte: one(contraparte, {
		fields: [comprobante.contraparteId],
		references: [contraparte.id]
	}),
	organization: one(organization, {
		fields: [comprobante.orgId],
		references: [organization.id]
	}),
	comprobanteTipo: one(comprobanteTipo, {
		fields: [comprobante.tipo],
		references: [comprobanteTipo.codigo]
	}),
	comprobanteAlicuotas: many(comprobanteAlicuota),
	conciliacionComprobantes: many(conciliacionComprobante),
}));

export const contraparteRelations = relations(contraparte, ({many}) => ({
	comprobantes: many(comprobante),
	movimientoBancarios: many(movimientoBancario),
}));

export const comprobanteTipoRelations = relations(comprobanteTipo, ({many}) => ({
	comprobantes: many(comprobante),
}));

export const comprobanteAlicuotaRelations = relations(comprobanteAlicuota, ({one}) => ({
	comprobante: one(comprobante, {
		fields: [comprobanteAlicuota.comprobanteId],
		references: [comprobante.id]
	}),
}));

export const clienteEeccConfigRelations = relations(clienteEeccConfig, ({one}) => ({
	cliente: one(cliente, {
		fields: [clienteEeccConfig.clienteId],
		references: [cliente.id]
	}),
	firmante: one(firmante, {
		fields: [clienteEeccConfig.firmanteId],
		references: [firmante.id]
	}),
}));

export const firmanteRelations = relations(firmante, ({one, many}) => ({
	clienteEeccConfigs: many(clienteEeccConfig),
	organization: one(organization, {
		fields: [firmante.orgId],
		references: [organization.id]
	}),
}));

export const clienteCuentaRelations = relations(clienteCuenta, ({one}) => ({
	cliente: one(cliente, {
		fields: [clienteCuenta.clienteId],
		references: [cliente.id]
	}),
	cuenta: one(cuenta, {
		fields: [clienteCuenta.cuentaId],
		references: [cuenta.id]
	}),
}));

export const conciliacionComprobanteRelations = relations(conciliacionComprobante, ({one}) => ({
	agentRun: one(agentRun, {
		fields: [conciliacionComprobante.aiRunId],
		references: [agentRun.id]
	}),
	comprobante: one(comprobante, {
		fields: [conciliacionComprobante.comprobanteId],
		references: [comprobante.id]
	}),
	movimientoBancario: one(movimientoBancario, {
		fields: [conciliacionComprobante.movimientoBancarioId],
		references: [movimientoBancario.id]
	}),
	user: one(user, {
		fields: [conciliacionComprobante.revisadoPor],
		references: [user.id]
	}),
}));

export const movimientoBancarioRelations = relations(movimientoBancario, ({one, many}) => ({
	conciliacionComprobantes: many(conciliacionComprobante),
	agentRun: one(agentRun, {
		fields: [movimientoBancario.aiRunId],
		references: [agentRun.id]
	}),
	contraparte: one(contraparte, {
		fields: [movimientoBancario.contraparteId],
		references: [contraparte.id]
	}),
	cuentaBancaria: one(cuentaBancaria, {
		fields: [movimientoBancario.cuentaBancariaId],
		references: [cuentaBancaria.id]
	}),
}));

export const clienteEmpleadorConfigRelations = relations(clienteEmpleadorConfig, ({one}) => ({
	cliente: one(cliente, {
		fields: [clienteEmpleadorConfig.clienteId],
		references: [cliente.id]
	}),
}));

export const liquidacionIibbRelations = relations(liquidacionIibb, ({one}) => ({
	cliente: one(cliente, {
		fields: [liquidacionIibb.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [liquidacionIibb.orgId],
		references: [organization.id]
	}),
}));

export const organizationModuleRelations = relations(organizationModule, ({one}) => ({
	organization: one(organization, {
		fields: [organizationModule.orgId],
		references: [organization.id]
	}),
}));

export const lsdPresentacionRelations = relations(lsdPresentacion, ({one}) => ({
	cliente: one(cliente, {
		fields: [lsdPresentacion.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [lsdPresentacion.orgId],
		references: [organization.id]
	}),
}));

export const memberRelations = relations(member, ({one}) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id]
	}),
}));

export const reglaMapeoLineaRelations = relations(reglaMapeoLinea, ({one}) => ({
	cuenta: one(cuenta, {
		fields: [reglaMapeoLinea.cuentaId],
		references: [cuenta.id]
	}),
	reglaMapeo: one(reglaMapeo, {
		fields: [reglaMapeoLinea.reglaId],
		references: [reglaMapeo.id]
	}),
}));

export const riesgoSnapshotRelations = relations(riesgoSnapshot, ({one}) => ({
	cliente: one(cliente, {
		fields: [riesgoSnapshot.clienteId],
		references: [cliente.id]
	}),
}));

export const reciboConceptoRelations = relations(reciboConcepto, ({one}) => ({
	concepto: one(concepto, {
		fields: [reciboConcepto.conceptoId],
		references: [concepto.id]
	}),
	recibo: one(recibo, {
		fields: [reciboConcepto.reciboId],
		references: [recibo.id]
	}),
}));

export const solicitudRelations = relations(solicitud, ({one}) => ({
	cliente: one(cliente, {
		fields: [solicitud.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [solicitud.orgId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [solicitud.pedidaPor],
		references: [user.id]
	}),
}));

export const notificacionAdjuntoRelations = relations(notificacionAdjunto, ({one}) => ({
	documento: one(documento, {
		fields: [notificacionAdjunto.documentoId],
		references: [documento.id]
	}),
	notificacion: one(notificacion, {
		fields: [notificacionAdjunto.notificacionId],
		references: [notificacion.id]
	}),
}));

export const jobLogRelations = relations(jobLog, ({one}) => ({
	job: one(job, {
		fields: [jobLog.jobId],
		references: [job.id]
	}),
}));

export const eeccRelations = relations(eecc, ({one}) => ({
	user_aprobadoPor: one(user, {
		fields: [eecc.aprobadoPor],
		references: [user.id],
		relationName: "eecc_aprobadoPor_user_id"
	}),
	cliente: one(cliente, {
		fields: [eecc.clienteId],
		references: [cliente.id]
	}),
	ejercicio: one(ejercicio, {
		fields: [eecc.ejercicioId],
		references: [ejercicio.id]
	}),
	organization: one(organization, {
		fields: [eecc.orgId],
		references: [organization.id]
	}),
	user_pdfGeneradoPor: one(user, {
		fields: [eecc.pdfGeneradoPor],
		references: [user.id],
		relationName: "eecc_pdfGeneradoPor_user_id"
	}),
}));

export const convenioFuenteRelations = relations(convenioFuente, ({one}) => ({
	convenio: one(convenio, {
		fields: [convenioFuente.convenioId],
		references: [convenio.id]
	}),
}));

export const invitationRelations = relations(invitation, ({one}) => ({
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
}));

export const tareaColumnaRelations = relations(tareaColumna, ({one, many}) => ({
	organization: one(organization, {
		fields: [tareaColumna.orgId],
		references: [organization.id]
	}),
	tareas: many(tarea),
}));

export const tareaClienteRelations = relations(tareaCliente, ({one}) => ({
	tarea: one(tarea, {
		fields: [tareaCliente.tareaId],
		references: [tarea.id]
	}),
	cliente: one(cliente, {
		fields: [tareaCliente.clienteId],
		references: [cliente.id]
	}),
	user: one(user, {
		fields: [tareaCliente.completadoPor],
		references: [user.id]
	}),
	vencimiento: one(vencimiento, {
		fields: [tareaCliente.vencimientoId],
		references: [vencimiento.id]
	}),
}));

export const tareaNotificacionRelations = relations(tareaNotificacion, ({one}) => ({
	tarea: one(tarea, {
		fields: [tareaNotificacion.tareaId],
		references: [tarea.id]
	}),
	notificacion: one(notificacion, {
		fields: [tareaNotificacion.notificacionId],
		references: [notificacion.id]
	}),
}));

export const eventoRelations = relations(evento, ({one}) => ({
	cliente: one(cliente, {
		fields: [evento.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [evento.orgId],
		references: [organization.id]
	}),
}));

export const baseCalculoConceptoRelations = relations(baseCalculoConcepto, ({one}) => ({
	baseCalculo: one(baseCalculo, {
		fields: [baseCalculoConcepto.baseCalculoId],
		references: [baseCalculo.id]
	}),
	concepto: one(concepto, {
		fields: [baseCalculoConcepto.conceptoId],
		references: [concepto.id]
	}),
}));
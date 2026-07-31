import { relations } from "drizzle-orm/relations";
import { cliente, anexoCmv, ejercicio, organization, agentConversation, user, agentRun, agentAction, concepto, reciboConcepto, recibo, convenio, convenioCategoria, bienDeUso, cuenta, movimientoBancario, contraparte, cuentaBancaria, invitation, member, clienteCredencial, credencialAfip, evento, comprobante, comprobanteTipo, alerta, job, solicitud, riesgoSnapshot, proyeccionImpuesto, notificacion, clienteConcepto, conceptoAfip, cct, actividad, empleado, condicionTrabajador, localidad, modalidadContratacion, nacionalidad, obraSocial, provincia, siniestrado, situacionRevista, zona, clienteCct, lsdPresentacion, asiento, periodoContable, reglaMapeo, eecc, firmante, conciliacionComprobante, documento, accesoUsuarioCliente, organizationModule, asientoLinea, reglaMapeoLinea, jobLog, agentMessage, comprobanteAlicuota, clienteEmpleadorConfig, session, account, clienteEeccConfig, clienteCuenta, ivaDeclaracion, deuda, vencimiento, liquidacionIibb, escalaSalarial, convenioFuente, notificacionAdjunto } from "./schema";

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

export const clienteRelations = relations(cliente, ({one, many}) => ({
	anexoCmvs: many(anexoCmv),
	agentConversations: many(agentConversation),
	agentRuns: many(agentRun),
	agentActions: many(agentAction),
	bienDeUsos: many(bienDeUso),
	ejercicios: many(ejercicio),
	cuentaBancarias: many(cuentaBancaria),
	organization: one(organization, {
		fields: [cliente.orgId],
		references: [organization.id]
	}),
	clienteCredencials: many(clienteCredencial),
	eventos: many(evento),
	comprobantes: many(comprobante),
	alertas: many(alerta),
	solicituds: many(solicitud),
	riesgoSnapshots: many(riesgoSnapshot),
	proyeccionImpuestos: many(proyeccionImpuesto),
	notificacions: many(notificacion),
	clienteConceptos: many(clienteConcepto),
	convenios: many(convenio),
	empleados: many(empleado),
	clienteCcts: many(clienteCct),
	lsdPresentacions: many(lsdPresentacion),
	asientos: many(asiento),
	reglaMapeos: many(reglaMapeo),
	periodoContables: many(periodoContable),
	eeccs: many(eecc),
	documentos: many(documento),
	accesoUsuarioClientes: many(accesoUsuarioCliente),
	clienteEmpleadorConfigs: many(clienteEmpleadorConfig),
	clienteEeccConfigs: many(clienteEeccConfig),
	clienteCuentas: many(clienteCuenta),
	cuentas: many(cuenta),
	recibos: many(recibo),
	jobs: many(job),
	ivaDeclaracions: many(ivaDeclaracion),
	deudas: many(deuda),
	vencimientos: many(vencimiento),
	liquidacionIibbs: many(liquidacionIibb),
}));

export const ejercicioRelations = relations(ejercicio, ({one, many}) => ({
	anexoCmvs: many(anexoCmv),
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
	asientos: many(asiento),
	periodoContables: many(periodoContable),
	eeccs: many(eecc),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	anexoCmvs: many(anexoCmv),
	agentConversations: many(agentConversation),
	agentRuns: many(agentRun),
	agentActions: many(agentAction),
	bienDeUsos: many(bienDeUso),
	ejercicios: many(ejercicio),
	invitations: many(invitation),
	members: many(member),
	cuentaBancarias: many(cuentaBancaria),
	clientes: many(cliente),
	eventos: many(evento),
	comprobantes: many(comprobante),
	alertas: many(alerta),
	solicituds: many(solicitud),
	notificacions: many(notificacion),
	clienteConceptos: many(clienteConcepto),
	convenios: many(convenio),
	empleados: many(empleado),
	clienteCcts: many(clienteCct),
	lsdPresentacions: many(lsdPresentacion),
	asientos: many(asiento),
	reglaMapeos: many(reglaMapeo),
	eeccs: many(eecc),
	firmantes: many(firmante),
	documentos: many(documento),
	organizationModules: many(organizationModule),
	credencialAfips: many(credencialAfip),
	cuentas: many(cuenta),
	recibos: many(recibo),
	jobs: many(job),
	deudas: many(deuda),
	vencimientos: many(vencimiento),
	liquidacionIibbs: many(liquidacionIibb),
}));

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

export const userRelations = relations(user, ({many}) => ({
	agentConversations: many(agentConversation),
	agentRuns: many(agentRun),
	agentActions: many(agentAction),
	bienDeUsos: many(bienDeUso),
	ejercicios_cerradoPor: many(ejercicio, {
		relationName: "ejercicio_cerradoPor_user_id"
	}),
	ejercicios_reabiertoPor: many(ejercicio, {
		relationName: "ejercicio_reabiertoPor_user_id"
	}),
	invitations: many(invitation),
	members: many(member),
	alertas_asignadaA: many(alerta, {
		relationName: "alerta_asignadaA_user_id"
	}),
	alertas_resueltaPor: many(alerta, {
		relationName: "alerta_resueltaPor_user_id"
	}),
	solicituds: many(solicitud),
	notificacions_asignadaA: many(notificacion, {
		relationName: "notificacion_asignadaA_user_id"
	}),
	notificacions_resueltaPor: many(notificacion, {
		relationName: "notificacion_resueltaPor_user_id"
	}),
	asientos_anuladoPor: many(asiento, {
		relationName: "asiento_anuladoPor_user_id"
	}),
	asientos_creadoPor: many(asiento, {
		relationName: "asiento_creadoPor_user_id"
	}),
	periodoContables: many(periodoContable),
	eeccs_aprobadoPor: many(eecc, {
		relationName: "eecc_aprobadoPor_user_id"
	}),
	eeccs_pdfGeneradoPor: many(eecc, {
		relationName: "eecc_pdfGeneradoPor_user_id"
	}),
	conciliacionComprobantes: many(conciliacionComprobante),
	accesoUsuarioClientes: many(accesoUsuarioCliente),
	sessions: many(session),
	accounts: many(account),
	vencimientos: many(vencimiento),
}));

export const agentRunRelations = relations(agentRun, ({one, many}) => ({
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
	agentActions: many(agentAction),
	movimientoBancarios: many(movimientoBancario),
	comprobantes: many(comprobante),
	empleados: many(empleado),
	asientos: many(asiento),
	conciliacionComprobantes: many(conciliacionComprobante),
	documentos: many(documento),
	recibos: many(recibo),
	ivaDeclaracions: many(ivaDeclaracion),
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

export const conceptoRelations = relations(concepto, ({one, many}) => ({
	reciboConceptos: many(reciboConcepto),
	clienteConceptos: many(clienteConcepto),
	conceptoAfip: one(conceptoAfip, {
		fields: [concepto.codigoAfip],
		references: [conceptoAfip.codigo]
	}),
}));

export const reciboRelations = relations(recibo, ({one, many}) => ({
	reciboConceptos: many(reciboConcepto),
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
}));

export const convenioCategoriaRelations = relations(convenioCategoria, ({one, many}) => ({
	convenio: one(convenio, {
		fields: [convenioCategoria.convenioId],
		references: [convenio.id]
	}),
	empleados: many(empleado),
	escalaSalarials: many(escalaSalarial),
}));

export const convenioRelations = relations(convenio, ({one, many}) => ({
	convenioCategorias: many(convenioCategoria),
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
	empleados: many(empleado),
	convenioFuentes: many(convenioFuente),
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

export const cuentaRelations = relations(cuenta, ({one, many}) => ({
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
	reglaMapeoLineas: many(reglaMapeoLinea),
	clienteCuentas: many(clienteCuenta),
	cliente: one(cliente, {
		fields: [cuenta.clienteId],
		references: [cliente.id]
	}),
	organization: one(organization, {
		fields: [cuenta.orgId],
		references: [organization.id]
	}),
	cuenta: one(cuenta, {
		fields: [cuenta.padreId],
		references: [cuenta.id],
		relationName: "cuenta_padreId_cuenta_id"
	}),
	cuentas: many(cuenta, {
		relationName: "cuenta_padreId_cuenta_id"
	}),
}));

export const movimientoBancarioRelations = relations(movimientoBancario, ({one, many}) => ({
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
	conciliacionComprobantes: many(conciliacionComprobante),
}));

export const contraparteRelations = relations(contraparte, ({many}) => ({
	movimientoBancarios: many(movimientoBancario),
	comprobantes: many(comprobante),
}));

export const cuentaBancariaRelations = relations(cuentaBancaria, ({one, many}) => ({
	movimientoBancarios: many(movimientoBancario),
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
	alertas: many(alerta),
	notificacions: many(notificacion),
	documentos: many(documento),
	organization: one(organization, {
		fields: [credencialAfip.orgId],
		references: [organization.id]
	}),
	jobs: many(job),
	deudas: many(deuda),
	vencimientos: many(vencimiento),
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
	conciliacionComprobantes: many(conciliacionComprobante),
	comprobanteAlicuotas: many(comprobanteAlicuota),
}));

export const comprobanteTipoRelations = relations(comprobanteTipo, ({many}) => ({
	comprobantes: many(comprobante),
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

export const riesgoSnapshotRelations = relations(riesgoSnapshot, ({one}) => ({
	cliente: one(cliente, {
		fields: [riesgoSnapshot.clienteId],
		references: [cliente.id]
	}),
}));

export const proyeccionImpuestoRelations = relations(proyeccionImpuesto, ({one}) => ({
	cliente: one(cliente, {
		fields: [proyeccionImpuesto.clienteId],
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
}));

export const clienteConceptoRelations = relations(clienteConcepto, ({one}) => ({
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

export const conceptoAfipRelations = relations(conceptoAfip, ({many}) => ({
	clienteConceptos: many(clienteConcepto),
	conceptos: many(concepto),
}));

export const cctRelations = relations(cct, ({many}) => ({
	convenios: many(convenio),
}));

export const empleadoRelations = relations(empleado, ({one, many}) => ({
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
	recibos: many(recibo),
}));

export const actividadRelations = relations(actividad, ({many}) => ({
	empleados: many(empleado),
}));

export const condicionTrabajadorRelations = relations(condicionTrabajador, ({many}) => ({
	empleados: many(empleado),
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

export const obraSocialRelations = relations(obraSocial, ({many}) => ({
	empleados: many(empleado),
	recibos: many(recibo),
}));

export const provinciaRelations = relations(provincia, ({many}) => ({
	empleados: many(empleado),
}));

export const siniestradoRelations = relations(siniestrado, ({many}) => ({
	empleados: many(empleado),
}));

export const situacionRevistaRelations = relations(situacionRevista, ({many}) => ({
	empleados: many(empleado),
	recibos_situacionRevista1Id: many(recibo, {
		relationName: "recibo_situacionRevista1Id_situacionRevista_id"
	}),
	recibos_situacionRevista2Id: many(recibo, {
		relationName: "recibo_situacionRevista2Id_situacionRevista_id"
	}),
	recibos_situacionRevista3Id: many(recibo, {
		relationName: "recibo_situacionRevista3Id_situacionRevista_id"
	}),
}));

export const zonaRelations = relations(zona, ({many}) => ({
	empleados: many(empleado),
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

export const asientoRelations = relations(asiento, ({one, many}) => ({
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
	asientoLineas: many(asientoLinea),
}));

export const periodoContableRelations = relations(periodoContable, ({one, many}) => ({
	asientos: many(asiento),
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

export const firmanteRelations = relations(firmante, ({one, many}) => ({
	organization: one(organization, {
		fields: [firmante.orgId],
		references: [organization.id]
	}),
	clienteEeccConfigs: many(clienteEeccConfig),
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

export const organizationModuleRelations = relations(organizationModule, ({one}) => ({
	organization: one(organization, {
		fields: [organizationModule.orgId],
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

export const jobLogRelations = relations(jobLog, ({one}) => ({
	job: one(job, {
		fields: [jobLog.jobId],
		references: [job.id]
	}),
}));

export const agentMessageRelations = relations(agentMessage, ({one}) => ({
	agentConversation: one(agentConversation, {
		fields: [agentMessage.conversationId],
		references: [agentConversation.id]
	}),
}));

export const comprobanteAlicuotaRelations = relations(comprobanteAlicuota, ({one}) => ({
	comprobante: one(comprobante, {
		fields: [comprobanteAlicuota.comprobanteId],
		references: [comprobante.id]
	}),
}));

export const clienteEmpleadorConfigRelations = relations(clienteEmpleadorConfig, ({one}) => ({
	cliente: one(cliente, {
		fields: [clienteEmpleadorConfig.clienteId],
		references: [cliente.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
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

export const vencimientoRelations = relations(vencimiento, ({one}) => ({
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

export const escalaSalarialRelations = relations(escalaSalarial, ({one}) => ({
	convenioCategoria: one(convenioCategoria, {
		fields: [escalaSalarial.categoriaId],
		references: [convenioCategoria.id]
	}),
}));

export const convenioFuenteRelations = relations(convenioFuente, ({one}) => ({
	convenio: one(convenio, {
		fields: [convenioFuente.convenioId],
		references: [convenio.id]
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
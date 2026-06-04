import { relations } from "drizzle-orm/relations";
import { representative, client, invoice, user, session, document, invoiceAttachment, notification, account, dueDate, debt } from "./schema";

export const representativeRelations = relations(representative, ({one, many}) => ({
	clients: many(client),
	invoices: many(invoice),
	documents: many(document),
	user: one(user, {
		fields: [representative.userId],
		references: [user.id]
	}),
	notifications: many(notification),
	dueDates: many(dueDate),
	debts: many(debt),
}));

export const clientRelations = relations(client, ({one, many}) => ({
	invoices: many(invoice),
	representative: one(representative, {
		fields: [client.representativeId],
		references: [representative.id]
	}),
	notifications: many(notification),
}));

export const invoiceRelations = relations(invoice, ({one}) => ({
	representative: one(representative, {
		fields: [invoice.representativeId],
		references: [representative.id]
	}),
	client: one(client, {
		fields: [invoice.clientId],
		references: [client.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	sessions: many(session),
	accounts: many(account),
	representatives: many(representative),
}));

export const invoiceAttachmentRelations = relations(invoiceAttachment, ({one}) => ({
	document: one(document, {
		fields: [invoiceAttachment.documentId],
		references: [document.id]
	}),
	notification: one(notification, {
		fields: [invoiceAttachment.notificationId],
		references: [notification.id]
	}),
}));

export const documentRelations = relations(document, ({one, many}) => ({
	invoiceAttachments: many(invoiceAttachment),
	representative: one(representative, {
		fields: [document.representativeId],
		references: [representative.id]
	}),
}));

export const notificationRelations = relations(notification, ({one, many}) => ({
	invoiceAttachments: many(invoiceAttachment),
	representative: one(representative, {
		fields: [notification.representativeId],
		references: [representative.id]
	}),
	client: one(client, {
		fields: [notification.clientId],
		references: [client.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const dueDateRelations = relations(dueDate, ({one}) => ({
	representative: one(representative, {
		fields: [dueDate.representativeId],
		references: [representative.id]
	}),
}));

export const debtRelations = relations(debt, ({one}) => ({
	representative: one(representative, {
		fields: [debt.representativeId],
		references: [representative.id]
	}),
	client: one(client, {
		fields: [debt.clientId],
		references: [client.id]
	}),
}));

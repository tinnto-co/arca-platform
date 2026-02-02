import { relations } from "drizzle-orm/relations";
import { client, credential, invoice, profile, user, session, document, invoiceAttachment, notification, account, dueDate, debt } from "./schema";

export const credentialRelations = relations(credential, ({one}) => ({
	client: one(client, {
		fields: [credential.clientId],
		references: [client.id]
	}),
}));

export const clientRelations = relations(client, ({one, many}) => ({
	credentials: many(credential),
	invoices: many(invoice),
	documents: many(document),
	profiles: many(profile),
	user: one(user, {
		fields: [client.userId],
		references: [user.id]
	}),
	notifications: many(notification),
	dueDates: many(dueDate),
	debts: many(debt),
}));

export const invoiceRelations = relations(invoice, ({one}) => ({
	client: one(client, {
		fields: [invoice.clientId],
		references: [client.id]
	}),
	profile: one(profile, {
		fields: [invoice.profileId],
		references: [profile.id]
	}),
}));

export const profileRelations = relations(profile, ({one, many}) => ({
	invoices: many(invoice),
	client: one(client, {
		fields: [profile.clientId],
		references: [client.id]
	}),
	notifications: many(notification),
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
	clients: many(client),
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
	client: one(client, {
		fields: [document.clientId],
		references: [client.id]
	}),
}));

export const notificationRelations = relations(notification, ({one, many}) => ({
	invoiceAttachments: many(invoiceAttachment),
	client: one(client, {
		fields: [notification.clientId],
		references: [client.id]
	}),
	profile: one(profile, {
		fields: [notification.profileId],
		references: [profile.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const dueDateRelations = relations(dueDate, ({one}) => ({
	client: one(client, {
		fields: [dueDate.clientId],
		references: [client.id]
	}),
}));

export const debtRelations = relations(debt, ({one}) => ({
	client: one(client, {
		fields: [debt.clientId],
		references: [client.id]
	}),
}));
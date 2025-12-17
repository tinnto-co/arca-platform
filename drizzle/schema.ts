import {
  foreignKey,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  type: text("type").notNull(),
  image: text("image"),
  status: text("status").notNull(),
  registeredAt: timestamp("registered_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profile = pgTable("profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id),
  name: text("name").notNull(),
  identityNumber: text("identity_number").notNull(),
  identityType: text("identity_type").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const credential = pgTable("credential", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id),
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id),
  type: text("type").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoiceAttachment = pgTable("invoice_attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  notification: uuid("notification_id").references(() => notification.id),
  document: uuid("document_id").references(() => document.id),
  externalId: text("external_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull(),
  client: uuid("client_id").references(() => client.id),
  profile: uuid("profile_id").references(() => profile.id),
  message: text("message").notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  publicationDate: timestamp("publication_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoice = pgTable("invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  direction: text("direction").notNull(),
  emitionDate: timestamp("emition_date").notNull(),
  type: text("type").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientIdentityNumber: text("recipient_identity_number").notNull(),
  recipientIdentityType: text("recipient_identity_type").notNull(),
  emitterName: text("emitter_name").notNull(),
  emitterIdentityNumber: text("emitter_identity_number").notNull(),
  emitterIdentityType: text("emitter_identity_type").notNull(),
  currency: text("currency").notNull(),
  cureencyRate: numeric("currency_rate").notNull(),
  salePoint: text("sale_point").notNull(),
  client: uuid("client_id").references(() => client.id),
  profile: uuid("profile_id").references(() => profile.id),
  authorizationNumber: text("authorization_number").notNull(),
  idFrom: numeric("id_from").notNull(),
  idTo: numeric("id_to").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  amountIVA0: numeric("amount_iva_0").notNull(),
  IVA25: numeric("iva_25").notNull(),
  amountIVA25: numeric("amount_iva_25").notNull(),
  IVA5: numeric("iva_5").notNull(),
  amountIVA5: numeric("amount_iva_5").notNull(),
  IVA105: numeric("iva_105").notNull(),
  amountIVA105: numeric("amount_iva_105").notNull(),
  IVA21: numeric("iva_21").notNull(),
  amountIVA21: numeric("amount_iva_21").notNull(),
  IVA27: numeric("iva_27").notNull(),
  amountIVA27: numeric("amount_iva_27").notNull(),
  amountTaxed: numeric("amount_taxed").notNull(),
  amountNoTaxed: numeric("imp_neto_no_gravado").notNull(),
  amountExempt: numeric("amount_exempt").notNull(),
  other_taxes: numeric("other_taxes").notNull(),
  totalIVA: numeric("total_iva").notNull(),
  amount: numeric("amount").notNull(),
});

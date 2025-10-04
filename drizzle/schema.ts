import {
  foreignKey,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { CURRENCIES } from "./enums";

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  identityNumber: text("identity_number").notNull(),
  identityType: text("identity_type").notNull(),
  image: text("image"),
  status: text("status").notNull(),
  registeredAt: timestamp("registered_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  referredBy: text("referred_by").references(() => account.id),
});

export const balance = pgTable(
  "balance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default(CURRENCIES.USD),
    account: uuid("account_id").references(() => account.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_account: foreignKey({
      columns: [table.account],
      foreignColumns: [account.id],
    }),
  })
);

export const userAccount = pgTable(
  "user_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user: text("user_id").references(() => user.id),
    account: uuid("account_id").references(() => account.id),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_account: foreignKey({
      columns: [table.account],
      foreignColumns: [account.id],
    }),
    fk_user: foreignKey({
      columns: [table.user],
      foreignColumns: [user.id],
    }),
  })
);

export const bankAccount = pgTable(
  "bank_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    accountNumber: text("account_number").notNull(),
    country: text("country").notNull(),
    bankName: text("bank_name").notNull(),
    bankCode: text("bank_code").notNull(),
    alias: text("alias").notNull(),
    currency: text("currency").notNull().default(CURRENCIES.USD),
    swiftCode: text("swift_code").notNull(),
    iban: text("iban").notNull(),
    bic: text("bic").notNull(),
    accountType: text("account_type").notNull(),
    accountHolderName: text("account_holder_name").notNull(),
    accountHolderAddress: text("account_holder_address").notNull(),
    account: uuid("account_id").references(() => account.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_account: foreignKey({
      columns: [table.account],
      foreignColumns: [account.id],
    }),
  })
);

export const financialProduct = pgTable("financial_product", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const transaction = pgTable(
  "transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default(CURRENCIES.USD),
    status: text("status").notNull(),
    financialProduct: uuid("financial_product_id").references(
      () => financialProduct.id
    ),
    account: uuid("account_id").references(() => account.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_financial_product: foreignKey({
      columns: [table.financialProduct],
      foreignColumns: [financialProduct.id],
    }),
    fk_account: foreignKey({
      columns: [table.account],
      foreignColumns: [account.id],
    }),
  })
);

const mortgage = pgTable(
  "mortgage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default(CURRENCIES.USD),
    account: uuid("account_id").references(() => account.id),
    ltv: numeric("ltv").notNull(),
    type: text("type").notNull(),
    tna: numeric("tna").notNull(),
    financialProduct: uuid("financial_product_id").references(
      () => financialProduct.id
    ),
    status: text("status").notNull(),
    fundsUse: text("funds_use").notNull(),
    originationFee: numeric("origination_fee").notNull(),
    bankAccount: uuid("bank_account_id").references(() => bankAccount.id),
    expirationDate: timestamp("expiration_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_financial_product: foreignKey({
      columns: [table.financialProduct],
      foreignColumns: [financialProduct.id],
    }),
    fk_bank_account: foreignKey({
      columns: [table.bankAccount],
      foreignColumns: [bankAccount.id],
    }),
    fk_account: foreignKey({
      columns: [table.account],
      foreignColumns: [account.id],
    }),
  })
);

export const mortageProperty = pgTable(
  "mortage_property",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    country: text("country").notNull(),
    url: text("url").notNull(),
    image: text("image").notNull(),
    type: text("type").notNull(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default(CURRENCIES.USD),
    mortgage: uuid("mortgage_id").references(() => mortgage.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_mortgage: foreignKey({
      columns: [table.mortgage],
      foreignColumns: [mortgage.id],
    }),
  })
);

export const mortageTenant = pgTable(
  "mortage_tenant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    identityNumber: text("identity_number").notNull(),
    identityType: text("identity_type").notNull(),
    mortgage: uuid("mortgage_id").references(() => mortgage.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_mortgage: foreignKey({
      columns: [table.mortgage],
      foreignColumns: [mortgage.id],
    }),
  })
);

export const mortagePayment = pgTable(
  "mortage_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default(CURRENCIES.USD),
    mortgage: uuid("mortgage_id").references(() => mortgage.id),
    bankAccount: uuid("bank_account_id").references(() => bankAccount.id),
    status: text("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_mortgage: foreignKey({
      columns: [table.mortgage],
      foreignColumns: [mortgage.id],
    }),
    fk_bank_account: foreignKey({
      columns: [table.bankAccount],
      foreignColumns: [bankAccount.id],
    }),
  })
);

export const document = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    url: text("url").notNull(),
    mortgage: uuid("mortgage_id").references(() => mortgage.id),
    user: text("user_id").references(() => user.id),
    account: uuid("account_id").references(() => account.id),
    bankAccount: uuid("bank_account_id").references(() => bankAccount.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_mortgage: foreignKey({
      columns: [table.mortgage],
      foreignColumns: [mortgage.id],
    }),
    fk_user: foreignKey({
      columns: [table.user],
      foreignColumns: [user.id],
    }),
    fk_account: foreignKey({
      columns: [table.account],
      foreignColumns: [account.id],
    }),
    fk_bank_account: foreignKey({
      columns: [table.bankAccount],
      foreignColumns: [bankAccount.id],
    }),
  })
);

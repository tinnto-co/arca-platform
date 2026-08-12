export const CURRENCIES = {
  USD: "USD",
  EUR: "EUR",
  ARS: "ARS",
} as const;

export type Currency = (typeof CURRENCIES)[keyof typeof CURRENCIES];

export const currencyValues: Currency[] = Object.values(CURRENCIES);

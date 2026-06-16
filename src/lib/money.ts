export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "RUB",
] as const;

// Use a fixed locale so server-rendered HTML and client hydration produce
// identical output regardless of the runtime's default locale.
const MONEY_LOCALE = "en-US";

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null) return "";
  if (!currency) return amount.toLocaleString(MONEY_LOCALE);
  try {
    return new Intl.NumberFormat(MONEY_LOCALE, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(MONEY_LOCALE)} ${currency}`;
  }
}

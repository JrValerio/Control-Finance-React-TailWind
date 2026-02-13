export const CATEGORY_ALL = "Todos";
export const CATEGORY_ENTRY = "Entrada";
export const CATEGORY_EXIT = "Saida";

export const filterByCategory = (transactions, category) => {
  if (category === CATEGORY_ALL) {
    return transactions;
  }

  return transactions.filter((transaction) => transaction.type === category);
};

export const calculateBalance = (transactions) => {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === CATEGORY_EXIT) {
      return total - transaction.value;
    }

    return total + transaction.value;
  }, 0);
};

export const parseCurrencyInput = (rawValue) => {
  if (typeof rawValue !== "string") {
    return Number.NaN;
  }

  const normalizedValue = rawValue
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
};

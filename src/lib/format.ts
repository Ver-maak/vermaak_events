export const formatMoney = (amount: number, currency = "UGX") => {
  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "UGX" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-UG", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-UG", {
    year: "numeric", month: "short", day: "numeric",
  });
};

export const slugify = (text: string) =>
  text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) + "-" + Math.random().toString(36).slice(2, 7);

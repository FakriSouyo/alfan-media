export const BUSINESS_TIME_ZONE = "Asia/Makassar";

function dateParts(date: Date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function businessDate(date = new Date()): string {
  const parts = dateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessMonth(date = new Date()): string {
  const parts = dateParts(date);
  return `${parts.year}-${parts.month}`;
}

export function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

export function isValidMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

export type SalesPeriod =
  | { mode: "daily"; date: string }
  | { mode: "monthly"; fromMonth: string; toMonth: string }
  | { mode: "custom"; fromDate: string; toDate: string };

export interface DateRange {
  start: string;
  end: string;
  error?: string;
}

export function resolveSalesPeriod(period: SalesPeriod): DateRange {
  if (period.mode === "daily") {
    return isValidDateOnly(period.date)
      ? { start: period.date, end: period.date }
      : { start: "", end: "", error: "Tanggal laporan tidak valid." };
  }

  if (period.mode === "monthly") {
    if (!isValidMonth(period.fromMonth) || !isValidMonth(period.toMonth)) {
      return { start: "", end: "", error: "Bulan laporan tidak valid." };
    }
    if (period.fromMonth > period.toMonth) {
      return { start: "", end: "", error: "Bulan awal tidak boleh setelah bulan akhir." };
    }
    const [year, month] = period.toMonth.split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const endDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return { start: `${period.fromMonth}-01`, end: `${period.toMonth}-${String(endDay).padStart(2, "0")}` };
  }

  if (!isValidDateOnly(period.fromDate) || !isValidDateOnly(period.toDate)) {
    return { start: "", end: "", error: "Tanggal awal dan akhir harus valid." };
  }
  if (period.fromDate > period.toDate) {
    return { start: "", end: "", error: "Tanggal awal tidak boleh setelah tanggal akhir." };
  }
  return { start: period.fromDate, end: period.toDate };
}

export function formatSalesPeriod(period: SalesPeriod): string {
  const range = resolveSalesPeriod(period);
  if (range.error) return "Periode tidak valid";
  if (period.mode === "daily") return range.start;
  return `${range.start} – ${range.end}`;
}

import { describe, expect, it } from "vitest";
import {
  businessDate,
  businessMonth,
  isValidDateOnly,
  resolveSalesPeriod,
} from "../business-date";

describe("tanggal bisnis Asia/Makassar", () => {
  it("menghasilkan tanggal bisnis, bukan tanggal UTC", () => {
    const instant = new Date("2026-10-01T18:30:00.000Z");
    expect(businessDate(instant)).toBe("2026-10-02");
    expect(businessMonth(instant)).toBe("2026-10");
  });

  it("memvalidasi tanggal kalender dan tahun kabisat", () => {
    expect(isValidDateOnly("2024-02-29")).toBe(true);
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
  });

  it("membuat rentang bulan inklusif lintas tahun dan Februari kabisat", () => {
    expect(resolveSalesPeriod({ mode: "monthly", fromMonth: "2024-02", toMonth: "2024-03" })).toEqual({
      start: "2024-02-01",
      end: "2024-03-31",
    });
    expect(resolveSalesPeriod({ mode: "monthly", fromMonth: "2025-12", toMonth: "2026-02" })).toEqual({
      start: "2025-12-01",
      end: "2026-02-28",
    });
  });

  it("accepts exact inclusive dates and rejects reversed ranges", () => {
    expect(resolveSalesPeriod({ mode: "custom", fromDate: "2026-09-15", toDate: "2026-10-10" })).toEqual({
      start: "2026-09-15",
      end: "2026-10-10",
    });
    expect(resolveSalesPeriod({ mode: "custom", fromDate: "2026-10-11", toDate: "2026-10-10" }).error).toBeTruthy();
    expect(resolveSalesPeriod({ mode: "monthly", fromMonth: "2026-11", toMonth: "2026-10" }).error).toBeTruthy();
  });
});

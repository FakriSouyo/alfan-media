// ─────────────────────────────────────────────────────────────────────────────
// Approval decision handling.
//
// When the user approves/rejects a card, we consume the approval record
// (owner + pending + not-expired + fingerprint re-verified + atomic
// pending-guard) and then execute ONLY the stored parameters.
// ─────────────────────────────────────────────────────────────────────────────

import { consumeApproval } from "./permissions/approval";
import { runBulkDeleteZeroStock, runDeleteProduct } from "./tools/products";
import {
  emitTextAndBlocks,
  filterActions,
  makeStepEmitter,
  resultBlock,
  streamText,
} from "./emit";
import { navTo } from "./tools/navigation";
import type { AgentUser, Emit, ToolContext } from "./types";

export async function runApprovalDecision(opts: {
  approvalId: string;
  decision: "approve" | "reject";
  user: AgentUser;
  supabase: Parameters<typeof consumeApproval>[0];
  emit: Emit;
}): Promise<void> {
  const { approvalId, decision, user, supabase, emit } = opts;
  const step = makeStepEmitter(emit);
  const toolCtx: ToolContext = { supabase, user };

  if (decision === "reject") {
    step("appr-1", "Mencatat keputusan", "active");
    const consumed = await consumeApproval(supabase, user, approvalId, "reject");
    if (!consumed.ok) {
      step("appr-1", "Mencatat keputusan", "error");
      await streamText(emit, approvalFailText(consumed.code));
      return;
    }
    step("appr-1", "Mencatat keputusan", "complete", "dibatalkan");
    await streamText(emit, "Baik, permintaan dibatalkan. Tidak ada perubahan yang dibuat.");
    return;
  }

  // approve
  step("appr-1", "Memverifikasi persetujuan", "active");
  const consumed = await consumeApproval(supabase, user, approvalId, "approve");
  if (!consumed.ok) {
    step("appr-1", "Memverifikasi persetujuan", "error");
    await streamText(emit, approvalFailText(consumed.code));
    return;
  }
  step("appr-1", "Memverifikasi persetujuan", "complete", "disetujui");

  const { record, params } = consumed;

  const actionLabel =
    record.tool_name === "bulk_delete_zero_stock"
      ? `Menghapus ${Array.isArray(params.productIds) ? (params.productIds as string[]).length : 0} produk`
      : `Menjalankan ${record.tool_name}`;
  step("appr-2", actionLabel, "active");

  let result;
  if (record.tool_name === "delete_product") {
    result = await runDeleteProduct(params, toolCtx);
  } else if (record.tool_name === "bulk_delete_zero_stock") {
    result = await runBulkDeleteZeroStock(params, toolCtx);
  } else {
    result = { ok: false as const, code: "STATE" as const, message: "Persetujuan untuk operasi yang tidak dikenali." };
  }

  if (!result.ok) {
    step("appr-2", actionLabel, "error");
    if (result.code === "FORBIDDEN") {
      await streamText(emit, "Persetujuan diterima, tetapi operasi ditolak: izin Anda tidak mencukupi. Tidak ada perubahan yang dibuat.");
    } else {
      await streamText(emit, `Persetujuan diterima, tetapi eksekusi gagal: ${result.message} Tidak ada perubahan yang dibuat.`);
    }
    return;
  }
  step("appr-2", actionLabel, "complete");
  step("appr-3", "Menyelesaikan", "active");
  await new Promise((r) => setTimeout(r, 20));
  step("appr-3", "Menyelesaikan", "complete");

  if (record.tool_name === "delete_product") {
    const d = (result as { ok: true; data: { deleted: { id: string; name: string } } }).data.deleted;
    await emitTextAndBlocks(emit, "Produk berhasil dihapus.", [
      resultBlock("1 produk dihapus", "success", [
        { label: "Produk", value: d.name },
        { label: "ID", value: d.id },
      ]),
      ...filterActions([navTo("products", "Lihat Inventori")]),
    ]);
  } else {
    const d = (result as {
      ok: true;
      data: { deleted: { id: string; name: string }[]; skipped: number };
    }).data;
    await emitTextAndBlocks(emit, `${d.deleted.length} produk berhasil dihapus.`, [
      resultBlock(`${d.deleted.length} produk dihapus`, "success", [
        { label: "Dihapus", value: `${d.deleted.length} produk` },
        { label: "Dilewati (stok berubah)", value: String(d.skipped) },
      ]),
      ...filterActions([navTo("products", "Lihat Inventori")]),
    ]);
  }
}

function approvalFailText(code: string): string {
  switch (code) {
    case "EXPIRED":
      return "Persetujuan itu sudah kedaluwarsa (melebihi 15 menit). Silakan minta lagi untuk saya siapkan ulang.";
    case "STATE":
      return "Persetujuan itu sudah diproses sebelumnya.";
    case "NOT_FOUND":
      return "Persetujuan tidak ditemukan.";
    case "FORBIDDEN":
      return "Persetujuan ini bukan milik Anda.";
    default:
      return "Terjadi kesalahan saat memproses persetujuan. Silakan coba lagi.";
  }
}

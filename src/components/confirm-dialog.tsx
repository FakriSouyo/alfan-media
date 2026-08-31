"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * Dialog konfirmasi pengganti window.confirm() — tampil sebagai Dialog
 * shadcn yang konsisten dengan dialog lain di aplikasi.
 *
 * Mode info: set `cancelLabel={undefined}` agar hanya ada satu tombol (OK).
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Label tombol konfirmasi. Default "Ya, lanjutkan". */
  confirmLabel?: string;
  /** Label tombol batal. Set `undefined` untuk mode info (satu tombol). */
  cancelLabel?: string;
  /** Gaya tombol destruktif (merah) untuk aksi hapus/batalkan. */
  destructive?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  destructive,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          {cancelLabel !== undefined && (
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={
              destructive
                ? "rounded-lg bg-destructive px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
                : "rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
            }
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

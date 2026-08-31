"use client";

import {
  BookOpen,
  ScanBarcode,
  Cloud,
  Database,
  type LucideIcon,
} from "lucide-react";

interface QueueItem {
  icon: LucideIcon;
  label: string;
  subtitle: string;
  delay: string;
  badge: number;
}

const items: QueueItem[] = [
  { icon: BookOpen, label: "Buku baru ditambahkan", subtitle: "Laskar Pelangi — Andrea Hirata", delay: "-8s", badge: 1 },
  { icon: ScanBarcode, label: "Verifikasi ISBN", subtitle: "Bumi Manusia — Pramoedya A.T.", delay: "-6s", badge: 2 },
  { icon: Cloud, label: "Sinkronisasi katalog", subtitle: "Menyimpan ke cloud", delay: "-4s", badge: 3 },
  { icon: Database, label: "Basis data diperbarui", subtitle: "1.204 judul tercatat", delay: "-2s", badge: 4 },
];

/**
 * Status queue illustration — each row lights up one at a time while others
 * dim, simulating a live catalog workflow. Adapted for Tokobuku LKS with
 * #171717 base color.
 */
export function IsometricQueue() {
  return (
    <div
      className="mx-auto flex w-[min(340px,85%)] flex-col gap-2.5 rounded-xl p-4"
      style={{ background: "#171717" }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes q-row {
          0%, 100% { opacity: 0.45; transform: scale(0.97); border-color: transparent; }
          6.25% { opacity: 1; transform: scale(1); border-color: rgba(255,255,255,0.6); }
          12.5% { opacity: 0.45; transform: scale(0.97); border-color: transparent; }
        }
        @keyframes q-badge {
          0%, 100% { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.6); }
          6.25% { background: #fff; color: #171717; }
          12.5% { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.6); }
        }
        @media (prefers-reduced-motion: reduce) {
          .q-row {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            border-color: transparent !important;
          }
          .q-badge {
            animation: none !important;
            background: rgba(255,255,255,0.15) !important;
            color: rgba(255,255,255,0.6) !important;
          }
        }
      `}</style>

      {items.map((item) => (
        <QueueRow key={item.badge} {...item} />
      ))}
    </div>
  );
}

function QueueRow({ icon: Icon, label, subtitle, delay, badge }: QueueItem) {
  return (
    <div
      className="q-row relative flex items-center gap-3 rounded-xl border-2 border-transparent px-3.5 py-3"
      style={{
        background: "#171717",
        animation: `q-row 8s ease-in-out infinite`,
        animationDelay: delay,
      }}
    >
      {/* Icon */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Icon size={20} className="text-white" strokeWidth={1.6} />
      </div>

      {/* Text */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="block truncate text-[13px] font-medium text-white">
          {label}
        </span>
        <span className="block truncate text-[12px] text-white/75">
          {subtitle}
        </span>
      </div>

      {/* Badge */}
      <div
        className="q-badge absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full text-[12px] font-medium"
        style={{
          animation: `q-badge 8s ease-in-out infinite`,
          animationDelay: delay,
        }}
      >
        {badge}
      </div>
    </div>
  );
}

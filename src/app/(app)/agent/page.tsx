import type { Metadata } from "next";
import { AgentChat } from "@/components/agent/agent-chat";

export const metadata: Metadata = {
  title: "AI Assistant — Alfan Media",
  description:
    "Asisten AI untuk penjualan, stok, produk, dan laporan Alfan Media",
};

export default function AgentPage() {
  return <AgentChat />;
}

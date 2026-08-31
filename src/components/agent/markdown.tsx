"use client";

// Renderer Markdown untuk respons agen (react-markdown + GFM).
// Sumber teks selalu di-escape oleh react-markdown — output LLM tidak
// pernah dieksekusi sebagai HTML mentah.
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface AgentMarkdownProps {
  text: string;
  /**
   * Jika true, tabel Markdown disembunyikan: datanya sudah dirender sebagai
   * kartu terstruktur (blok stats/list/table), jadi tabel di teks hanya akan
   * menduplikasi kartu. (Prompt sudah melarangnya, tapi ini jaminan
   * deterministik di sisi klien — model tetap bisa melanggar instruksi.)
   */
  hideTables?: boolean;
  className?: string;
}

/**
 * Markdown ringan untuk jawaban agen: **tebal**, *italic*, `code`, daftar,
 * heading, dan tabel GFM (di-allow via prompt sistem). Kelas `.agent-md`
 * di globals.css menata tabel/heading yang belum dicover base-class
 * StreamingResponse (p/ul/ol/code/a sudah disitu).
 */
export const AgentMarkdown = memo(function AgentMarkdown({
  text,
  hideTables = false,
  className,
}: AgentMarkdownProps) {
  const components = useMemo(
    () => (hideTables ? { table: () => null } : undefined),
    [hideTables],
  );
  return (
    <div className={cn("agent-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

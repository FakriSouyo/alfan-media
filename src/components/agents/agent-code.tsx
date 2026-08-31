"use client";

// beui.dev/components/agents/chat-app — ported without the `shiki` dependency.
// Token highlighting is skipped: `useAgentCodeTokens` always returns null and
// consumers (ToolApproval / ToolResult) fall back to plain monospace code.

import {
  type CSSProperties,
  Fragment,
} from "react";
import { cn } from "@/lib/utils";

export type AgentCodeLanguage =
  | "bash"
  | "diff"
  | "json"
  | "text"
  | "tsx"
  | "typescript";

export interface AgentCodeToken {
  content: string;
  offset: number;
  light?: string;
  dark?: string;
}

export type AgentCodeTokenLines = AgentCodeToken[][];

export interface AgentCodeProps {
  code: string;
  language?: AgentCodeLanguage;
  className?: string;
}

export interface AgentCodeLineProps {
  code: string;
  tokens?: AgentCodeToken[];
  className?: string;
}

/**
 * Highlighting hook kept for API compatibility with the upstream component.
 * Without `shiki` there are no token themes, so this always returns `null`
 * and renderers use the raw code.
 */
export function useAgentCodeTokens(
  _code: string,
  _language: AgentCodeLanguage,
): AgentCodeTokenLines | null {
  return null;
}

export function AgentCodeLine({
  code,
  tokens,
  className,
}: AgentCodeLineProps) {
  return (
    <span className={className}>
      {tokens
        ? tokens.map((token) => (
            <span
              key={`${token.offset}-${token.content}`}
              style={
                {
                  "--agent-code-light": token.light ?? "currentColor",
                  "--agent-code-dark": token.dark ?? token.light ?? "currentColor",
                } as CSSProperties
              }
              className="text-[var(--agent-code-light)] dark:text-[var(--agent-code-dark)]"
            >
              {token.content}
            </span>
          ))
        : code}
    </span>
  );
}

export function AgentCode({
  code,
  language = "bash",
  className,
}: AgentCodeProps) {
  const lines = code.split("\n");

  return (
    <pre
      data-language={language}
      className={cn(
        "m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-foreground/85",
        className,
      )}
    >
      <code>
        {lines.map((line, index) => (
          <Fragment key={index}>
            <AgentCodeLine code={line} />
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

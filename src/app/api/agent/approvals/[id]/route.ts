import type { NextRequest } from "next/server";
import { runApprovalDecision } from "@/lib/agent/approval-decision";
import { sseResponse } from "@/lib/agent/sse";
import { requireAgentUser } from "@/lib/agent/supabase";
import { isUuid } from "@/lib/agent/schemas/validate";
import type { AgentEvent } from "@/lib/agent/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/agent/approvals/[id]">,
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return Response.json({ error: "Approval ID tidak valid." }, { status: 400 });
  }

  const auth = await requireAgentUser();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }

  let body: { decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body request tidak valid." }, { status: 400 });
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return Response.json(
      { error: "Decision harus 'approve' atau 'reject'." },
      { status: 400 },
    );
  }

  return sseResponse(async (emit) => {
    const send = (event: AgentEvent) => emit(event.type, event);
    await runApprovalDecision({
      approvalId: id,
      decision,
      user: auth.user,
      supabase: auth.supabase,
      emit: send,
    });
    emit("done", {});
  });
}

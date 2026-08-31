-- 008_agent_approvals.sql
-- Approval records for the AI agent.
--
-- An approval is a row bound to (user, tool, canonical parameters). The agent
-- proposes one, the user approves/rejects in the UI, and the decision endpoint
-- verifies status/expiry/fingerprint before executing the STORED parameters.
-- RLS: each user can only read/modify their own approvals.

create extension if not exists pgcrypto;

create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool_name text not null,
  params jsonb not null,
  fingerprint text not null,
  summary text not null,
  impact text not null,
  irreversible boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists agent_approvals_user_status_idx
  on public.agent_approvals (user_id, status, created_at desc);

alter table public.agent_approvals enable row level security;

drop policy if exists "agent_approvals_select_own" on public.agent_approvals;
create policy "agent_approvals_select_own"
  on public.agent_approvals for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "agent_approvals_insert_own" on public.agent_approvals;
create policy "agent_approvals_insert_own"
  on public.agent_approvals for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "agent_approvals_update_own" on public.agent_approvals;
create policy "agent_approvals_update_own"
  on public.agent_approvals for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Convenience: count of pending approvals for the current user (dashboard badge).
create or replace function public.pending_approval_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.agent_approvals
  where user_id = auth.uid()
    and status = 'pending'
    and expires_at > now();
$$;

grant execute on function public.pending_approval_count() to authenticated;

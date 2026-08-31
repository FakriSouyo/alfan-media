-- 009_ai_settings.sql
-- Custom-provider configuration for the AI agent.
--
-- The agent is LLM-driven: it calls an external OpenAI-compatible chat
-- completions endpoint (custom gateway) configured by the store admin.
-- The API key lives server-side only (Supabase, admin-only RLS) and is
-- never returned to the browser in full form (masked in API responses).
--
-- ai_providers: one row per configured gateway/provider.
-- ai_settings:  single row — which provider + model the agent uses (global).

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null unique,            -- lowercase identifier, e.g. "acme-gateway"
  display_name text not null,
  base_url text not null,                      -- e.g. https://gateway.example/v1
  api_protocol text not null default 'openai-completions'
    check (api_protocol in ('openai-completions')),
  api_key text not null,
  models jsonb not null default '[]',          -- [{ "id": "...", "display_name": "..." }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  id integer primary key default 1,            -- single-row table (id is always 1)
  provider_id text not null references public.ai_providers(provider_id) on delete restrict,
  model_id text not null,
  updated_at timestamptz not null default now()
);

-- Keep a single settings row.
do $$
begin
  if not exists (select 1 from public.ai_settings where id = 1) then
    -- Row cannot exist until a provider exists (FK). The app inserts it on
    -- the first "set active" action; this guard is a no-op for now.
    null;
  end if;
end $$;

alter table public.ai_providers enable row level security;
alter table public.ai_settings enable row level security;

-- Admin-only access (the API key must not be readable by staff).
drop policy if exists "ai_providers_admin_all" on public.ai_providers;
create policy "ai_providers_admin_all"
  on public.ai_providers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ai_settings_admin_all" on public.ai_settings;
create policy "ai_settings_admin_all"
  on public.ai_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

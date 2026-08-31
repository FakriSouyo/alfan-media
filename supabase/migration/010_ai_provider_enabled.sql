-- 010_ai_provider_enabled.sql
-- Adopsi kontrak "llm_providers" ke tabel AI yang sudah ada (ai_providers):
--   1. `enabled`  — provider dinonaktifkan → hilang dari model picker chat dan
--      chat yang memilihnya mendapat error terstruktur (bukan crash).
--   2. `api_key` boleh NULL — untuk endpoint publik yang tidak memakai key.
-- Tidak ada tabel baru; tidak ada skema tabel lain yang disentuh.

alter table public.ai_providers add column if not exists enabled boolean not null default true;

alter table public.ai_providers alter column api_key drop not null;

-- ============================================================================
-- 007_category_level_to_text.sql
-- categories.level: enum('SD','SMP','SMA') -> text
--
-- Alasan: aplikasi memakai label jenjang+kelas bebas, mis. "SD I".."SD VI",
-- "SMP I".."SMP III", "SMA I".."SMA III", atau jenjang saja ("SD"), atau NULL
-- untuk kategori umum. Enum 3 nilai menyebabkan error 22P02 setiap kali
-- kategori kelas disimpan (addCategory/updateCategory).
--
-- Nilai lama ('SD'/'SMP'/'SMA'/'SD I' yang belum sempat tersimpan) tetap aman:
-- konversi enum -> text menyimpan nilai apa adanya.
--
-- Jalankan di Supabase SQL Editor SETELAH 001_schema.sql.
-- ============================================================================

alter table public.categories
  alter column level type text using level::text;

comment on column public.categories.level is
  'Label jenjang/kelas bebas, mis. "SD I", "SMP II", "SMA III", atau "SD". NULL untuk kategori umum.';

drop type if exists public.category_level;

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Kata sandi harus terdiri dari minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi belum cocok.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError("Tautan pemulihan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.");
      return;
    }
    setSuccess(true);
  };

  return <main className="flex min-h-svh items-center justify-center bg-background p-5"><section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
    <h1 className="text-xl font-semibold text-foreground">Atur kata sandi baru</h1>
    <p className="mt-2 text-sm text-muted-foreground">Masukkan kata sandi baru untuk akun Alfan Media.</p>
    {error && <p role="alert" aria-live="assertive" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {success ? <div role="status" className="mt-4"><p className="text-sm text-emerald-700 dark:text-emerald-300">Kata sandi berhasil diperbarui.</p><button type="button" onClick={() => router.replace("/login")} className="mt-4 w-full rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">Kembali ke halaman masuk</button></div> : <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
      <label className="text-sm text-foreground">Kata sandi baru<input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>
      <label className="text-sm text-foreground">Ulangi kata sandi<input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>
      <Button type="submit" loading={saving} className="mt-2">Simpan kata sandi</Button>
    </form>}
  </section></main>;
}

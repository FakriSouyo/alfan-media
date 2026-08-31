"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Pengaturan AI (admin-only): custom provider + model aktif untuk AI agent.
// API key disimpan di server (Supabase, RLS admin) — UI hanya menerima/menyimpan
// via /api/ai/*; respons GET selalu menampilkan key ter-mask.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  FlaskConical,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

interface ProviderModel {
  id: string;
  display_name?: string;
}

interface ProviderRow {
  id: string;
  provider_id: string;
  display_name: string;
  base_url: string;
  api_protocol: string;
  api_key: string; // masked in GET responses
  models: ProviderModel[];
  enabled?: boolean;
  hasKey?: boolean;
}

interface ActiveSetting {
  provider: Pick<ProviderRow, "id" | "provider_id" | "display_name" | "base_url" | "models">;
  model_id: string;
}

interface ProviderForm {
  id: string | null; // null = new
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
}

const EMPTY_FORM: ProviderForm = {
  id: null,
  providerId: "",
  displayName: "",
  baseUrl: "",
  apiKey: "",
  models: [],
};

function inputCls(extra = ""): string {
  return `w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring ${extra}`;
}

function labelCls(): string {
  return "mb-1 block text-[12px] font-medium text-muted-foreground";
}

export function AiSettingsCard({ isAdmin }: { isAdmin: boolean }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [active, setActive] = useState<ActiveSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<ProviderForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [activating, setActivating] = useState<string | null>(null); // providerId
  const [activateModel, setActivateModel] = useState("");
  const [activateError, setActivateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [testing, setTesting] = useState<string | null>(null); // providerId
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/ai/providers"),
        fetch("/api/ai/settings"),
      ]);
      const pData = (await pRes.json()) as { providers?: ProviderRow[]; error?: string };
      if (!pRes.ok) throw new Error(pData.error ?? "Gagal memuat provider");
      const sData = (await sRes.json()) as { active?: ActiveSetting | null; error?: string };
      if (!sRes.ok) throw new Error(sData.error ?? "Gagal memuat pengaturan aktif");
      setProviders(pData.providers ?? []);
      setActive(sData.active ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat pengaturan AI.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // Defer out of the effect body: load() sets state synchronously at start.
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <Sparkles size={14} className="text-primary" /> AI Assistant
        </h3>
        <p className="text-[12px] text-muted-foreground">
          Pengaturan AI hanya dapat diubah oleh admin.
        </p>
      </div>
    );
  }

  const openNewForm = () => {
    setForm({ ...EMPTY_FORM, models: [] });
    setFormError(null);
    setFormErrors({});
    setFetchError(null);
  };

  const openEditForm = (p: ProviderRow) => {
    setForm({
      id: p.id,
      providerId: p.provider_id,
      displayName: p.display_name,
      baseUrl: p.base_url,
      apiKey: p.api_key, // masked — empty/masked value means "keep existing"
      models: p.models.map((m) => ({ ...m })),
    });
    setFormError(null);
    setFormErrors({});
    setFetchError(null);
  };

  const closeForm = () => {
    setForm(null);
    setFormError(null);
    setFormErrors({});
  };

  const saveForm = async () => {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    setFormErrors({});
    try {
      const isEdit = Boolean(form.id);
      const res = await fetch(isEdit ? `/api/ai/providers/${form.id}` : "/api/ai/providers", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: form.providerId,
          displayName: form.displayName,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          models: form.models.filter((m) => m.id.trim()),
        }),
      });
      const data = (await res.json()) as { error?: string; errors?: Record<string, string> };
      if (!res.ok) {
        if (data.errors) setFormErrors(data.errors);
        setFormError(data.error ?? "Gagal menyimpan provider.");
        return;
      }
      closeForm();
      await load();
    } catch {
      setFormError("Koneksi terputus. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const fetchModels = async () => {
    if (!form) return;
    const isEdit = Boolean(form.id);
    // Mode tambah: credential masih di field (key asli). Mode edit: server
    // memakai key tersimpan — key di form ter-mask sehingga tidak dikirim.
    if (!isEdit && (!form.baseUrl.trim() || !form.apiKey.trim())) {
      setFetchError("Isi Base URL dan API key dulu, baru fetch model.");
      return;
    }
    setFetchingModels(true);
    setFetchError(null);
    try {
      const url = isEdit
        ? `/api/ai/providers/${form.id}/models`
        : "/api/ai/providers/fetch-models";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(isEdit
          ? {}
          : { body: JSON.stringify({ baseUrl: form.baseUrl, apiKey: form.apiKey }) }),
      });
      const data = (await res.json()) as { models?: ProviderModel[]; error?: string };
      if (!res.ok) {
        setFetchError(data.error ?? "Gagal mengambil daftar model.");
        return;
      }
      const models = data.models ?? [];
      setForm((f) => (f ? { ...f, models } : f));
      if (isEdit) await load();
    } catch {
      setFetchError("Koneksi terputus. Silakan coba lagi.");
    } finally {
      setFetchingModels(false);
    }
  };

  const deleteProvider = async (p: ProviderRow) => {
    if (!confirm(`Hapus provider "${p.display_name}"?`)) return;
    setDeleting(p.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/ai/providers/${p.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? "Gagal menghapus provider.");
        return;
      }
      await load();
    } catch {
      setDeleteError("Koneksi terputus. Silakan coba lagi.");
    } finally {
      setDeleting(null);
    }
  };

  const activateProvider = async (p: ProviderRow) => {
    const modelId = activateModel.trim();
    if (!modelId) {
      setActivateError("Isi Model ID dulu (fetch model atau ketik manual).");
      return;
    }
    setActivating(p.id);
    setActivateError(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: p.provider_id, model_id: modelId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActivateError(data.error ?? "Gagal mengatur model aktif.");
        return;
      }
      setActivateModel("");
      await load();
    } catch {
      setActivateError("Koneksi terputus. Silakan coba lagi.");
    } finally {
      setActivating(null);
    }
  };

  const runConnectionTest = async (p: ProviderRow) => {
    setTesting(p.id);
    setTestResult((r) => {
      const next = { ...r };
      delete next[p.id];
      return next;
    });
    try {
      const res = await fetch(`/api/ai/providers/${p.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: (p.models ?? []).map((m) => m.id) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setTestResult((r) => ({
          ...r,
          [p.id]: { ok: false, message: data?.error ?? "Gagal menguji koneksi." },
        }));
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        modelCount?: number;
        message?: string;
        missingModels?: string[];
      };
      if (data.ok) {
        const missing = data.missingModels ?? [];
        setTestResult((r) => ({
          ...r,
          [p.id]: {
            ok: true,
            message:
              `Koneksi OK — ${data.modelCount ?? 0} model ditemukan di endpoint` +
              (missing.length
                ? `; model tersimpan tidak ditemukan: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}`
                : ""),
          },
        }));
      } else {
        setTestResult((r) => ({
          ...r,
          [p.id]: { ok: false, message: data.message ?? "Tes koneksi gagal." },
        }));
      }
    } catch {
      setTestResult((r) => ({
        ...r,
        [p.id]: { ok: false, message: "Koneksi terputus. Silakan coba lagi." },
      }));
    } finally {
      setTesting(null);
    }
  };

  const toggleEnabled = async (p: ProviderRow) => {
    const next = !(p.enabled ?? true);
    setToggling(p.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/ai/providers/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: p.provider_id,
          displayName: p.display_name,
          baseUrl: p.base_url,
          models: p.models,
          enabled: next,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? "Gagal mengubah status provider.");
        return;
      }
      await load();
    } catch {
      setDeleteError("Koneksi terputus. Silakan coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <Sparkles size={14} className="text-primary" /> AI Assistant
        </h3>
        <button
          onClick={openNewForm}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
        >
          <Plus size={12} /> Tambah Provider
        </button>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
        AI agent di halaman <span className="font-medium">AI Assistant</span> memakai model
        eksternal (OpenAI-compatible) melalui gateway yang Anda atur di sini. API key
        tersimpan di server dan hanya admin yang dapat mengaksesnya.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> Memuat…
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[12px] text-destructive">
          <CircleAlert size={13} className="mt-0.5 shrink-0" /> {loadError}
        </div>
      ) : null}

      {/* Active model */}
      <div className="mb-3 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Model Aktif
        </div>
        {active ? (
          <div className="flex items-center gap-2 text-[13px]">
            <Check size={13} className="shrink-0 text-emerald-500" />
            <span className="font-medium text-foreground">{active.provider.display_name}</span>
            <span className="truncate text-muted-foreground">
              · {active.model_id}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <CircleAlert size={13} className="shrink-0 text-amber-500" />
            Belum ada — AI Assistant belum aktif.
          </div>
        )}
      </div>

      {/* Providers list */}
      {providers.length > 0 && (
        <div className="space-y-2">
          {providers.map((p) => {
            const isActive = active?.provider.id === p.id;
            const modelOptions = p.models.map((m) => m.id);
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border/60 p-3 transition-colors hover:border-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="truncate font-medium text-foreground">
                        {p.display_name}
                      </span>
                      {isActive ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          AKTIF
                        </span>
                      ) : null}
                      {p.enabled === false ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          NONAKTIF
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      <code className="text-[10.5px]">{p.provider_id}</code> · {p.base_url}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {p.models.length} model terdaftar
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void runConnectionTest(p)}
                      title="Tes koneksi: panggil {base_url}/models dengan API key tersimpan"
                      disabled={testing === p.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
                    >
                      {testing === p.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <FlaskConical size={12} />
                      )}
                      Tes
                    </button>
                    <button
                      onClick={() => void toggleEnabled(p)}
                      title={
                        p.enabled === false
                          ? "Aktifkan provider (tampil lagi di model picker chat)"
                          : "Nonaktifkan provider (hilang dari model picker chat)"
                      }
                      disabled={toggling === p.id}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
                    >
                      {toggling === p.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Power size={13} />
                      )}
                    </button>
                    <button
                      onClick={() => openEditForm(p)}
                      title="Edit provider"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => void deleteProvider(p)}
                      title="Hapus provider"
                      disabled={deleting === p.id}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {deleting === p.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Activate / change active model */}
                <div className="mt-2 flex items-center gap-1.5">
                  {isActive && active ? (
                    <>
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        Model: <span className="font-medium text-foreground">{active.model_id}</span>
                      </span>
                    </>
                  ) : null}
                  <input
                    list={`ai-models-${p.id}`}
                    value={activateModel}
                    onChange={(e) => {
                      setActivateModel(e.target.value);
                      setActivateError(null);
                    }}
                    placeholder="Pilih/ketik Model ID…"
                    className="w-48 min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring"
                  />
                  <datalist id={`ai-models-${p.id}`}>
                    {modelOptions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <button
                    onClick={() => void activateProvider(p)}
                    disabled={activating === p.id}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {activating === p.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Check size={11} />
                    )}
                    Aktifkan
                  </button>
                </div>
                {activateError && (
                  <div className="mt-1.5 text-[11.5px] text-destructive">{activateError}</div>
                )}
                {testResult[p.id] ? (
                  <div
                    className={
                      testResult[p.id].ok
                        ? "mt-2 flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11.5px] text-emerald-700 dark:text-emerald-300"
                        : "mt-2 flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11.5px] text-destructive"
                    }
                  >
                    {testResult[p.id].ok ? (
                      <CircleCheck size={13} className="mt-0.5 shrink-0" />
                    ) : (
                      <CircleX size={13} className="mt-0.5 shrink-0" />
                    )}
                    <span className="min-w-0 leading-snug">{testResult[p.id].message}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {deleteError && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[12px] text-destructive">
          <CircleAlert size={13} className="mt-0.5 shrink-0" /> {deleteError}
        </div>
      )}

      {/* Provider form (add / edit) */}
      {form ? (
        <div className="mt-3 rounded-lg border border-ring/50 bg-foreground/[0.02] p-3.5">
          <div className="mb-3 text-[13px] font-semibold text-foreground">
            {form.id ? "Edit Provider" : "Custom Provider"}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls()}>Provider ID</label>
              <input
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value })}
                placeholder="acme-gateway"
                disabled={Boolean(form.id)}
                className={inputCls(formErrors.providerId ? "border-destructive" : "")}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Lowercase identifier, diawali huruf, unik.
              </p>
              {formErrors.providerId && (
                <p className="mt-0.5 text-[11px] text-destructive">{formErrors.providerId}</p>
              )}
            </div>
            <div>
              <label className={labelCls()}>Display Name</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Gateway Acme"
                className={inputCls(formErrors.displayName ? "border-destructive" : "")}
              />
              {formErrors.displayName && (
                <p className="mt-0.5 text-[11px] text-destructive">{formErrors.displayName}</p>
              )}
            </div>
            <div>
              <label className={labelCls()}>Base URL</label>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://gateway.example/v1"
                className={inputCls(formErrors.baseUrl ? "border-destructive" : "")}
              />
              {formErrors.baseUrl && (
                <p className="mt-0.5 text-[11px] text-destructive">{formErrors.baseUrl}</p>
              )}
            </div>
            <div>
              <label className={labelCls()}>API Protocol</label>
              <select value="openai-completions" disabled className={inputCls()}>
                <option value="openai-completions">openai-completions</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls()}>API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="Enter your API key"
                autoComplete="off"
                className={inputCls(formErrors.apiKey ? "border-destructive" : "")}
              />
              {form.id && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Kosongkan / biarkan ter-mask untuk mempertahankan key yang tersimpan.
                </p>
              )}
              {formErrors.apiKey && (
                <p className="mt-0.5 text-[11px] text-destructive">{formErrors.apiKey}</p>
              )}
            </div>
          </div>

          {/* Models */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Models</span>
              <button
                onClick={() => void fetchModels()}
                disabled={
                  fetchingModels ||
                  (!form.id && (!form.baseUrl.trim() || !form.apiKey.trim()))
                }
                title={
                  form.id
                    ? "Ambil daftar model dari provider (pakai API key tersimpan)"
                    : "Ambil daftar model — isi Base URL & API key dulu"
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                {fetchingModels ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Fetch Available Models
              </button>
            </div>

            <div className="space-y-2">
              {form.models.length === 0 && (
                <p className="text-[11.5px] text-muted-foreground/70">
                  Belum ada model — fetch dari provider atau tambah manual di bawah.
                </p>
              )}
              {form.models.map((m, i) => (
                <div
                  key={`${m.id}-${i}`}
                  className="flex items-start gap-1.5 rounded-lg border border-border/50 p-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Model ID
                      </label>
                      <input
                        value={m.id}
                        onChange={(e) => {
                          const models = form.models.map((x, j) =>
                            j === i ? { ...x, id: e.target.value } : x,
                          );
                          setForm({ ...form, models });
                        }}
                        placeholder="mis. gpt-4o-mini"
                        className={inputCls("py-1.5")}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Display name
                      </label>
                      <input
                        value={m.display_name ?? ""}
                        onChange={(e) => {
                          const models = form.models.map((x, j) =>
                            j === i ? { ...x, display_name: e.target.value } : x,
                          );
                          setForm({ ...form, models });
                        }}
                        placeholder="mis. GPT-4o Mini (opsional)"
                        className={inputCls("py-1.5")}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setForm({ ...form, models: form.models.filter((_, j) => j !== i) })
                    }
                    title="Hapus model ini"
                    className="mt-6 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setForm({ ...form, models: [...form.models, { id: "" }] })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
              >
                <Plus size={12} /> Tambah Model
              </button>
            </div>
            {fetchError && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[12px] text-destructive">
                <CircleAlert size={13} className="mt-0.5 shrink-0" /> {fetchError}
              </div>
            )}
          </div>

          {formError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[12px] text-destructive">
              <CircleAlert size={13} className="mt-0.5 shrink-0" /> {formError}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void saveForm()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {form.id ? "Simpan Perubahan" : "Simpan Provider"}
            </button>
            <button
              onClick={closeForm}
              className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-foreground/[0.04]"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

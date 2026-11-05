
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { login, requestPasswordReset } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(undefined);

    let hasError = false;
    if (!email) {
      setEmailError("Email wajib diisi");
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Email tidak valid");
      hasError = true;
    } else {
      setEmailError(undefined);
    }

    if (!password) {
      setPasswordError("Kata sandi wajib diisi");
      hasError = true;
    } else {
      setPasswordError(undefined);
    }

    if (hasError) return;

    setSubmitting(true);
    const result = await login(email, password);
    if (result.error) {
      setServerError(result.error);
      setSubmitting(false);
    } else {
      router.push("/agent");
    }
  };

  const handleForgotPassword = async () => {
    setServerError(undefined);
    setResetSent(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Masukkan alamat email yang valid untuk menerima tautan pemulihan");
      return;
    }
    setResetting(true);
    const result = await requestPasswordReset(email);
    setResetting(false);
    if (result.error) setServerError(result.error);
    else setResetSent(true);
  };

  return (
    <div>
      <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Masuk</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Gunakan akun toko untuk membuka ruang kerja Alfan Media.
      </p>

      {serverError && (
        <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{serverError}</p>
      )}
      {resetSent && (
        <p role="status" className="mt-5 rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">
          Jika email terdaftar, instruksi pemulihan akan dikirim.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-medium">Alamat email</label>
          <input id="login-email" type="email" autoComplete="username" placeholder="nama@email.com"
            aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "login-email-error" : undefined}
            value={email} onChange={(event) => { setEmail(event.target.value); setEmailError(undefined); }}
            className="h-12 w-full rounded-lg border border-input bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {emailError && <p id="login-email-error" className="mt-2 text-sm text-destructive">{emailError}</p>}
        </div>
        <div>
          <label htmlFor="login-password" className="mb-2 block text-sm font-medium">Kata sandi</label>
          <div className="relative">
            <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
              placeholder="Masukkan kata sandi" aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? "login-password-error" : undefined}
              value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(undefined); }}
              className="h-12 w-full rounded-lg border border-input bg-card pr-14 pl-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </div>
          {passwordError && <p id="login-password-error" className="mt-2 text-sm text-destructive">{passwordError}</p>}
        </div>

        <button type="button" onClick={handleForgotPassword} disabled={resetting}
          className="-mt-3 min-h-11 w-fit rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          {resetting ? "Mengirim tautan…" : "Lupa kata sandi?"}
        </button>
        <Button type="submit" variant="primary" loading={submitting} className="h-12 w-full bg-primary text-base text-primary-foreground">
          <span className="inline-flex items-center gap-2">Masuk <ArrowRight size={18} aria-hidden="true" /></span>
        </Button>
      </form>
    </div>
  );
}

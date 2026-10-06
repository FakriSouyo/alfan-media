"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputField } from "@/components/ui/input-group";
import { fontWeights } from "@/lib/font-weight";
import { useAuth } from "@/lib/auth-context";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const { login } = useAuth();
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
      setPasswordError("Password wajib diisi");
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

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col gap-2">
        {/* Brand mark — visible here so the right column doesn't have to carry
            the whole identity. This column is always dark, so it uses the
            dark-mode cut of the wordmark regardless of the stored theme. */}
        <Image
          src="/brand/logo-dark.webp"
          alt="Alfan Media"
          width={200}
          height={119}
          sizes="70px"
          loading="eager"
          className="mb-3 h-10 w-auto object-contain"
        />

        <h1
          className="text-[28px] leading-tight tracking-tight text-foreground"
          style={{ fontVariationSettings: fontWeights.semibold }}
        >
          Selamat datang kembali
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Masuk untuk mengelola produk, stok, penjualan, dan laporan toko.
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <InputGroup size="default" className="w-full">
          <InputField
            index={0}
            label="Alamat email"
            type="email"
            placeholder="nama@email.com"
            autoComplete="email"
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (emailError) setEmailError(undefined);
            }}
            error={emailError}
          />
          <InputField
            index={1}
            label="Kata sandi"
            type="password"
            placeholder="Masukkan kata sandi"
            autoComplete="current-password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(undefined);
            }}
            error={passwordError}
          />
        </InputGroup>

        <div className="-mt-1 flex items-center justify-start">
          <button
            type="button"
            className="cursor-pointer text-[12px] text-muted-foreground transition-colors duration-80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] rounded-sm"
            style={{ fontVariationSettings: fontWeights.medium }}
          >
            Lupa kata sandi?
          </button>
        </div>

        <Button type="submit" variant="primary" loading={submitting} className="h-10 w-full text-[14px]">
          Masuk
        </Button>
      </form>

      <p className="mt-8 text-center text-[12px] text-muted-foreground">
        Dengan melanjutkan, Anda menyetujui{" "}
        <a
          href="#"
          className="text-foreground underline-offset-4 hover:underline"
          style={{ fontVariationSettings: fontWeights.medium }}
        >
          Ketentuan
        </a>{" "}
        dan{" "}
        <a
          href="#"
          className="text-foreground underline-offset-4 hover:underline"
          style={{ fontVariationSettings: fontWeights.medium }}
        >
          Kebijakan Privasi
        </a>
        .
      </p>
    </div>
  );
}

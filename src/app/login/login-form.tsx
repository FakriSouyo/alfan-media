"use client";

import { useState, type FormEvent } from "react";
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
            the whole identity. Square tile with a layered gradient echo of the
            brand panel. */}
        <div
          className="mb-2 inline-flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ring-foreground/15 bg-foreground/5 text-foreground"
        >
          <span
            className="text-[15px] tracking-tight"
            style={{ fontVariationSettings: fontWeights.bold }}
          >
            t
          </span>
        </div>

        <h1
          className="text-[28px] leading-tight tracking-tight text-foreground"
          style={{ fontVariationSettings: fontWeights.semibold }}
        >
          Welcome back
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Log in to your Alfan Media dashboard to manage books, orders, and
          inventory.
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
            label="Email address"
            type="email"
            placeholder="name@email.com"
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
            label="Password"
            type="password"
            placeholder="Type your password here"
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
            Forgot password?
          </button>
        </div>

        <Button type="submit" variant="primary" loading={submitting} className="h-10 w-full text-[14px]">
          Sign In
        </Button>
      </form>

      <p className="mt-8 text-center text-[12px] text-muted-foreground">
        By continuing you agree to our{" "}
        <a
          href="#"
          className="text-foreground underline-offset-4 hover:underline"
          style={{ fontVariationSettings: fontWeights.medium }}
        >
          Terms
        </a>{" "}
        and{" "}
        <a
          href="#"
          className="text-foreground underline-offset-4 hover:underline"
          style={{ fontVariationSettings: fontWeights.medium }}
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

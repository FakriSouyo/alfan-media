import { betterAuth } from "better-auth";
import type { Env } from "./context";

export function createAuth(env: Env) {
  if(!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_SECRET dan BETTER_AUTH_URL wajib dikonfigurasi");
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    verification: { storeIdentifier:"hashed" },
    advanced: { ipAddress:{ ipAddressHeaders:["cf-connecting-ip"] } },
    emailAndPassword: {
      enabled: true, disableSignUp: true, minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({user,url}) => {
        if(!env.RESEND_API_KEY || !env.EMAIL_FROM)throw new Error("Pengiriman email reset belum dikonfigurasi");
        const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.EMAIL_FROM,to:[user.email],subject:"Atur ulang kata sandi Alfan Media",text:`Buka tautan ini untuk mengatur kata sandi akun Alfan Media: ${url}\nAbaikan email ini jika kamu tidak meminta perubahan.`})});
        if(!response.ok)throw new Error("Pengiriman email reset gagal");
      },
    },
    rateLimit: { enabled:true, storage:"database" },
  });
}

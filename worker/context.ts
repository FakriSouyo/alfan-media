import { AsyncLocalStorage } from "node:async_hooks";
export interface Env { DB: D1Database; FILES: R2Bucket; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; AGENT_SAFE_WRITE_REQUIRES_APPROVAL?: string; }
export interface Identity { id: string; role: "admin" | "staff"; }
export const context = new AsyncLocalStorage<{ env: Env; request: Request; user: Identity }>();
export function requestContext() { const value=context.getStore();if(!value)throw new Error("Request context missing");return value; }

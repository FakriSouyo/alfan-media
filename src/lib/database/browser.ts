import { createAuthClient } from "better-auth/react";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { Query, type QueryResult } from "./query";

export const authClient = createAuthClient();
type Listener = (event: string, session: Session | null) => void;
const listeners = new Set<Listener>();
const notify = async (event: string) => { const { data } = await authClient.getSession(); const session = data ? { user: data.user } as unknown as Session : null; for (const listener of listeners) listener(event, session); };
async function post(url: string, body: unknown): Promise<QueryResult> {
  try { const response = await fetch(url,{ method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"},body:JSON.stringify(body) }); const result = await response.json() as QueryResult; return response.ok ? result : { data:null,error:{message: result.error?.message ?? "Permintaan gagal"} }; }
  catch { return {data:null,error:{message:"Koneksi ke server gagal"}}; }
}
function storage(bucket: string) {
  return {
    getPublicUrl: (path: string) => ({ data:{publicUrl:`/api/files/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`} }),
    upload: async (path: string, file: File) => { try { const response=await fetch(`/api/files/${encodeURIComponent(bucket)}/${path}`,{method:"PUT",body:file,headers:{"Content-Type":file.type}}); return {error:response.ok?null:{message:"Gagal mengunggah gambar"}}; } catch { return {error:{message:"Koneksi gagal"}}; } },
    remove: async (paths: string[]) => { for(const path of paths) { const response=await fetch(`/api/files/${encodeURIComponent(bucket)}/${path}`,{method:"DELETE"}); if(!response.ok)return {error:{message:"Gagal menghapus gambar"}}; } return {error:null}; },
  };
}
// Temporary source-level contract for existing UI/tool code. No Supabase SDK
// executes here: all data and authentication go to the same-origin Worker.
const client = {
  snapshot: async () => { const response=await fetch("/api/data/snapshot");if(!response.ok)throw new Error("Data toko gagal dimuat");return response.json() as Promise<Record<string,Record<string,unknown>[]>>; },
  from: (table: string) => new Query(table,query=>post("/api/data/query",query)),
  rpc: (name: string, args?: Record<string,unknown>) => post("/api/data/rpc",{name,args}),
  storage:{from:storage},
  auth: {
    getSession: async () => { const {data,error}=await authClient.getSession(); return {data:{session:data?{user:data.user} as unknown as Session:null},error}; },
    onAuthStateChange: (listener: Listener) => {listeners.add(listener);return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};},
    signInWithPassword: async ({email,password}:{email:string;password:string})=>{ const result=await authClient.signIn.email({email,password}); if(!result.error)await notify("SIGNED_IN");return result; },
    signOut: async ()=>{const result=await authClient.signOut();if(!result.error)await notify("SIGNED_OUT");return result;},
    resetPasswordForEmail: async(email:string,{redirectTo}:{redirectTo?:string})=>authClient.requestPasswordReset({email,redirectTo:redirectTo??`${window.location.origin}/reset-password`}),
    updateUser: async({password}:{password:string})=>authClient.resetPassword({newPassword:password,token:new URLSearchParams(window.location.search).get("token")??""}),
  },
};
export function getDatabaseBrowserClient() { return client as unknown as SupabaseClient; }

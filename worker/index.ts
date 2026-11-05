import { Hono } from "hono";
import { context, type Env, type Identity } from "./context";
import { createAuth } from "./auth";
import { businessTables, executeQuery, decode } from "./database";
import { executeRpc } from "./rpc";
import type { QuerySpec } from "../src/lib/database/query";
import * as chat from "../src/app/api/agent/chat/route";
import * as agentProviders from "../src/app/api/agent/providers/route";
import * as approvals from "../src/app/api/agent/approvals/[id]/route";
import * as settings from "../src/app/api/ai/settings/route";
import * as providers from "../src/app/api/ai/providers/route";
import * as provider from "../src/app/api/ai/providers/[id]/route";
import * as models from "../src/app/api/ai/providers/[id]/models/route";
import * as testProvider from "../src/app/api/ai/providers/[id]/test/route";
import * as fetchModels from "../src/app/api/ai/providers/fetch-models/route";

const app = new Hono<{Bindings:Env;Variables:{user:Identity}}>();
app.onError((error,c)=>{console.error("Worker request failed",error.message);return c.json({error:"Permintaan gagal diproses"},500);});
app.get("/api/health",c=>c.json({status:"ok",runtime:"cloudflare-workers",database:"d1"}));
app.on(["GET","POST"],"/api/auth/*",c=>createAuth(c.env).handler(c.req.raw));
app.use("/api/*",async(c,next)=>{
  if(!["GET","HEAD","OPTIONS"].includes(c.req.method)) {
    const origin=c.req.header("Origin");if(origin&&origin!==new URL(c.req.url).origin)return c.json({error:"Origin tidak diizinkan"},403);
    if(c.req.header("Sec-Fetch-Site")==="cross-site")return c.json({error:"Permintaan lintas situs ditolak"},403);
  }
  const session=await createAuth(c.env).api.getSession({headers:c.req.raw.headers});
  if(!session)return c.json({error:"Silakan masuk terlebih dahulu"},401);
  const profile=await c.env.DB.prepare("SELECT id,role FROM profiles WHERE id=?").bind(session.user.id).first<Identity>();
  if(!profile)return c.json({error:"Profil akun tidak ditemukan"},403);
  c.set("user",profile);
  return context.run({env:c.env,request:c.req.raw,user:profile},next);
});
app.post("/api/data/query",async c=>{
  const content=await c.req.text();if(content.length>128*1024)return c.json({error:"Permintaan terlalu besar"},413);
  const query=JSON.parse(content) as QuerySpec;
  if(!query||typeof query.table!=="string"||!businessTables.includes(query.table))return c.json({error:"Tabel tidak diizinkan"},403);
  return c.json(await executeQuery(c.env.DB,c.get("user"),query));
});
app.post("/api/data/rpc",async c=>{
  const content=await c.req.text();if(content.length>128*1024)return c.json({error:"Permintaan terlalu besar"},413);
  const {name,args}=JSON.parse(content);return c.json(await executeRpc(c.env.DB,c.get("user"),name,args??{}));
});
app.get("/api/data/snapshot",async c=>{
  const tables=["categories","products","product_prices","customers","orders","order_items","stock_movements","surat_jalans"];
  const ordering:Record<string,string>={categories:"name ASC,id",products:"name ASC,id",customers:"name ASC,id",orders:"order_date DESC,id",stock_movements:"created_at DESC,id"};
  const result=await c.env.DB.batch<Record<string,unknown>>(tables.map(t=>c.env.DB.prepare(`SELECT * FROM "${t}" ORDER BY ${ordering[t]??"id"}`)));
  return c.json(Object.fromEntries(tables.map((table,index)=>[table,result[index].results.map(decode)])));
});
const filePath=(bucket:string,path:string)=>{
  if(!["product-images","documents"].includes(bucket)||!path||path.includes("..")||path.includes("\\")||path.startsWith("/"))throw new Error("Invalid file path");return `${bucket}/${path}`;
};
app.get("/api/files/:bucket/*",async c=>{
  const bucket=c.req.param("bucket");const path=c.req.path.split(`/api/files/${bucket}/`)[1]??"";
  const object=await c.env.FILES.get(filePath(bucket,decodeURIComponent(path)));if(!object)return c.notFound();
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("etag",object.httpEtag);headers.set("X-Content-Type-Options","nosniff");headers.set("Cache-Control","private,max-age=3600");return new Response(object.body,{headers});
});
app.put("/api/files/:bucket/*",async c=>{
  const bucket=c.req.param("bucket");const path=decodeURIComponent(c.req.path.split(`/api/files/${bucket}/`)[1]??"");
  const type=c.req.header("Content-Type")??"";if(bucket!=="product-images"||!["image/png","image/jpeg","image/webp"].includes(type))return c.json({error:"Tipe file tidak diizinkan"},400);
  if(Number(c.req.header("Content-Length"))>5*1024*1024)return c.json({error:"Maksimal 5 MB"},413);
  const bytes=await c.req.arrayBuffer();if(bytes.byteLength>5*1024*1024)return c.json({error:"Maksimal 5 MB"},413);
  await c.env.FILES.put(filePath(bucket,path),bytes,{httpMetadata:{contentType:type}});return c.json({success:true});
});
app.delete("/api/files/:bucket/*",async c=>{const bucket=c.req.param("bucket");const path=decodeURIComponent(c.req.path.split(`/api/files/${bucket}/`)[1]??"");await c.env.FILES.delete(filePath(bucket,path));return c.json({success:true});});

app.post("/api/agent/chat",c=>chat.POST(c.req.raw));
app.get("/api/agent/providers",()=>agentProviders.GET());
app.post("/api/agent/approvals/:id",c=>approvals.POST(c.req.raw,{params:Promise.resolve({id:c.req.param("id")})}));
app.get("/api/ai/settings",()=>settings.GET());
app.put("/api/ai/settings",c=>settings.PUT(c.req.raw));
app.delete("/api/ai/settings",()=>settings.DELETE());
app.get("/api/ai/providers",()=>providers.GET());
app.post("/api/ai/providers",c=>providers.POST(c.req.raw));
app.put("/api/ai/providers/:id",c=>provider.PUT(c.req.raw,{params:Promise.resolve({id:c.req.param("id")})}));
app.delete("/api/ai/providers/:id",c=>provider.DELETE(c.req.raw,{params:Promise.resolve({id:c.req.param("id")})}));
app.post("/api/ai/providers/:id/models",c=>models.POST(c.req.raw,{params:Promise.resolve({id:c.req.param("id")})}));
app.post("/api/ai/providers/:id/test",c=>testProvider.POST(c.req.raw,{params:Promise.resolve({id:c.req.param("id")})}));
app.post("/api/ai/providers/fetch-models",c=>fetchModels.POST(c.req.raw));
app.all("/api/*",c=>c.json({error:"Endpoint tidak ditemukan"},404));
export default app;

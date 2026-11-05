import type { SupabaseClient } from "@supabase/supabase-js";
import { Query, type QuerySpec, type QueryResult, type Filter } from "../src/lib/database/query";
import type { Identity } from "./context";
import { executeRpc } from "./rpc";

export const businessTables = ["categories","products","product_prices","customers","orders","order_items","stock_movements","surat_jalans","order_revisions","order_revision_items","documents","settings","profiles"];
const serverTables = [...businessTables,"ai_providers","ai_settings","agent_approvals"];
const booleanColumns = new Set(["is_default","archived","enabled","irreversible"]);
const jsonColumns = new Set(["models","params","value"]);
export function encode(value: unknown): string | number | null { if(value===null||value===undefined)return null;if(typeof value==="boolean")return Number(value);if(typeof value==="object")return JSON.stringify(value);if(typeof value==="number"||typeof value==="string")return value;throw new Error("Invalid SQL value"); }
export function decode(row: Record<string,unknown>) { for(const key of Object.keys(row)){if(booleanColumns.has(key))row[key]=!!row[key];if(jsonColumns.has(key)&&typeof row[key]==="string")row[key]=JSON.parse(row[key] as string);}return row; }
export function identifier(value: string) { if(!/^[a-z_][a-z0-9_]*$/i.test(value))throw new Error("Invalid identifier");return `"${value}"`; }

export async function executeQuery(db: D1Database, user: Identity, query: QuerySpec, options: { internal?: boolean; configRead?: boolean } = {}): Promise<QueryResult> {
  try {
    const allowed = options.internal ? serverTables : businessTables;
    if(!allowed.includes(query.table))throw new Error("Table access denied");
    if(["ai_providers","ai_settings"].includes(query.table) && user.role!=="admin" && !(options.configRead && query.action==="select"))throw new Error("Administrator required");
    const info = await db.prepare(`PRAGMA table_info(${identifier(query.table)})`).all<{name:string}>();
    const columns = new Set(info.results.map(r=>r.name));
    const column=(name:string)=>{if(!columns.has(name))throw new Error(`Unknown column ${name}`);return identifier(name);};
    const bound: (string|number|null)[]=[];
    const filter=(f:Filter):string=>{
      if(f.op==="or") {
        if(typeof f.value!=="string")throw new Error("Invalid OR filter");
        const parts=f.value.split(",").map(part=>{const match=/^([a-z_]+)\.(eq|ilike)\.(.*)$/i.exec(part);if(!match)throw new Error("Invalid OR expression");return filter({column:match[1],op:match[2],value:match[3]});});
        return `(${parts.join(" OR ")})`;
      }
      const name=column(f.column);
      if(f.op==="in") { if(!Array.isArray(f.value)||f.value.length>90)throw new Error("IN filter exceeds 90 values; chunk the request");if(!f.value.length)return "0";bound.push(...f.value.map(encode));return `${name} IN (${f.value.map(()=>"?").join(",")})`; }
      const operators:Record<string,string>={eq:"=",neq:"!=",gt:">",gte:">=",lt:"<",lte:"<=",is:"IS",ilike:"LIKE"};
      if(!operators[f.op])throw new Error("Unknown operator");bound.push(encode(f.value));return `${name} ${operators[f.op]} ?${f.op==="ilike"?" COLLATE NOCASE":""}`;
    };
    const filters=[...(query.filters??[])];
    if(query.table==="profiles") { if(query.action!=="select")throw new Error("Profile changes require administrator tooling");if(user.role!=="admin")filters.push({column:"id",op:"eq",value:user.id}); }
    if(query.table==="agent_approvals")filters.push({column:"user_id",op:"eq",value:user.id});
    const where=filters.length?` WHERE ${filters.map(filter).join(" AND ")}`:"";
    const selected=query.columns==="*"?"*":query.columns.split(",").map(s=>column(s.trim())).join(",");
    if(query.action==="select") {
      const count=query.count?await db.prepare(`SELECT count(*) as n FROM ${identifier(query.table)}${where}`).bind(...bound).first<number>("n"):null;
      if(query.head)return {data:null,error:null,count};
      const order=query.orders?.length?` ORDER BY ${query.orders.map(o=>`${column(o.column)} ${o.ascending?"ASC":"DESC"}`).join(",")}`:"";
      const limit=query.limit===undefined?1000:query.limit;
      if(!Number.isInteger(limit)||limit<0||limit>1000||!Number.isInteger(query.offset??0)||(query.offset??0)<0)throw new Error("Invalid pagination");
      const result=await db.prepare(`SELECT ${selected} FROM ${identifier(query.table)}${where}${order} LIMIT ? OFFSET ?`).bind(...bound,limit,query.offset??0).all<Record<string,unknown>>();
      const rows=result.results.map(decode);
      if(query.single==="one"&&rows.length!==1)throw new Error("Expected exactly one row");if(query.single==="maybe"&&rows.length>1)throw new Error("Expected at most one row");
      return {data:query.single?(rows[0]??null):rows,error:null,count};
    }
    if(!["insert","update","delete","upsert"].includes(query.action))throw new Error("Invalid action");
    // Financial transitions and prices/products use dedicated atomic commands.
    if(!options.internal && ["orders","products","product_prices","order_items","stock_movements","order_revisions","order_revision_items","documents","settings"].includes(query.table)) {
      const keys=Object.keys(query.values??{});
      const orderPatch=query.table==="orders"&&query.action==="update"&&keys.every(k=>["archived","customer_name","subtotal","discount","total"].includes(k));
      const adjustment=query.table==="stock_movements"&&query.action==="insert"&&!Array.isArray(query.values)&&(query.values?.type==="ADJUSTMENT");
      const productDelete=query.table==="products"&&query.action==="delete";
      if(!orderPatch&&!adjustment&&!productDelete)throw new Error("Use an atomic command");
    }
    if((query.action==="update"||query.action==="delete")&&!filters.length)throw new Error("Mutation requires a filter");
    const statements:D1PreparedStatement[]=[];
    if(query.action==="insert"||query.action==="upsert") {
      const rows=Array.isArray(query.values)?query.values:[query.values];if(!rows.length||rows.length>100)throw new Error("Invalid bulk insert");
      for(const raw of rows) {
        if(!raw||typeof raw!=="object")throw new Error("Missing values");
        const row={...raw};if(columns.has("id")&&row.id===undefined&&query.table!=="ai_settings")row.id=crypto.randomUUID();
        if(columns.has("created_by"))row.created_by=user.id;
        if(query.table==="agent_approvals")row.user_id=user.id;
        const keys=Object.keys(row);const conflict=query.action==="upsert"?` ON CONFLICT (${(query.onConflict??"id").split(",").map(column).join(",")}) DO UPDATE SET ${keys.map(k=>`${column(k)}=excluded.${column(k)}`).join(",")}`:"";
        statements.push(db.prepare(`INSERT INTO ${identifier(query.table)} (${keys.map(column).join(",")}) VALUES (${keys.map(()=>"?").join(",")})${conflict} RETURNING ${selected}`).bind(...keys.map(k=>encode(row[k]))));
      }
    } else if(query.action==="update") {
      if(!query.values||Array.isArray(query.values))throw new Error("Invalid patch");
      const row={...query.values};if(columns.has("updated_at"))row.updated_at=new Date().toISOString();
      if(query.table==="products"&&"stock" in row)throw new Error("Stock is derived from ledger");
      const keys=Object.keys(row);if(!keys.length)throw new Error("Empty patch");
      statements.push(db.prepare(`UPDATE ${identifier(query.table)} SET ${keys.map(k=>`${column(k)}=?`).join(",")}${where} RETURNING ${selected}`).bind(...keys.map(k=>encode(row[k])),...bound));
    } else statements.push(db.prepare(`DELETE FROM ${identifier(query.table)}${where} RETURNING ${selected}`).bind(...bound));
    const results=await db.batch<Record<string,unknown>>(statements);
    const rows=results.flatMap(r=>r.results.map(decode));
    if(query.single==="one"&&rows.length!==1)throw new Error("Mutation affected no row");
    // Approval compare-and-swap must report losing races as an error.
    if(query.table==="agent_approvals"&&query.action==="update"&&!rows.length)throw new Error("Approval already consumed");
    return {data:query.returning?(query.single?(rows[0]??null):rows):null,error:null};
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:"Database operation failed",code:"DB_ERROR"}};}
}

export function createDatabaseClient(db:D1Database,user:Identity,configRead=false):SupabaseClient {
  return {
    from:(table:string)=>new Query(table,q=>executeQuery(db,user,q,{internal:true,configRead})),
    rpc:(name:string,args?:Record<string,unknown>)=>executeRpc(db,user,name,args??{}),
    auth:{getUser:async()=>({data:{user:{id:user.id}},error:null})},
  } as unknown as SupabaseClient;
}

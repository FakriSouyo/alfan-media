import type { Identity } from "./context";
import type { QueryResult } from "../src/lib/database/query";
import { decode, encode, identifier } from "./database";

type Row = Record<string,unknown>;
function object(value:unknown):Row { if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid object");return value as Row; }
function array(value:unknown):Row[] { if(!Array.isArray(value)||!value.length||value.length>100)throw new Error("Expected 1–100 items");return value.map(object); }
function pick(row:Row,keys:string[]):Row { const result:Row={};for(const key of keys)if(row[key]!==undefined)result[key]=row[key];return result; }
function insert(db:D1Database,table:string,row:Row) { const keys=Object.keys(row);return db.prepare(`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`).bind(...keys.map(k=>encode(row[k]))); }
const productKeys=["name","category_id","barcode","description","published_year","semester","cost_price","image_path"];
const priceKeys=["tier_name","price","is_default"];
const itemKeys=["product_id","product_name","product_barcode","quantity","unit_price","price_tier","custom_price","discount_percent","subtotal","cost_price"];
function nonnegativeInteger(value: unknown, field: string) { if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error(`${field} must be a nonnegative safe integer`); }
function validatePrices(prices:Row[]) { for(const price of prices)nonnegativeInteger(price.price,"price"); }
export async function executeRpc(db:D1Database,user:Identity,name:string,args:Row):Promise<QueryResult> {
  try {
    if(name==="next_invoice_no") {
      const row=await db.prepare("SELECT 'INV-' || printf('%03d',coalesce(max(CAST(substr(invoice_no,5) AS INTEGER)),0)+1) AS invoice FROM orders WHERE invoice_no GLOB 'INV-[0-9]*'").first<{invoice:string}>();
      return {data:row?.invoice,error:null};
    }
    if(name==="create_order_atomic") {
      const order=object(args.p_order);const items=array(args.p_items);const id=crypto.randomUUID();
      for(const key of ["subtotal","discount","total"])nonnegativeInteger(order[key],key);
      for(const item of items){if(!Number.isSafeInteger(item.quantity)||Number(item.quantity)<=0)throw new Error("Quantity must be a positive integer");for(const key of ["unit_price","subtotal"])nonnegativeInteger(item[key],key);if(item.cost_price!=null)nonnegativeInteger(item.cost_price,"cost_price");if(item.custom_price!=null)nonnegativeInteger(item.custom_price,"custom_price");if(item.discount_percent!=null&&(!Number.isFinite(item.discount_percent)||Number(item.discount_percent)<0||Number(item.discount_percent)>100))throw new Error("Invalid item discount");}
      if(!["DRAFT","CHECKED_OUT"].includes(String(order.status??"DRAFT")))throw new Error("Invalid initial status");
      const statements=[db.prepare("INSERT INTO orders(id,invoice_no,order_date,customer_id,customer_name,subtotal,discount,total,status,created_by) SELECT ?, 'INV-' || printf('%03d',coalesce(max(CAST(substr(invoice_no,5) AS INTEGER)),0)+1),?,?,?,?,?,?,'DRAFT',? FROM orders WHERE invoice_no GLOB 'INV-[0-9]*'").bind(id,encode(order.order_date),encode(order.customer_id||null),encode(order.customer_name),encode(order.subtotal),encode(order.discount),encode(order.total),user.id)];
      for(const item of items)statements.push(insert(db,"order_items",{...pick(item,itemKeys),id:crypto.randomUUID(),order_id:id,product_id:item.product_id||null,product_barcode:item.product_barcode??"",cost_price:item.cost_price??0}));
      if(args.p_surat_jalan)statements.push(insert(db,"surat_jalans",{...pick(object(args.p_surat_jalan),["no","tanggal","pengirim","penerima","estimasi","nama_pengirim","kendaraan","catatan"]),id:crypto.randomUUID(),order_id:id}));
      if(order.status==="CHECKED_OUT")statements.push(db.prepare("UPDATE orders SET status='CHECKED_OUT' WHERE id=?").bind(id));
      statements.push(db.prepare("SELECT * FROM orders WHERE id=?").bind(id));
      const result=await db.batch<Row>(statements);return {data:decode(result.at(-1)!.results[0]),error:null};
    }
    if(name==="transition_order_atomic") {
      const target=String(args.p_target);const source:Record<string,string>={CHECKED_OUT:"DRAFT",COMPLETED:"CHECKED_OUT",CANCELLED:"CHECKED_OUT"};
      if(!source[target])throw new Error("Unsupported transition");
      const allowed=target==="CANCELLED"?"('DRAFT','CHECKED_OUT')":`('${source[target]}')`;
      const results=await db.batch<Row>([
        db.prepare(`UPDATE orders SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE invoice_no=? AND status IN ${allowed}`).bind(target,encode(args.p_invoice_no)),
        db.prepare("SELECT status FROM orders WHERE invoice_no=?").bind(encode(args.p_invoice_no)),
      ]);return {data:results[1].results[0]?.status===target,error:null};
    }
    if(name==="delete_order_atomic") { const result=await db.prepare("DELETE FROM orders WHERE invoice_no=? RETURNING id").bind(encode(args.p_invoice_no)).all();return {data:result.results.length>0,error:null}; }
    if(name==="create_product_atomic") {
      const product=object(args.p_product);const prices=array(args.p_prices);const id=crypto.randomUUID();const stock=Number(args.p_initial_stock);
      validatePrices(prices);if(product.cost_price!=null)nonnegativeInteger(product.cost_price,"cost_price");
      if(!Number.isInteger(stock)||stock<0)throw new Error("Initial stock must be nonnegative");
      const statements=[insert(db,"products",{...pick(product,productKeys),category_id:product.category_id||null,id,stock:0})];
      for(const price of prices)statements.push(insert(db,"product_prices",{...pick(price,priceKeys),id:crypto.randomUUID(),product_id:id}));
      if(stock)statements.push(insert(db,"stock_movements",{id:crypto.randomUUID(),product_id:id,type:"INITIAL",quantity:stock,reference:"Stock awal",created_by:user.id}));
      statements.push(db.prepare("SELECT * FROM products WHERE id=?").bind(id));const result=await db.batch<Row>(statements);return {data:decode(result.at(-1)!.results[0]),error:null};
    }
    if(name==="update_product_atomic") {
      const patch=pick(object(args.p_patch),productKeys);if(patch.category_id==="")patch.category_id=null;
      if(patch.cost_price!=null)nonnegativeInteger(patch.cost_price,"cost_price");
      const id=encode(args.p_id);const keys=Object.keys(patch);const statements:D1PreparedStatement[]=[];
      if(keys.length)statements.push(db.prepare(`UPDATE products SET ${keys.map(k=>`${identifier(k)}=?`).join(",")},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(...keys.map(k=>encode(patch[k])),id));
      if(args.p_prices!==undefined&&args.p_prices!==null){const prices=array(args.p_prices);validatePrices(prices);statements.push(db.prepare("DELETE FROM product_prices WHERE product_id=?").bind(id));for(const price of prices)statements.push(insert(db,"product_prices",{...pick(price,priceKeys),id:crypto.randomUUID(),product_id:id}));}
      statements.push(db.prepare("SELECT id FROM products WHERE id=?").bind(id));const result=await db.batch(statements);return {data:result.at(-1)!.results.length>0,error:null};
    }
    if(name==="pending_approval_count") { const count=await db.prepare("SELECT count(*) AS n FROM agent_approvals WHERE user_id=? AND status='pending' AND expires_at>?").bind(user.id,new Date().toISOString()).first<number>("n");return {data:count,error:null}; }
    throw new Error("Unknown command");
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:"Transaction failed",code:"TRANSACTION_FAILED"}};}
}

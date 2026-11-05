import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const root=path.resolve(process.argv[2]??'');const {cookie}=JSON.parse(fs.readFileSync(path.join(root,'local-smoke-credentials.json'),'utf8'));const origin='http://localhost:3000';
async function rpc(name,args){const response=await fetch(origin+'/api/data/rpc',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name,args})});assert.equal(response.status,200);return response.json();}
let product;const orders=[];
try {
 const created=await rpc('create_product_atomic',{p_product:{name:'Migration concurrency test',barcode:randomUUID()},p_prices:[{tier_name:'Normal',price:10000,is_default:true}],p_initial_stock:2});assert.equal(created.error,null);product=created.data.id;
 for(let i=0;i<2;i++){const order=await rpc('create_order_atomic',{p_order:{order_date:'2026-11-04',customer_name:'Local concurrency test',subtotal:20000,discount:0,total:20000,status:'DRAFT'},p_items:[{product_id:product,product_name:'Migration concurrency test',product_barcode:'',quantity:2,unit_price:10000,subtotal:20000}]});assert.equal(order.error,null);orders.push(order.data.invoice_no);}
 const result=await Promise.all(orders.map(invoice=>rpc('transition_order_atomic',{p_invoice_no:invoice,p_target:'CHECKED_OUT'})));assert.equal(result.filter(r=>r.data===true).length,1,'Exactly one simultaneous checkout should succeed');assert.equal(result.filter(r=>r.error).length,1);
 const winner=orders[result.findIndex(r=>r.data===true)];const cancel=await rpc('transition_order_atomic',{p_invoice_no:winner,p_target:'CANCELLED'});assert.equal(cancel.data,true);assert.equal((await rpc('transition_order_atomic',{p_invoice_no:winner,p_target:'CANCELLED'})).data,true);
 const snapshot=await (await fetch(origin+'/api/data/snapshot',{headers:{Cookie:cookie}})).json();assert.equal(snapshot.products.find(p=>p.id===product).stock,2);console.log('PASS: two concurrent real Workers/D1 checkouts compete for the last 2 units; only one succeeds. Repeated cancellation restores stock exactly once.');
}finally{
 for(const invoice of orders){const result=await rpc('delete_order_atomic',{p_invoice_no:invoice});assert.equal(result.error,null);}
 if(product){const response=await fetch(origin+'/api/data/query',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({table:'products',action:'delete',columns:'*',filters:[{column:'id',op:'eq',value:product}],orders:[]})});const result=await response.json();assert.equal(result.error,null);}
 console.log('Local test orders and product removed.');
}

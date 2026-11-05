import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
process.loadEnvFile('.env.local');
const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key||key.includes('your-'))throw new Error('Supabase source credentials missing');
const headers={apikey:key,Authorization:`Bearer ${key}`};
const tables=['profiles','categories','customers','products','product_prices','orders','order_items','order_revisions','order_revision_items','surat_jalans','stock_movements','documents','settings','agent_approvals','ai_providers','ai_settings'];
const output=path.resolve('migration-data',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
async function request(url,options={}){const response=await fetch(url,{...options,headers:{...headers,...options.headers}});if(!response.ok)throw new Error(`Supabase export failed (${response.status}) at ${new URL(url).pathname}`);return response.json();}
async function readTable(table){const rows=[];for(let offset=0;;offset+=500){const page=await request(`${base}/rest/v1/${table}?select=*&order=${table==='settings'?'key':'id'}.asc&offset=${offset}&limit=500`);rows.push(...page);if(page.length<500)return rows;}}
const manifest={version:1,exportedAt:new Date().toISOString(),tables:{},files:[],auth:{passwordHashes:false},verifiedStable:false};
const data={};
for(const table of tables){const rows=await readTable(table);data[table]=rows;await fs.writeFile(path.join(output,table+'.json'),JSON.stringify(rows));manifest.tables[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};console.log(`${table}: ${rows.length} rows`);}
const users=[];
for(let page=1;;page++){const result=await request(`${base}/auth/v1/admin/users?page=${page}&per_page=500`);const batch=result.users??[];users.push(...batch.map(({id,email,email_confirmed_at,created_at,updated_at,user_metadata})=>({id,email,email_confirmed_at,created_at,updated_at,user_metadata})));if(batch.length<500)break;}
await fs.writeFile(path.join(output,'auth-users.json'),JSON.stringify(users));
for(const bucket of ['product-images','documents']){
  async function list(prefix=''){for(let offset=0;;offset+=100){const entries=await request(`${base}/storage/v1/object/list/${bucket}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})});for(const entry of entries){const name=prefix?`${prefix}/${entry.name}`:entry.name;if(!entry.id){await list(name);continue;}if(name.split('/').some(p=>p==='..'||p==='.')||name.includes('\\'))throw new Error('Unsafe storage key');const response=await fetch(`${base}/storage/v1/object/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`,{headers});if(!response.ok)throw new Error(`Storage download failed (${response.status})`);const bytes=Buffer.from(await response.arrayBuffer());const target=path.join(output,'files',bucket,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);manifest.files.push({bucket,key:name,size:bytes.length,contentType:response.headers.get('content-type'),sha256:createHash('sha256').update(bytes).digest('hex')});}if(entries.length<100)break;}}
  await list();
}
// A changing source is not a cutover snapshot. Refuse to mark it stable.
for(const table of tables){const rows=await readTable(table);if(createHash('sha256').update(JSON.stringify(rows)).digest('hex')!==manifest.tables[table].sha256)throw new Error(`Source changed during export (${table}). Pause writes and export again. Snapshot kept at ${output}`);}
manifest.verifiedStable=true;
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Verified export saved: ${output}`);
console.log(`Auth users: ${users.length}; storage objects: ${manifest.files.length}. Password hashes are not exposed by the Supabase Admin API; account activation is required.`);

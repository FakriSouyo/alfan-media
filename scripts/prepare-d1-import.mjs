import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/prepare-d1-import.mjs migration-data/<snapshot>');
const root=path.resolve(input);const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(!manifest.verifiedStable)throw new Error('Source snapshot has not passed stability verification');
const db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('cloudflare/migrations').sort())db.exec(fs.readFileSync('cloudflare/migrations/'+file,'utf8'));
const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
const triggerSql=triggers.map(t=>t.sql+';').join('\n');
const triggerNames=triggers.map(t=>t.name);
const statements=triggerNames.map(name=>`DROP TRIGGER ${name};`);
const tables=Object.keys(manifest.tables);
const quote=value=>value==null?'NULL':typeof value==='boolean'?String(Number(value)):typeof value==='number'?(Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?String(value):(()=>{throw new Error('Unsafe numeric value')})()):`'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")}'`;
statements.unshift(`CREATE TABLE _import_guard (empty integer CHECK(empty=1));\nINSERT INTO _import_guard SELECT CASE WHEN ${[...tables,'user','session','account','verification'].map(t=>`NOT EXISTS(SELECT 1 FROM "${t}")`).join(' AND ')} THEN 1 ELSE 0 END;`);
const data={};
for(const table of tables){
 const rows=JSON.parse(fs.readFileSync(path.join(root,table+'.json'),'utf8'));data[table]=rows;
 if(createHash('sha256').update(JSON.stringify(rows)).digest('hex')!==manifest.tables[table].sha256)throw new Error(`Snapshot checksum mismatch: ${table}`);
 const columns=new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name));
 for(const row of rows){const keys=Object.keys(row);if(keys.some(k=>!columns.has(k)))throw new Error(`Unmapped source column in ${table}`);statements.push(`INSERT INTO "${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(k=>quote(row[k])).join(',')});`);}
}
// Reconcile each stock balance from the ledger before accepting the import.
for(const product of data.products){const sum=data.stock_movements.filter(m=>m.product_id===product.id).reduce((n,m)=>n+Number(m.quantity),0);if(sum!==Number(product.stock))throw new Error(`Stock mismatch for product ${product.id}: source=${product.stock}, ledger=${sum}`);}
const authUsers=JSON.parse(fs.readFileSync(path.join(root,'auth-users.json'),'utf8'));
for(const profile of data.profiles){const source=authUsers.find(u=>u.id===profile.id);if(!source||!source.email)throw new Error('Profile has no matching authentication user');const created=new Date(source.created_at).toISOString();const updated=new Date(source.updated_at??source.created_at).toISOString();statements.push(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (${quote(profile.id)},${quote(profile.name)},${quote(source.email)},${source.email_confirmed_at?1:0},${quote(created)},${quote(updated)});`);}
statements.push(triggerSql,"UPDATE migration_state SET verified=1,imported_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;",'DROP TABLE _import_guard;');
const sql=statements.join('\n');
db.exec(sql);
const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();if(foreignKeys.length)throw new Error('Foreign key mismatch');
for(const table of tables){const count=db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n;if(count!==manifest.tables[table].count)throw new Error(`Count mismatch: ${table}`);}
fs.writeFileSync(path.join(root,'import.sql'),sql);
fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({validatedAt:new Date().toISOString(),foreignKeys:true,stocks:true,counts:true,tables:manifest.tables,authUsers:data.profiles.length,sourceSnapshot:root,importSha256:createHash('sha256').update(sql).digest('hex')},null,2));
db.close();console.log(`Validated D1 import: ${path.join(root,'import.sql')}. All rows, foreign keys and stock balances match. Existing destination databases are rejected.`);

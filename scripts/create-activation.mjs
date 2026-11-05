import fs from 'node:fs';import path from 'node:path';import {randomBytes,randomUUID,createHash} from 'node:crypto';
const [snapshot,origin]=process.argv.slice(2);if(!snapshot||!origin)throw new Error('Usage: node scripts/create-activation.mjs <snapshot> <app-origin>');
const url=new URL(origin);if(url.protocol!=='https:'&&url.hostname!=='localhost')throw new Error('Activation requires HTTPS');
const root=path.resolve(snapshot);const profiles=JSON.parse(fs.readFileSync(path.join(root,'profiles.json'),'utf8'));
const expires=Date.now()+24*60*60*1000;const now=Date.now();const sql=[];const links=[];
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
for(const profile of profiles){const token=randomBytes(32).toString('base64url');const identifier=createHash('sha256').update('reset-password:'+token).digest('base64url');sql.push(`INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(${quote(randomUUID())},${quote(identifier)},${quote(profile.id)},${quote(new Date(expires).toISOString())},${quote(new Date(now).toISOString())},${quote(new Date(now).toISOString())});`);links.push(`- ${profile.email}: ${origin}/reset-password?token=${token}`);}
const prefix=url.hostname==='localhost'?'local':'production';
fs.writeFileSync(path.join(root,`${prefix}-activation.sql`),sql.join('\n'));
fs.writeFileSync(path.join(root,`${prefix}-activation.md`),`# Aktivasi akun Alfan Media\n\nTautan privat, sekali pakai. Kedaluwarsa: ${new Date(expires).toISOString()}. Jangan bagikan file ini.\n\n${links.join('\n')}\n`);
console.log(`Activation prepared for ${profiles.length} account(s). Private links saved to ${path.join(root,`${prefix}-activation.md`)} (not printed).`);

import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';import {spawn} from 'node:child_process';
const [snapshot,origin]=process.argv.slice(2);if(!snapshot||!origin)throw new Error('Pass snapshot directory and deployed HTTPS origin');if(new URL(origin).protocol!=='https:')throw new Error('HTTPS required');
const target=path.join(path.resolve(snapshot),'production-secrets.json');const previous=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
fs.writeFileSync(target,JSON.stringify({BETTER_AUTH_SECRET:previous.BETTER_AUTH_SECRET??randomBytes(48).toString('base64url'),BETTER_AUTH_URL:origin}));
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk',target],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(output)));});
console.log('Production authentication secret and trusted origin configured. Secret values were not printed.');

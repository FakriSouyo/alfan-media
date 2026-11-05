import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]??'');const origin='http://localhost:3000';
const activation=fs.readFileSync(path.join(root,'local-activation.md'),'utf8');const token=new URL(activation.match(/http:\/\/localhost:3000\/reset-password\?token=\S+/)[0]).searchParams.get('token');
const profile=JSON.parse(fs.readFileSync(path.join(root,'profiles.json'),'utf8'))[0];const password=randomBytes(24).toString('base64url');
async function request(route,body,cookie){const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {response,data:await response.json()};}
assert.equal((await request('/api/health')).response.status,200);
assert.equal((await request('/api/data/snapshot')).response.status,401);
const reset=await request('/api/auth/reset-password',{token,newPassword:password});assert.equal(reset.response.status,200,JSON.stringify(reset.data));
const replay=await request('/api/auth/reset-password',{token,newPassword:password});assert.equal(replay.response.status,400,'Activation token replay must fail');
const login=await request('/api/auth/sign-in/email',{email:profile.email,password});assert.equal(login.response.status,200,JSON.stringify(login.data));
const cookie=login.response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
const snapshot=await request('/api/data/snapshot',null,cookie);assert.equal(snapshot.response.status,200,JSON.stringify(snapshot.data));
for(const table of ['products','orders','order_items','stock_movements'])assert.equal(snapshot.data[table].length,JSON.parse(fs.readFileSync(path.join(root,table+'.json'),'utf8')).length,table);
const providers=await request('/api/ai/providers',null,cookie);assert.equal(providers.response.status,200,JSON.stringify(providers.data));
for(const source of JSON.parse(fs.readFileSync(path.join(root,'ai_providers.json'),'utf8')))assert.ok(!JSON.stringify(providers.data).includes(source.api_key),'Provider secret leaked');
const forbidden=await request('/api/data/query',{table:'ai_providers',action:'select',columns:'*',filters:[],orders:[]},cookie);assert.equal(forbidden.response.status,403);
fs.writeFileSync(path.join(root,'local-smoke-credentials.json'),JSON.stringify({email:profile.email,password,cookie}));
console.log('PASS: Worker health, unauthenticated denial, account activation, token replay denial, login, exact imported counts, provider secret masking and private table denial. Local browser test credentials saved privately.');

import fs from 'node:fs';import { randomBytes } from 'node:crypto';
if(!fs.existsSync('.dev.vars'))fs.writeFileSync('.dev.vars',`BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\nBETTER_AUTH_URL=http://localhost:3000\n`);
console.log('Local authentication configuration ready (.dev.vars; ignored by Git).');

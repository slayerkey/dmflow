import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const version=process.versions.node.split('.').map(Number);
const nodeOk=version[0]>22 || (version[0]===22 && (version[1]>13 || (version[1]===13 && version[2]>=0)));
const exists=p=>fs.existsSync(path.join(root,p));

function readLocalVars(){
  const file=path.join(root,'workers/api/.dev.vars');
  const values={};
  if(!fs.existsSync(file))return values;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const m=line.match(/^([A-Z0-9_]+)=(.*)$/);
    if(m&&m[2].trim())values[m[1]]=true;
  }
  return values;
}
const localVars=readLocalVars();
const present=name=>Boolean(process.env[name]||localVars[name]);
const yn=v=>v?'READY':'MISSING';

console.log('\nDMFlow doctor\n=============');
console.log(`Node >=22.13:           ${nodeOk?'PASS':'FAIL'} (${process.versions.node})`);
console.log(`Portal source:          ${yn(exists('apps/portal/server.mjs'))}`);
console.log(`Creator desktop source: ${yn(exists('apps/desktop/electron/main.ts'))}`);
console.log(`Cloudflare local config:${exists('workers/api/wrangler.local.json')?' PRESENT':' NOT CREATED'}`);
console.log('');
console.log('Scout discovery');
console.log(`  CSV / operator list:  READY ($0 provider cost)`);
console.log(`  Influencers Club:     ${yn(Boolean(process.env.SCOUT_INFLUENCERS_CLUB_API_KEY))}`);
console.log(`  Modash:               ${yn(Boolean(process.env.SCOUT_MODASH_API_KEY))}`);
console.log(`  Local Ollama drafting:${yn(Boolean(process.env.SCOUT_OLLAMA_URL))}`);
console.log('');
console.log('Creator live-mode local credential presence');
for(const name of ['META_APP_ID','META_APP_SECRET','META_WEBHOOK_SECRET','META_VERIFY_TOKEN','TOKEN_ENCRYPTION_KEY']){
  console.log(`  ${name.padEnd(22)} ${yn(present(name))}`);
}
console.log('');
console.log('Next action');
if(!nodeOk){
  console.log('  1. Install Node 22.13+.');
} else {
  console.log('  1. Scout can be piloted now: npm run web:dev');
  console.log('     Open http://127.0.0.1:4173/app#scout');
  console.log('     Follow docs/PILOT-RUNBOOK.md.');
}
if(!process.env.SCOUT_INFLUENCERS_CLUB_API_KEY && !process.env.SCOUT_MODASH_API_KEY){
  console.log('  2. Live discovery is optional. Use CSV first; if the pilot needs search, add an Influencers Club trial key locally.');
} else {
  console.log('  2. A licensed discovery key is present. Verify provider terms and source evidence before outreach.');
}
if(!exists('workers/api/wrangler.local.json')){
  console.log('  3. Creator production is separate: run npx wrangler login, then npm run setup when you are ready for a real Meta pilot.');
} else if(!['META_APP_ID','META_APP_SECRET','META_VERIFY_TOKEN','TOKEN_ENCRYPTION_KEY'].every(present)){
  console.log('  3. Cloudflare local config exists, but Meta/local secrets are incomplete. Follow docs/META_SETUP.md and docs/CLOUDFLARE_SETUP.md.');
} else {
  console.log('  3. Local Meta variables appear present. This still does NOT prove App Review, Advanced Access, webhook subscription, or live delivery.');
}
console.log('\nNo secret values were printed.\n');

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parseCSV,normalizeCandidate,evaluate,draftOutreach,exportCSV} from '../packages/scout/src/engine.mjs';
import {buildDiscoveryQuery,buildInfluencersClubRequest,mapInfluencersClubResults,discoverWithInfluencersClub,buildModashRequest,mapModashResults} from '../packages/scout/src/providers.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmflow-portal-'));process.env.DMFLOW_DATA_DIR=tmp;
const {createPortalServer}=await import('../apps/portal/server.mjs');
test('CSV quoted values and invalid input',()=>{assert.equal(parseCSV('handle,platform,caption\nfoo,instagram,"a, b"')[0].caption,'a, b');assert.throws(()=>parseCSV('handle,platform\nx,instagram,"broken'));assert.throws(()=>normalizeCandidate({handle:'x',platform:'instagram'}));});
test('Evidence absence is explicit and draft does not invent performance',()=>{let c=normalizeCandidate({handle:'hello.test',platform:'instagram',niche:'skincare'}), e=evaluate(c,{keywords:'skincare',format:'tutorial'});assert.equal(e.viral_ratio,null);assert(e.limitations.some(s=>s.includes('breakout')));assert(!draftOutreach(c,{title:'test'}).includes('views'));});
test('CSV export neutralizes spreadsheet formulas',()=>{let c=normalizeCandidate({handle:'valid.demo',platform:'tiktok',name:'=HYPERLINK(A1)'});assert(exportCSV({candidates:[c]}).includes("'=HYPERLINK"));});
test('Complete local HTTP recruitment flow with same-origin protections',async()=>{
 let server=createPortalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;
 const post=async(route,data,origin=base)=>{const r=await fetch(base+route,{method:'POST',headers:{'Origin':origin,'Content-Type':'application/json'},body:JSON.stringify(data)});return [r.status,await r.json()];};
 try{
  assert.equal((await fetch(base+'/health').then(r=>r.json())).liveMessaging,false);
  let initialState=await fetch(base+'/api/state').then(r=>r.json());assert.equal(initialState.providers.manual_import.configured,true);assert.equal(initialState.providers.modash.configured,false);assert.equal((await post('/api/discover',{platform:'instagram',limit:3}))[0],400);
  assert.equal((await post('/api/sample',{},'https://evil.example'))[0],403);
  assert.equal((await post('/api/brief',{title:'Routine demo',keywords:'skincare',format:'tutorial'}))[0],200);
  let imported=await post('/api/import',{csv:'name,handle,platform,niche,formats,country,caption,views,baseline_views,posted_at,contact_email,evidence_source\nTaylor,testing.demo,instagram,skincare,tutorial,us,My routine,100000,20000,2026-09-24,taylor@example.invalid,operator-supplied'});
  assert.equal(imported[1].added,1);let c=imported[1].candidates[0];assert.equal(c.verified,false);assert.equal(c.evaluation.evidence_label,'Unverified user import');
  assert.equal((await post('/api/approve',{id:c.id}))[0],400);
  assert.equal((await post('/api/draft',{id:c.id}))[0],200);
  assert.equal((await post('/api/verify',{id:c.id,verified:true}))[0],200);
  let approved=await post('/api/approve',{id:c.id});assert.equal(approved[0],200);assert(approved[1].candidates[0].approved_at);
  let contacted=await post('/api/status',{id:c.id,status:'contacted',response_note:'manually sent via approved email'});assert.equal(contacted[0],200);assert.equal(contacted[1].candidates[0].status,'contacted');
  let state=await fetch(base+'/api/state').then(r=>r.json());assert.equal(state.candidates.length,1);assert.equal(state.candidates[0].response_note,'manually sent via approved email');
  let exportText=await fetch(base+'/api/export').then(r=>r.text());assert(exportText.includes('testing.demo'));assert(fs.existsSync(path.join(tmp,'scout-local.json')));
  assert.equal((await fetch(base+'/etc/passwd')).status,404);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
});

test('Optional AI drafting uses user-configured local-only model and keeps approval gated',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmflow-ai-'));process.env.DMFLOW_DATA_DIR=dir;
 const mock=(await import('node:http')).createServer(async(req,res)=>{let body='';for await(const x of req)body+=x;const payload=JSON.parse(body);assert.equal(payload.model,'local-test-model');assert(!payload.prompt.includes('1000000 views'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({response:'Subject: Creator invitation\n\nWould you be interested in reviewing our brief?'}));});
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));process.env.SCOUT_OLLAMA_URL=`http://127.0.0.1:${mock.address().port}/api/generate`;process.env.SCOUT_OLLAMA_MODEL='local-test-model';
 const server=createPortalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,p)=>{let r=await fetch(base+path,{method:'POST',headers:{'Origin':base,'Content-Type':'application/json'},body:JSON.stringify(p)});return [r.status,await r.json()];};
 try{let s=(await post('/api/sample',{}))[1];const id=s.candidates[0].id;assert.equal((await post('/api/ai-draft',{id}))[0],400);await post('/api/verify',{id,verified:true});let draft=await post('/api/ai-draft',{id});assert.equal(draft[0],200);assert.equal(draft[1].candidates[0].status,'drafted');assert.equal(draft[1].candidates[0].approved_at,null);assert(draft[1].candidates[0].draft.includes('Subject:'));}finally{await new Promise(r=>server.close(r));await new Promise(r=>mock.close(r));delete process.env.SCOUT_OLLAMA_URL;delete process.env.SCOUT_OLLAMA_MODEL;fs.rmSync(dir,{recursive:true,force:true});}
});


test('Licensed discovery adapter keeps costs and evidence explicit',()=>{
  const brief={deliverable:'two skincare tutorials',format:'tutorial',keywords:'skincare,routine'};
  assert(buildDiscoveryQuery(brief).includes('skincare'));
  const req=buildModashRequest({brief,platform:'instagram',limit:7});
  assert.equal(req.url,'https://api.modash.io/v1/ai/instagram/text-search');
  assert.equal(req.body.pageSize,7);
  assert.equal(req.body.filters.lastPostedInDays,30);
  const rows=mapModashResults({profiles:[{profile:{username:'creator.demo',fullname:'Creator Demo',followers:12345,engagementRate:0.04},matchingPosts:[{url:'https://www.instagram.com/p/demo',score:0.88}]}]},{platform:'instagram'});
  assert.equal(rows.length,1);
  assert.equal(rows[0].handle,'creator.demo');
  assert.equal(rows[0].provider_name,'modash');
  assert.equal(rows[0].provider_similarity,0.88);
  assert.equal(rows[0].views,'');
  assert(rows[0].evidence_source.includes('operator must verify'));
});


test('Affordable licensed discovery adapter is source-aware and server-authenticated',async()=>{
  const brief={deliverable:'two skincare tutorials',format:'tutorial',keywords:'skincare,routine',country:'us'};
  const req=buildInfluencersClubRequest({brief,platform:'instagram',limit:8});
  assert.equal(req.url,'https://api-dashboard.influencers.club/public/v1/discovery/');
  assert.equal(req.body.platform,'instagram');
  assert.equal(req.body.paging.limit,8);
  assert(req.body.nlp_search.includes('skincare'));
  const raw={total:1,credits_left:'9.75',accounts:[{user_id:'abc123',profile:{username:'ugc.demo',full_name:'UGC Demo',followers:42000,engagement_percent:3.4}}]};
  const rows=mapInfluencersClubResults(raw,{platform:'instagram'});
  assert.equal(rows.length,1);
  assert.equal(rows[0].handle,'ugc.demo');
  assert.equal(rows[0].provider_name,'influencers_club');
  assert.equal(rows[0].views,'');
  assert.equal(rows[0].contact_email,'');
  assert(rows[0].evidence_source.includes('operator must verify'));
  let seen=null;
  const fetchImpl=async(url,options)=>{seen={url,options};return {ok:true,json:async()=>raw};};
  const found=await discoverWithInfluencersClub({brief,platform:'instagram',limit:8,apiKey:'test-secret',fetchImpl});
  assert.equal(found.total,1);
  assert.equal(found.credits_left,'9.75');
  assert.equal(seen.url,req.url);
  assert.equal(seen.options.headers.Authorization,'Bearer test-secret');
  assert(!seen.options.body.includes('test-secret'));
});

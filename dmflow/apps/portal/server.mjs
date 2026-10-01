import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {parseCSV,normalizeCandidate,evaluate,draftOutreach,exportCSV,sampleCandidates,STATUSES} from '../../packages/scout/src/engine.mjs';
import {providerStatus,discoverCreators} from '../../packages/scout/src/providers.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DMFLOW_DATA_DIR || path.resolve(here,'../../work');
const dataFile=path.join(dataDir,'scout-local.json');
function freshPilot(){return {started_at:null,ended_at:null,baseline_minutes:null,target:10,target_reached_at:null,note:''};}
function fresh(){return {version:1,brief:{title:'',keywords:'',format:'',country:'',deliverable:''},candidates:[],campaignTemplate:{name:'',message:'',creator_count:0},pilot:freshPilot(),mode:'local'};}
function load(){try{let s=JSON.parse(fs.readFileSync(dataFile,'utf8'));if(s.version===1&&Array.isArray(s.candidates)){s.pilot={...freshPilot(),...(s.pilot||{})};return s;}}catch{}return fresh();}
let state=load();
function persist(){fs.mkdirSync(dataDir,{recursive:true,mode:0o700});let t=dataFile+'.tmp';fs.writeFileSync(t,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(t,dataFile);}
async function localAIDraft(p){
  const c=getCandidate(p.id);
  if(!c.verified)throw Error('Human-check candidate evidence before generating personalized AI outreach.');
  const endpoint=process.env.SCOUT_OLLAMA_URL || '';
  if(!endpoint)throw Error('Local AI unavailable. Set SCOUT_OLLAMA_URL to your own loopback Ollama /api/generate endpoint.');
  let u;try{u=new URL(endpoint);}catch{throw Error('Invalid local model endpoint');}
  if(u.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('Local model must run on loopback HTTP.');
  const payload={model:process.env.SCOUT_OLLAMA_MODEL||'llama3.2',stream:false,prompt:`Draft a concise, warm, human-reviewed FIRST-CONTACT UGC campaign email. Output only email with Subject line.
Campaign: ${JSON.stringify(state.brief)}
Human-checked user-imported creator facts: ${JSON.stringify({name:c.name,handle:c.handle,platform:c.platform,niche:c.niche,formats:c.formats,caption:c.caption,content_url:c.content_url})}
Constraints: only refer to explicitly checked creator facts, NEVER invent performance, views, brand partnerships, geography or payment; no urgency or promises. Invite them to review campaign compensation and terms, ask permission before proceeding.`};
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),20000);let resp;
  try{resp=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:ctrl.signal});}
  finally{clearTimeout(timeout);}
  if(!resp.ok)throw Error('Local AI model request failed.');
  let output=await resp.json();if(typeof output.response!=='string'||!output.response.trim())throw Error('Local AI returned no draft.');
  c.draft=output.response.trim().slice(0,6000);c.status='drafted';c.approved_at=null;persist();return {source:'local_ai_unverified_output'};
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
function pilotSummary(){
  const p={...freshPilot(),...(state.pilot||{})};
  const shortlisted=state.candidates.filter(c=>c.shortlisted_at).length;
  const end=p.ended_at||new Date().toISOString();
  const elapsed=p.started_at?Math.max(0,(Date.parse(end)-Date.parse(p.started_at))/60000):null;
  const timeToTarget=p.started_at&&p.target_reached_at?Math.max(0,(Date.parse(p.target_reached_at)-Date.parse(p.started_at))/60000):null;
  return {...p,shortlisted_count:shortlisted,elapsed_minutes:elapsed,time_to_target_minutes:timeToTarget};
}
function updatePilotTarget(){
  state.pilot={...freshPilot(),...(state.pilot||{})};
  if(!state.pilot.started_at||state.pilot.target_reached_at)return;
  const shortlisted=state.candidates.filter(c=>c.shortlisted_at).length;
  if(shortlisted>=state.pilot.target)state.pilot.target_reached_at=new Date().toISOString();
}
function publicState(){return {...state,pilot:pilotSummary(),providers:providerStatus(),candidates:state.candidates.map(c=>({...c,evaluation:evaluate(c,state.brief)}))};}
function getCandidate(id){let c=state.candidates.find(x=>x.id===id);if(!c)throw Error('Unknown candidate');return c;}
async function receive(req){let chunks=[],count=0;for await(const x of req){count+=x.length;if(count>180000)throw Error('Request too large');chunks.push(x);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function apply(route,p){
  if(route==='/api/brief') {const fields=['title','keywords','format','country','deliverable'];state.brief=Object.fromEntries(fields.map(k=>[k,String(p[k]||'').slice(0,500)]));}
  else if(route==='/api/import'){let rows=parseCSV(p.csv||'');if(!rows.length)throw Error('CSV contains no candidates.');let added=0;for(let row of rows){const c=normalizeCandidate(row);if(!state.candidates.some(x=>x.handle===c.handle&&x.platform===c.platform)){state.candidates.push(c);added++;}}return {added};}
  else if(route==='/api/sample'){state=fresh();state.brief={title:'Clean skincare launch (fictional)',keywords:'skincare,routine',format:'tutorial',country:'us',deliverable:'two original short-form demonstrations'};state.candidates=sampleCandidates();}
  else if(route==='/api/verify'){let c=getCandidate(p.id);c.verified=!!p.verified;c.verified_at=c.verified?new Date().toISOString():null;if(!c.verified){c.approved_at=null;if(c.status==='approved')c.status='drafted';}}
  else if(route==='/api/shortlist'){let c=getCandidate(p.id);c.status='shortlisted';c.shortlisted_at=c.shortlisted_at||new Date().toISOString();updatePilotTarget();}
  else if(route==='/api/draft'){let c=getCandidate(p.id);c.draft=draftOutreach(c,state.brief);c.status='drafted';c.approved_at=null;}
  else if(route==='/api/edit-draft'){let c=getCandidate(p.id);c.draft=String(p.draft||'').slice(0,6000);c.approved_at=null;c.status='drafted';}
  else if(route==='/api/approve'){let c=getCandidate(p.id);if(!c.verified||!c.draft)throw Error('Verify evidence and prepare a draft before approval.');c.status='approved';c.approved_at=new Date().toISOString();}
  else if(route==='/api/status'){let c=getCandidate(p.id);if(!STATUSES.includes(p.status))throw Error('Invalid status');if(p.status==='contacted'&&(!c.approved_at||!c.contact_email))throw Error('Human approval and permitted email are required; use your own email client.');c.status=p.status;c.response_note=String(p.response_note||'').slice(0,1000);}
  else if(route==='/api/campaign-template'){state.campaignTemplate={name:String(p.name||'').slice(0,200),message:String(p.message||'').slice(0,1000),creator_count:Number(p.creator_count)||0};}
  else if(route==='/api/pilot-start'){
    const baseline=Number(p.baseline_minutes);
    state.pilot={...freshPilot(),started_at:new Date().toISOString(),baseline_minutes:Number.isFinite(baseline)&&baseline>=0?baseline:null,note:String(p.note||'').slice(0,1000)};
    for(const c of state.candidates)c.shortlisted_at=null;
  }
  else if(route==='/api/pilot-end'){
    state.pilot={...freshPilot(),...(state.pilot||{})};
    if(!state.pilot.started_at)throw Error('Start a pilot session first.');
    state.pilot.ended_at=new Date().toISOString();
  }
  else if(route==='/api/pilot-reset'){state.pilot=freshPilot();}
  else if(route==='/api/reset'){state=fresh();}
  else throw Error('Unknown endpoint');persist();return {};
}
export function createPortalServer(){return http.createServer(async(req,res)=>{
 const origin='http://127.0.0.1:'+req.socket.localPort;
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'");
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 try {const u=new URL(req.url,origin);const pathname=u.pathname;
  if(req.method==='GET'&&pathname==='/health')return json(res,200,{ok:true,mode:'local',liveMessaging:false});
  if(req.method==='GET'&&pathname==='/api/state')return json(res,200,publicState());
  if(req.method==='GET'&&pathname==='/api/export'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="dmflow-scout-export.csv"','Cache-Control':'no-store'});return res.end(exportCSV(state));}
  if(req.method==='GET'&&pathname==='/api/pilot-export'){const summary={exported_at:new Date().toISOString(),brief:state.brief,pilot:pilotSummary(),candidate_count:state.candidates.length,verified_count:state.candidates.filter(c=>c.verified).length,approved_count:state.candidates.filter(c=>c.approved_at).length};res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="dmflow-pilot-summary.json"','Cache-Control':'no-store'});return res.end(JSON.stringify(summary,null,2));}
  if(req.method==='POST'&&pathname.startsWith('/api/')){
    if(req.headers.origin!==origin || !String(req.headers['content-type']||'').startsWith('application/json'))return json(res,403,{error:'Same-origin JSON requests only.'});
    const p=await receive(req);
    if(pathname==='/api/ai-draft'){const extra=await localAIDraft(p);return json(res,200,{...extra,...publicState()});}
    if(pathname==='/api/discover'){
      const found=await discoverCreators({provider:String(p.provider||'influencers_club'),brief:state.brief,platform:p.platform,limit:p.limit});let added=0;
      for(const row of found.candidates){const c=normalizeCandidate(row);Object.assign(c,{source_kind:'licensed_provider_unverified',provider_name:row.provider_name,provider_ref:row.provider_ref,provider_similarity:row.provider_similarity,followers:row.followers,engagement_rate:row.engagement_rate});if(!state.candidates.some(x=>x.handle===c.handle&&x.platform===c.platform)){state.candidates.push(c);added++;}}
      persist();return json(res,200,{provider:found.provider,provider_total:found.total,credits_left:found.credits_left??null,applied_filters:found.applied_filters??null,added,...publicState()});
    }
    const extra=apply(pathname,p);return json(res,200,{...extra,...publicState()});
  }
  const files={'/':'index.html','/index.html':'index.html','/app':'index.html','/creator':'index.html','/campaigns':'index.html','/scout':'index.html','/assets/main.css':'main.css','/assets/main.js':'main.js'};
  const f=files[pathname];if(req.method!=='GET'||!f){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(path.join(here,f)));
 }catch(e){json(res,400,{error:e instanceof Error?e.message:'Invalid request'});}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||4173);createPortalServer().listen(port,'127.0.0.1',()=>console.log(`DMFlow portal: http://127.0.0.1:${port}`));}

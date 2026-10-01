/** DMFlow Scout. Local-first, source-aware recruiter workflow; no scraping or unsolicited messaging. */
import { randomUUID } from 'node:crypto';
export const STATUSES = ['imported','shortlisted','drafted','approved','contacted','replied','negotiating','recruited','declined'];
const trim = value => String(value ?? '').trim().slice(0,1200);
const daysAgo = date => date ? (Date.now() - new Date(date).getTime()) / 86400000 : null;
export function parseCSV(input) {
  if (typeof input !== 'string' || input.length > 150000) throw Error('CSV exceeds 150 KB.');
  const rows=[]; let row=[],value='',quoted=false;
  for(let i=0;i<input.length;i++) { const c=input[i];
    if(c==='"') {if(quoted&&input[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(value);value='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
    else value+=c;
  }
  if(quoted)throw Error('Unclosed CSV quote.');row.push(value);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length<2)return []; if(rows.length>1001)throw Error('Maximum 1000 candidates per import.');
  const headers=rows.shift().map(x=>x.trim().toLowerCase());
  if(!headers.includes('handle') || !headers.includes('platform'))throw Error('CSV requires handle and platform headers.');
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function validHttps(s){try{let u=new URL(s);return u.protocol==='https:'&& !!u.hostname;}catch{return false;}}
export function normalizeCandidate(raw) {
  const c={
    id:randomUUID(),name:trim(raw.name),handle:trim(raw.handle).replace(/^@/,''),platform:trim(raw.platform).toLowerCase(),
    niche:trim(raw.niche),formats:trim(raw.formats).toLowerCase(),country:trim(raw.country).toLowerCase(),
    content_url:trim(raw.content_url),caption:trim(raw.caption),views:raw.views===''||raw.views==null?null:Number(raw.views),
    baseline_views:raw.baseline_views===''||raw.baseline_views==null?null:Number(raw.baseline_views),
    posted_at:trim(raw.posted_at),contact_email:trim(raw.contact_email),evidence_source:trim(raw.evidence_source),
    notes:trim(raw.notes),verified:false,verified_at:null,status:'imported',draft:'',approved_at:null,
    imported_at:new Date().toISOString(),source_kind:'user_import',response_note:''
  };
  if(!/^[\w.\-]{2,80}$/.test(c.handle))throw Error('Invalid creator handle.');
  if(!['instagram','tiktok','youtube'].includes(c.platform))throw Error('Platform must be instagram, tiktok or youtube.');
  if(c.content_url && !validHttps(c.content_url))throw Error('Content URL must be HTTPS.');
  if(c.posted_at && (!/^\d{4}-\d\d-\d\d$/.test(c.posted_at)||!Number.isFinite(Date.parse(c.posted_at))))throw Error('Invalid post date.');
  for (const n of ['views','baseline_views'])if(c[n]!==null&&(!Number.isFinite(c[n])||c[n]<0))throw Error('Invalid '+n+'.');
  if(c.contact_email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact_email)||c.contact_email.length>254))throw Error('Invalid email.');
  return c;
}
export function evaluate(c,brief) {
  const tags=String(brief.keywords||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  const haystack=`${c.niche} ${c.caption} ${c.notes}`.toLowerCase();
  const hit=tags.filter(t=>haystack.includes(t));
  const reasons=[],limitations=[]; let score=0,max=0;
  if(tags.length){max+=40;score+=40*hit.length/tags.length;reasons.push(`${hit.length}/${tags.length} requested topics evidenced in imported text${hit.length?': '+hit.join(', '):''}`);}
  else limitations.push('No campaign topics defined');
  if(brief.format){max+=20;if(c.formats){if(c.formats.includes(String(brief.format).toLowerCase())){score+=20;reasons.push('Imported format matches brief');}else reasons.push('Imported format does not match');}else limitations.push('No format evidence');}
  if(brief.country){max+=10;if(c.country){if(c.country===String(brief.country).toLowerCase()){score+=10;reasons.push('Imported country matches');}else reasons.push('Imported country does not match');}else limitations.push('No geography evidence');}
  const age=daysAgo(c.posted_at);let viralRatio=null;
  if(c.views!=null&&c.baseline_views>0&&age!==null&&age>=0&&age<=30){max+=30;viralRatio=c.views/c.baseline_views;score+=Math.min(30,Math.round(10*Math.min(viralRatio,3)));reasons.push(`Imported post has ${viralRatio.toFixed(1)}× imported baseline (${Math.round(age)} days old)`);}
  else limitations.push('Recent breakout cannot be established: needs post date (past 30d), views and credible baseline');
  if(!c.verified)limitations.push('Evidence not checked by an operator');
  return {score:Math.round(score),max_possible:max,reasons,limitations,viral_ratio:viralRatio,evidence_label:c.verified?'Human-checked import (not provider-verified)':'Unverified user import'};
}
export function draftOutreach(c,brief) {
  const campaign=trim(brief.title)||'our upcoming creator campaign';
  const angle=c.verified&&c.caption&&c.content_url ? `I watched your post (${c.content_url}) about ${c.caption.slice(0,100)}.` :
    `I came across your ${c.platform} content${c.niche?' about '+c.niche:''}.`;
  const deliverable=trim(brief.deliverable)||'short-form UGC content';
  return `Subject: Potential creator collaboration — ${campaign}\n\nHey ${c.name||c.handle},\n\n${angle} We are casting ${deliverable} for ${campaign} and thought your work might be relevant.\n\nWould you be open to receiving the brief, timeline and proposed compensation to see if there is a fit? No pressure if not.\n\nBest,\n[Your name]`;
}
export function exportCSV(state) {
  const fields=['name','handle','platform','niche','content_url','caption','views','baseline_views','posted_at','contact_email','evidence_source','source_kind','provider_name','provider_ref','provider_similarity','followers','engagement_rate','verified','shortlisted_at','status','draft','response_note'];
  const clean=value=>{let s=String(value??''); if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [fields.join(','),...state.candidates.map(c=>fields.map(f=>clean(c[f])).join(','))].join('\r\n');
}
export function sampleCandidates(){const names=[
  ['Avery Stone','avery.sample','skincare','tutorial,voiceover','us','My simple skincare evening routine',132000,26000,8],
  ['Blair Chen','blair.sample','fitness','talking head','us','Building a 15-minute morning mobility routine',90500,18000,12],
  ['Cam Rivera','cam.sample','skincare,wellness','tutorial,demo','us','Three steps for a low-waste skincare routine',78000,24000,14],
  ['Devin Park','devin.sample','gaming','stream','ca','My recent gaming setup tour',22000,27000,45]
]; return names.map(([name,handle,niche,formats,country,caption,views,baseline_views,age])=>{let d=new Date(Date.now()-age*86400000).toISOString().slice(0,10);let c=normalizeCandidate({name,handle,platform:'instagram',niche,formats,country,caption,views,baseline_views,posted_at:d,content_url:'',evidence_source:'FICTIONAL_DEMO_ONLY'});c.source_kind='fictional_demo';return c;});}

/** Optional licensed discovery-provider adapters for DMFlow Scout.
 * No adapter is enabled without an operator-supplied server-side credential.
 * Provider licensing, retention, and redistribution terms must be reviewed before production use.
 */
const SUPPORTED = new Set(['instagram','tiktok','youtube']);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const text=v=>String(v??'').trim();

export function providerStatus(env=process.env){
  return {
    manual_import:{configured:true,label:'CSV / operator research',cost_hint:'$0 software cost',status:'ready'},
    modash:{configured:!!env.SCOUT_MODASH_API_KEY,label:'Modash Discovery API',cost_hint:'contract required',status:env.SCOUT_MODASH_API_KEY?'configured':'credential required'},
    tiktok_one:{configured:false,label:'TikTok One Creator Marketplace API',cost_hint:'official TikTok access',status:'access/application required'}
  };
}

export function buildDiscoveryQuery(brief={}){
  const bits=[text(brief.deliverable),text(brief.format)&&`${text(brief.format)} short-form creator`,text(brief.keywords)&&`topics: ${text(brief.keywords)}`].filter(Boolean);
  return (bits.length?bits.join('. '):'UGC creator producing product demonstration short-form videos').slice(0,1200);
}

export function buildModashRequest({brief={},platform='instagram',limit=6}={}){
  platform=text(platform).toLowerCase();
  if(!SUPPORTED.has(platform))throw Error('Discovery platform must be instagram, tiktok or youtube.');
  limit=clamp(Number(limit)||6,1,20);
  const filters={lastPostedInDays:30,accountType:'creator',contentType:'video'};
  // Location IDs differ by provider; do not guess them from a country code.
  return {
    url:`https://api.modash.io/v1/ai/${platform}/text-search`,
    body:{page:0,pageSize:limit,filters,query:buildDiscoveryQuery(brief),autoQueryOptimization:{autoDetectFilters:true}}
  };
}

function n(v){const x=Number(v);return Number.isFinite(x)&&x>=0?x:null;}
export function mapModashResults(raw,{platform='instagram'}={}){
  const rows=Array.isArray(raw?.profiles)?raw.profiles:Array.isArray(raw?.results)?raw.results:[];
  return rows.flatMap(item=>{
    const p=item?.profile||item||{};const handle=text(p.username||p.handle).replace(/^@/,'');if(!handle)return [];
    const post=Array.isArray(item?.matchingPosts)?item.matchingPosts[0]||{}:{};
    const sim=n(post.score??item.similarity);
    const followers=n(p.followers);const engagementRate=n(p.engagementRate);
    const note=[sim!=null?`Provider semantic-match score ${sim}`:'',followers!=null?`Provider follower count ${followers}`:'',engagementRate!=null?`Provider engagement rate ${engagementRate}`:''].filter(Boolean).join('; ');
    return [{
      name:text(p.fullname||p.fullName||p.name),handle,platform,
      niche:'',formats:'',country:'',content_url:text(post.url||p.url),caption:'',views:'',baseline_views:'',posted_at:'',contact_email:'',
      evidence_source:'Modash AI Search result — operator must verify source content',notes:note,
      provider_name:'modash',provider_ref:text(item.userId||p.userId||handle),provider_similarity:sim,followers,engagement_rate:engagementRate
    }];
  });
}

export async function discoverWithModash({brief={},platform='instagram',limit=6,apiKey=process.env.SCOUT_MODASH_API_KEY,fetchImpl=fetch}={}){
  if(!text(apiKey))throw Error('Modash discovery is not configured. Set SCOUT_MODASH_API_KEY server-side after licensing approval.');
  const req=buildModashRequest({brief,platform,limit});
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);let resp;
  try{resp=await fetchImpl(req.url,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(req.body),signal:ctrl.signal});}
  finally{clearTimeout(timer);}
  if(!resp.ok)throw Error(`Modash discovery request failed (${resp.status}).`);
  const raw=await resp.json();if(raw?.error)throw Error('Modash returned an error response.');
  return {provider:'modash',total:Number(raw?.total)||0,candidates:mapModashResults(raw,{platform})};
}

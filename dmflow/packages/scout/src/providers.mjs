/** Optional licensed discovery-provider adapters for DMFlow Scout.
 * No adapter is enabled without an operator-supplied server-side credential.
 * Provider licensing, retention, and redistribution terms must be reviewed before production use.
 */
const SUPPORTED = new Set(['instagram','tiktok','youtube']);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const text=v=>String(v??'').trim();
const n=v=>{const x=Number(v);return Number.isFinite(x)&&x>=0?x:null;};

export function providerStatus(env=process.env){
  return {
    manual_import:{
      configured:true,
      label:'CSV / operator research',
      cost_hint:'$0 software cost',
      status:'ready'
    },
    influencers_club:{
      configured:!!env.SCOUT_INFLUENCERS_CLUB_API_KEY,
      label:'Influencers Club Discovery API',
      cost_hint:'API Pro from $208/mo; trial includes 30 successful API requests',
      status:env.SCOUT_INFLUENCERS_CLUB_API_KEY?'configured':'trial/API key required'
    },
    modash:{
      configured:!!env.SCOUT_MODASH_API_KEY,
      label:'Modash Discovery API',
      cost_hint:'Discovery API starts at $16,200/year',
      status:env.SCOUT_MODASH_API_KEY?'configured':'enterprise credential required'
    },
    creator_db:{
      configured:false,
      label:'CreatorDB API',
      cost_hint:'pay-as-you-go from $40; plans from $79/mo',
      status:'candidate provider — adapter not enabled yet'
    },
    tiktok_one:{
      configured:false,
      label:'TikTok One Creator Marketplace API',
      cost_hint:'official TikTok access',
      status:'access/application required'
    }
  };
}

export function buildDiscoveryQuery(brief={}){
  const bits=[
    text(brief.deliverable),
    text(brief.format)&&`${text(brief.format)} short-form creator`,
    text(brief.keywords)&&`topics: ${text(brief.keywords)}`,
    text(brief.country)&&`preferred creator market: ${text(brief.country)}`
  ].filter(Boolean);
  return (bits.length?bits.join('. '):'UGC creator producing product demonstration short-form videos').slice(0,1200);
}

export function buildInfluencersClubRequest({brief={},platform='instagram',limit=8}={}){
  platform=text(platform).toLowerCase();
  if(!SUPPORTED.has(platform))throw Error('Discovery platform must be instagram, tiktok or youtube.');
  limit=clamp(Number(limit)||8,1,20);
  return {
    url:'https://api-dashboard.influencers.club/public/v1/discovery/',
    body:{
      platform,
      nlp_search:buildDiscoveryQuery(brief),
      filters:{},
      sort:{sort_by:'relevancy',sort_order:'desc'},
      paging:{limit,page:0}
    }
  };
}

export function mapInfluencersClubResults(raw,{platform='instagram'}={}){
  const rows=Array.isArray(raw?.accounts)?raw.accounts:[];
  return rows.flatMap(item=>{
    const p=item?.profile||item||{};
    const handle=text(p.username||p.handle||item?.username||item?.handle).replace(/^@/,'');
    if(!handle)return [];
    const followers=n(
      p.number_of_followers??p.followers??p.followers_count??
      item?.number_of_followers??item?.followers??item?.followers_count
    );
    const engagementRate=n(
      p.engagement_percent??p.engagementRate??p.engagement_rate??
      item?.engagement_percent??item?.engagementRate??item?.engagement_rate
    );
    const matched=item?.matched_filters&&typeof item.matched_filters==='object'
      ? JSON.stringify(item.matched_filters).slice(0,900)
      : '';
    const note=[
      followers!=null?`Provider follower count ${followers}`:'',
      engagementRate!=null?`Provider engagement signal ${engagementRate}`:'',
      matched?`Matched filters ${matched}`:''
    ].filter(Boolean).join('; ');
    const providerRef=text(item?.user_id||item?.id||p?.id||handle);
    return [{
      name:text(p.full_name||p.fullName||p.name),
      handle,
      platform,
      niche:'',
      formats:'',
      country:text(p.country||item?.country).toLowerCase(),
      content_url:'',
      caption:'',
      views:'',
      baseline_views:'',
      posted_at:'',
      contact_email:'',
      evidence_source:'Influencers Club Discovery result — operator must verify source content before personalized outreach',
      notes:note,
      provider_name:'influencers_club',
      provider_ref:providerRef,
      provider_similarity:null,
      followers,
      engagement_rate:engagementRate
    }];
  });
}

export async function discoverWithInfluencersClub({
  brief={},
  platform='instagram',
  limit=8,
  apiKey=process.env.SCOUT_INFLUENCERS_CLUB_API_KEY,
  fetchImpl=fetch
}={}){
  if(!text(apiKey))throw Error('Influencers Club discovery is not configured. Set SCOUT_INFLUENCERS_CLUB_API_KEY server-side after creating an approved trial/API key.');
  const req=buildInfluencersClubRequest({brief,platform,limit});
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),15000);
  let resp;
  try{
    resp=await fetchImpl(req.url,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(req.body),
      signal:ctrl.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if(!resp.ok)throw Error(`Influencers Club discovery request failed (${resp.status}).`);
  const raw=await resp.json();
  if(raw?.error||raw?.error_code)throw Error('Influencers Club returned an error response.');
  return {
    provider:'influencers_club',
    total:Number(raw?.total)||0,
    credits_left:raw?.credits_left??null,
    applied_filters:raw?.applied_filters??null,
    candidates:mapInfluencersClubResults(raw,{platform})
  };
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

export function mapModashResults(raw,{platform='instagram'}={}){
  const rows=Array.isArray(raw?.profiles)?raw.profiles:Array.isArray(raw?.results)?raw.results:[];
  return rows.flatMap(item=>{
    const p=item?.profile||item||{};
    const handle=text(p.username||p.handle).replace(/^@/,'');
    if(!handle)return [];
    const post=Array.isArray(item?.matchingPosts)?item.matchingPosts[0]||{}:{};
    const sim=n(post.score??item.similarity);
    const followers=n(p.followers);
    const engagementRate=n(p.engagementRate);
    const note=[
      sim!=null?`Provider semantic-match score ${sim}`:'',
      followers!=null?`Provider follower count ${followers}`:'',
      engagementRate!=null?`Provider engagement rate ${engagementRate}`:''
    ].filter(Boolean).join('; ');
    return [{
      name:text(p.fullname||p.fullName||p.name),
      handle,
      platform,
      niche:'',
      formats:'',
      country:'',
      content_url:text(post.url||p.url),
      caption:'',
      views:'',
      baseline_views:'',
      posted_at:'',
      contact_email:'',
      evidence_source:'Modash AI Search result — operator must verify source content',
      notes:note,
      provider_name:'modash',
      provider_ref:text(item.userId||p.userId||handle),
      provider_similarity:sim,
      followers,
      engagement_rate:engagementRate
    }];
  });
}

export async function discoverWithModash({
  brief={},
  platform='instagram',
  limit=6,
  apiKey=process.env.SCOUT_MODASH_API_KEY,
  fetchImpl=fetch
}={}){
  if(!text(apiKey))throw Error('Modash discovery is not configured. Set SCOUT_MODASH_API_KEY server-side after licensing approval.');
  const req=buildModashRequest({brief,platform,limit});
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),15000);
  let resp;
  try{
    resp=await fetchImpl(req.url,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(req.body),
      signal:ctrl.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if(!resp.ok)throw Error(`Modash discovery request failed (${resp.status}).`);
  const raw=await resp.json();
  if(raw?.error)throw Error('Modash returned an error response.');
  return {provider:'modash',total:Number(raw?.total)||0,candidates:mapModashResults(raw,{platform})};
}

export async function discoverCreators({provider='influencers_club',brief={},platform='instagram',limit=8,fetchImpl=fetch}={}){
  if(provider==='influencers_club')return discoverWithInfluencersClub({brief,platform,limit,fetchImpl});
  if(provider==='modash')return discoverWithModash({brief,platform,limit,fetchImpl});
  throw Error('Unsupported live discovery provider.');
}

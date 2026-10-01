import test from 'node:test';import assert from 'node:assert/strict';
import {providerStatus,buildDiscoveryQuery,buildModashRequest,mapModashResults,discoverWithModash} from '../packages/scout/src/providers.mjs';

test('provider status is explicit and no paid provider is silently enabled',()=>{
 const s=providerStatus({});assert.equal(s.manual_import.configured,true);assert.equal(s.modash.configured,false);assert.equal(s.tiktok_one.configured,false);
});

test('Modash request uses official AI search endpoint without inventing location IDs',()=>{
 const r=buildModashRequest({brief:{keywords:'skincare,routine',format:'tutorial',country:'us',deliverable:'two UGC demos'},platform:'instagram',limit:7});
 assert.equal(r.url,'https://api.modash.io/v1/ai/instagram/text-search');assert.equal(r.body.pageSize,7);assert.equal(r.body.filters.lastPostedInDays,30);assert.equal('locations' in r.body.filters,false);assert.match(r.body.query,/skincare/);
 assert.match(buildDiscoveryQuery({}),/UGC creator/);
});

test('Modash response mapping preserves provider evidence without inventing post performance',()=>{
 const rows=mapModashResults({total:1,results:[{userId:'42',profile:{username:'maya.demo',fullname:'Maya Demo',url:'https://instagram.com/maya.demo',followers:42000,engagementRate:.061},matchingPosts:[{url:'https://instagram.com/p/demo',score:.91}]}]},{platform:'instagram'});
 assert.equal(rows.length,1);assert.equal(rows[0].handle,'maya.demo');assert.equal(rows[0].provider_similarity,.91);assert.equal(rows[0].followers,42000);assert.equal(rows[0].views,'');assert.match(rows[0].evidence_source,/operator must verify/);
});

test('Modash adapter is credential gated and mockable',async()=>{
 await assert.rejects(()=>discoverWithModash({brief:{},apiKey:''}),/not configured/);
 let seen=null;const fetchImpl=async(url,opts)=>{seen={url,opts};return {ok:true,status:200,json:async()=>({error:false,total:1,results:[{userId:'7',profile:{username:'ugc.demo',fullname:'UGC Demo',followers:12000},matchingPosts:[]} ]})};};
 const r=await discoverWithModash({brief:{keywords:'beauty'},platform:'tiktok',limit:2,apiKey:'test-only',fetchImpl});
 assert.equal(r.candidates[0].handle,'ugc.demo');assert.match(seen.url,/tiktok\/text-search/);assert.match(seen.opts.headers.Authorization,/Bearer test-only/);assert(!seen.opts.body.includes('test-only'));
});

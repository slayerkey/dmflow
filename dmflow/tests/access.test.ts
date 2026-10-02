import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {verifyAccessJwt} from "../workers/api/src/access";
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const jwk=publicKey.export({format:"jwk"}) as JsonWebKey & {kid?:string};
jwk.kid="test-key";
const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString("base64url");
const team="https://example.cloudflareaccess.com";
const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:"test-audience"};
function make(payload:Record<string,unknown>,header:Record<string,unknown>={alg:"RS256",kid:"test-key"}){
 const input=enc(header)+"."+enc(payload);
 return input+"."+sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url");
}
const base={iss:team,aud:["test-audience"],exp:Math.floor(Date.now()/1000)+120,nbf:Math.floor(Date.now()/1000)-10,email:"Tester@Example.com"};
const fetcher:typeof fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
test("valid signed Cloudflare Access JWT normalizes invited email",async()=>{
 const r=new Request("https://dmflow.example/app",{headers:{"Cf-Access-Jwt-Assertion":make(base)}});
 assert.equal(await verifyAccessJwt(r,env,fetcher),"tester@example.com");
});
test("reject expired, wrong audience, wrong issuer and missing identity",async()=>{
 for(const p of [{...base,exp:1},{...base,aud:["other"]},{...base,iss:"https://evil.example"},{...base,email:"not-an-email"}]){
  const r=new Request("https://dmflow.example/app",{headers:{"Cf-Access-Jwt-Assertion":make(p)}});
  assert.equal(await verifyAccessJwt(r,env,fetcher),null);
 }
});
test("reject forged headers and tampered payloads",async()=>{
 const token=make(base),parts=token.split(".");
 const fake=parts[0]+"."+enc({...base,email:"other@example.com"})+"."+parts[2];
 for(const t of [fake,make(base,{alg:"none",kid:"test-key"}),"invalid"]){
  assert.equal(await verifyAccessJwt(new Request("https://dmflow.example/app",{headers:{"Cf-Access-Jwt-Assertion":t}}),env,fetcher),null);
 }
});
test("fail closed when Access verification not configured",async()=>{
 assert.equal(await verifyAccessJwt(new Request("https://dmflow.example/app",{headers:{"Cf-Access-Jwt-Assertion":make(base)}}),{},fetcher),null);
});

/** Verify Cloudflare Access application JWTs before binding a browser user to a workspace.
 * Never trust an asserted email or an unsigned JWT payload.
 */
type AccessEnv = { ACCESS_TEAM_DOMAIN?:string; ACCESS_AUD?:string };
type Claims = { iss?:string; aud?:string[]|string; exp?:number; nbf?:number; email?:string; sub?:string };
const decode=(v:string)=>{ const raw=atob(v.replace(/-/g,"+").replace(/_/g,"/")); return JSON.parse(raw) as Record<string,any>; };
const bytes=(v:string)=>Uint8Array.from(atob(v.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
export async function verifyAccessJwt(request:Request,env:AccessEnv,fetcher:typeof fetch=fetch):Promise<string|null>{
  const team=env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/$/,"");
  const aud=env.ACCESS_AUD?.trim();
  if(!team||!aud||!/^https:\/\/[\w.-]+\.cloudflareaccess\.com$/.test(team))return null;
  const token=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!token||token.length>12000)return null;
  const parts=token.split(".");
  if(parts.length!==3)return null;
  try{
    const header=decode(parts[0]),payload=decode(parts[1]) as Claims;
    if(header.alg!=="RS256"||typeof header.kid!=="string"||header.kid.length>200)return null;
    const now=Math.floor(Date.now()/1000);
    if(payload.iss!==team||!(Array.isArray(payload.aud)?payload.aud:[payload.aud]).includes(aud))return null;
    if(typeof payload.exp!=="number"||payload.exp<=now||typeof payload.nbf==="number"&&payload.nbf>now+30)return null;
    if(typeof payload.email!=="string"||payload.email.length>254)return null;
    const email=payload.email.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
    const res=await fetcher(team+"/cdn-cgi/access/certs",{signal:AbortSignal.timeout(4000)});
    if(!res.ok)return null;
    const {keys}=await res.json() as {keys?:JsonWebKey[]};
    const key=keys?.find((k:any)=>k.kid===header.kid&&k.kty==="RSA");
    if(!key)return null;
    const cryptoKey=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",cryptoKey,bytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
    return valid?email:null;
  }catch{return null;}
}

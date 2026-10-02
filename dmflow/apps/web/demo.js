const $=id=>document.getElementById(id);
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
function near(a,b){
 if(a===b)return true;
 if(a.length===b.length){
  const bad=[...a].map((v,i)=>v===b[i]?-1:i).filter(i=>i>=0);
  return bad.length===1||(bad.length===2&&bad[1]===bad[0]+1&&a[bad[0]]===b[bad[1]]&&a[bad[1]]===b[bad[0]]);
 }
 if(Math.abs(a.length-b.length)!==1)return false;
 const longer=a.length>b.length?a:b,shorter=a.length>b.length?b:a;
 let i=0,j=0,skips=0;while(i<longer.length&&j<shorter.length){
  if(longer[i]===shorter[j]){i++;j++;}else{i++;skips++;}
  if(skips>1)return false;
 }return true;
}
const events=[];
$("simulate").onclick=()=>{
 const keyword=normalize($("keyword").value),comment=$("comment").value;
 if(keyword.length<3){$("result").textContent="Use a keyword of at least 3 characters.";return;}
 let url;try{url=new URL($("resource").value)}catch{}
 if(!url||url.protocol!=="https:"){$("result").textContent="Use a valid HTTPS resource URL.";return;}
 const match=comment.split(/\s+/).map(normalize).some(word=>near(word,keyword));
 const result=match?"SIMULATED MATCH — preview only\n\n"+$("reply").value+"\n"+url.href:"NO MATCH — no preview reply";
 $("result").textContent=result;
 events.unshift((match?"matched":"ignored")+" · "+comment);
 $("history").textContent=events.slice(0,12).join("\n");
};

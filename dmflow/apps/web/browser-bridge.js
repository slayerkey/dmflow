/* Browser adapter for the existing Creator React UI.
 * Access owns email sign-in, the Worker checks Access JWT + D1 invitations.
 * No Meta credentials, bearer device tokens, or workspace IDs are stored here.
 */
window.DMFLOW_WEB=true;
window.dmflow={
  async request(path,method="GET",body){
    if(typeof path!=="string"||!path.startsWith("/api/")||path.includes(".."))throw Error("Invalid request");
    if(!["GET","POST","PUT"].includes(method))throw Error("Invalid method");
    const response=await fetch("/app"+path,{
      method,credentials:"same-origin",
      headers:{"Content-Type":"application/json"},
      ...(body!==undefined?{body:JSON.stringify(body)}:{})
    });
    if(!response.ok){
      let msg="Request failed";
      try{msg=(await response.json()).error||msg;}catch{if(response.status===401)msg="Email invitation or sign-in required";}
      throw Error(msg);
    }
    return response.json();
  },
  async open(url){
    const u=new URL(url);
    if(u.protocol!=="https:"&&!(u.protocol==="http:"&&u.hostname==="127.0.0.1"))throw Error("Unsupported link");
    if(u.hostname==="www.instagram.com"&&u.pathname.startsWith("/oauth/")){window.location.assign(u.href);return;}
    const popup=window.open(u.href,"_blank","noopener,noreferrer");
    if(!popup)window.location.assign(u.href);
  },
  async mode(next){
    if(next&&next!=="live")throw Error("Browser beta connects your live workspace only.");
    return {mode:"live",paired:true,url:window.location.origin};
  },
  async pair(){throw Error("Email sign-in replaces desktop pairing in the browser.");},
  async reset(){throw Error("Demo reset is unavailable in the hosted browser beta.");}
};

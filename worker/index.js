const SOURCE_URL = "https://vietinbankgold.vn/";
const FALLBACK_URL = "https://ndh.vn/gia-vang-vietinbank-gold/";
const CORS = {"access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"Content-Type, Authorization","cache-control":"no-store"};
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"content-type":"application/json; charset=utf-8"}});
const now = ()=>new Date().toISOString();
function cleanText(s){return String(s||"").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&#(\\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g," ").trim()}
function numberValue(s){if(typeof s==="number")return s;const t=String(s||"").replace(/[^\d]/g,"");return t?Number(t):null}
function normalizeProduct(item){
 const name=cleanText(item.name||item.productName||item.tenSanPham||item.title);
 const buy=numberValue(item.buy??item.buyPrice??item.purchasePrice??item.giaMua??item.gia_mua??item.muaVao);
 const sell=numberValue(item.sell??item.sellPrice??item.salePrice??item.giaBan??item.gia_ban??item.banRa);
 if(!name||!buy||!sell||buy<=0||sell<=0)return null;
 return {id:String(item.id||item.code||name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")),name,buy,sell,unit:cleanText(item.unit||item.donVi||"VNĐ"),change:Number(item.change||item.delta||0)};
}
function extractJson(html){
 const candidates=[];
 for(const re of [/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,/<script[^>]*>([\s\S]*?)<\/script>/gi]){
  let m;while((m=re.exec(html))!==null){const s=m[1].trim();if((s.startsWith("{")||s.startsWith("["))&&s.length<5000000){try{candidates.push(JSON.parse(s))}catch{}}}
 }
 const found=[];
 const walk=(v,depth=0)=>{if(!v||depth>9)return;if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}if(typeof v!=="object")return;const p=normalizeProduct(v);if(p)found.push(p);for(const x of Object.values(v))if(x&&typeof x==="object")walk(x,depth+1)};
 for(const c of candidates)walk(c);
 return [...new Map(found.map(p=>[p.id,p])).values()];
}
function extractTables(html){
 const out=[];const tables=html.match(/<table\b[\s\S]*?<\/table>/gi)||[];
 for(const table of tables){const rows=table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];for(const row of rows){const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>cleanText(m[1]));if(cells.length<3)continue;
  const nums=cells.map(numberValue).filter(n=>n!==null&&n>1000);if(nums.length<2)continue;
  const name=cells.find(x=>/[a-zA-ZÀ-ỹ]/.test(x)&&x.length>2);if(!name)continue;
  const p=normalizeProduct({name,buy:nums[0],sell:nums[1],unit:"VNĐ"});if(p)out.push(p);
 }}
 return [...new Map(out.map(p=>[p.id,p])).values()];
}
function firstPriceNumber(value){
 const match=String(value||"").replace(/&nbsp;|&#160;/gi," ").match(/[-+]?\d[\d.,]*/);
 if(!match)return null;
 const n=Number(match[0].replace(/[.,]/g,""));
 return Number.isFinite(n)?n:null;
}
function extractNdh(html){
 const start=html.search(/Bảng giá vàng VietinBank Gold/i);
 if(start<0)throw new Error("Không tìm thấy mục bảng giá VietinBank Gold trên NDH");
 const rest=html.slice(start);
 const stop=rest.search(/So với giá vàng thế giới/i);
 const section=stop>0?rest.slice(0,stop):rest;
 const tables=section.match(/<table\b[\s\S]*?<\/table>/gi)||[];
 const products=[];
 for(const table of tables){
  const rows=table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  for(const row of rows){
   const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>cleanText(m[1]));
   if(cells.length<3)continue;
   const name=cells[0];
   const buyK=firstPriceNumber(cells[1]),sellK=firstPriceNumber(cells[2]);
   if(!name||buyK===null||sellK===null||buyK<=0||sellK<=0||buyK>sellK)continue;
   products.push({id:"vietinbank-"+name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),name,buy:buyK*1000,sell:sellK*1000,unit:"VND/lượng",change:0});
  }
 }
 const unique=[...new Map(products.map(p=>[p.id,p])).values()];
 if(!unique.length)throw new Error("NDH không trả về sản phẩm giá mua/bán hợp lệ");
 const stamp=html.match(/Cập nhật lúc\s*(\d{1,2}:\d{2})\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
 const sourceUpdatedAt=stamp?stamp[4]+"-"+stamp[3].padStart(2,"0")+"-"+stamp[2].padStart(2,"0")+"T"+stamp[1]+":00+07:00":null;
 return {products:unique,sourceUpdatedAt};
}
async function readSource(url,sourceName){
 const response=await fetch(url,{headers:{"user-agent":"VBTracker/1.0 (price monitoring; contact: public website)","accept":"application/json,text/html;q=0.9,*/*;q=0.8"},cf:{cacheTtl:0,cacheEverything:false}});
 if(!response.ok)throw new Error(sourceName+" trả HTTP "+response.status);
 const type=response.headers.get("content-type")||"",body=await response.text();
 let products=[];
 if(type.includes("json")){
  let data;try{data=JSON.parse(body)}catch{throw new Error(sourceName+" trả JSON không hợp lệ")}
  const collect=v=>{if(!v)return;if(Array.isArray(v))v.forEach(collect);else if(typeof v==="object"){const p=normalizeProduct(v);if(p)products.push(p);Object.values(v).forEach(x=>{if(x&&typeof x==="object")collect(x)})}};
  collect(data);
 }else{
  products=extractJson(body);
  if(!products.length)products=extractTables(body);
 }
 products=[...new Map(products.map(p=>[p.id,p])).values()];
 if(!products.length)throw new Error(sourceName+" không tìm thấy bảng giá có cấu trúc");
 return {products,source:sourceName,sourceUrl:url,sourceUpdatedAt:response.headers.get("last-modified")||null,fallback:false};
}
async function fetchSource(env){
 const primaryUrl=env.SOURCE_API_URL||SOURCE_URL;
 let primaryError;
 try{return await readSource(primaryUrl,"VietinBank Gold")}
 catch(e){primaryError=String(e?.message||e);console.warn("Primary source failed:",primaryError)}
 try{
  const response=await fetch(FALLBACK_URL,{headers:{"user-agent":"VBTracker/1.0 (price monitoring)","accept":"text/html"},cf:{cacheTtl:0,cacheEverything:false}});
  if(!response.ok)throw new Error("NDH trả HTTP "+response.status);
  const parsed=extractNdh(await response.text());
  return {...parsed,source:"NDH",sourceUrl:FALLBACK_URL,fallback:true,primaryError};
 }catch(e){throw new Error("Nguồn VietinBank lỗi ("+primaryError+"); nguồn dự phòng NDH lỗi ("+String(e?.message||e)+")")}
}
async function ensureSchema(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS price_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, product_name TEXT NOT NULL, buy REAL NOT NULL, sell REAL NOT NULL, unit TEXT, captured_at TEXT NOT NULL, UNIQUE(product_id,captured_at))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_snapshots_product_time ON price_snapshots(product_id,captured_at DESC)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS tracker_state (key TEXT PRIMARY KEY,value TEXT NOT NULL)").run();
 const columns=await db.prepare("PRAGMA table_info(price_snapshots)").all();
 if(!(columns.results||[]).some(column=>column.name==="source"))await db.prepare("ALTER TABLE price_snapshots ADD COLUMN source TEXT").run();
}
async function recordPrices(env,payload){
 await ensureSchema(env.DB);const stamp=now();
 const source=payload.source||"unknown";
 const products=[];
 for(const item of payload.products){
  const p={...item};
  const prev=await env.DB.prepare("SELECT buy,sell,source FROM price_snapshots WHERE product_id=? ORDER BY captured_at DESC LIMIT 1").bind(p.id).first();
  const comparable=prev&&prev.source===source;
  p.buyChange=comparable?p.buy-Number(prev.buy):null;
  p.sellChange=comparable?p.sell-Number(prev.sell):null;
  p.change=p.buyChange;
  if(!prev||Number(prev.buy)!==p.buy||Number(prev.sell)!==p.sell||prev.source!==source){
   await env.DB.prepare("INSERT OR IGNORE INTO price_snapshots(product_id,product_name,buy,sell,unit,captured_at,source) VALUES(?,?,?,?,?,?,?)").bind(p.id,p.name,p.buy,p.sell,p.unit,stamp,source).run();
  }
  products.push(p);
 }
 const latestPayload={...payload,products,fetchedAt:stamp,stale:false};
 await env.DB.prepare("INSERT OR REPLACE INTO tracker_state(key,value) VALUES('latest',?)").bind(JSON.stringify(latestPayload)).run();
}
async function poll(env){
 const payload=await fetchSource(env);await recordPrices(env,payload);return payload;
}
async function latest(env){
 await ensureSchema(env.DB);const saved=await env.DB.prepare("SELECT value FROM tracker_state WHERE key='latest'").first();
 let data=saved?.value?JSON.parse(saved.value):null;
 if(!data){try{data=await poll(env)}catch(e){return {products:[],history:[],stale:true,error:e.message,fetchedAt:null}}}
 const hist=await env.DB.prepare("SELECT product_id AS productId,product_name AS name,buy,sell,unit,captured_at AS time,source FROM price_snapshots ORDER BY captured_at DESC LIMIT 1500").all();
 const stale=!data.fetchedAt||Date.now()-new Date(data.fetchedAt).getTime()>5*60*1000;
 return {...data,stale,history:hist.results||[]};
}
export default {
 async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{headers:CORS});
  const url=new URL(request.url);
  if(url.pathname==="/api/health"){
   if(url.searchParams.get("deep")==="1"){
    const db=env.DB;
    const info={ok:true,service:"vietinbank-gold-tracker-api",time:now(),dbPresent:!!db,dbType:typeof db,prepareType:typeof db?.prepare,dbKeys:db&&typeof db==="object"?Object.keys(db):[]};
    if(typeof db?.prepare==="function"){try{await db.prepare("SELECT 1 AS ok").first();info.d1Query=true}catch(e){info.d1Query=false;info.d1Error=String(e?.message||e)}}
    return json(info,info.d1Query===false?503:200);
   }
   return json({ok:true,service:"vietinbank-gold-tracker-api",time:now()});
  }
  if(url.pathname==="/api/prices"&&request.method==="GET"){
   try { const data=await latest(env); return json(data,data.products.length?200:503); }
   catch(e) { console.error("GET /api/prices failed:",e); return json({ok:false,error:"PRICE_API_FAILED",detail:String(e?.message||e),fetchedAt:null,products:[],history:[]},503); }
  }
  if(url.pathname==="/api/sync"&&request.method==="POST"){
   if(!env.ADMIN_TOKEN||request.headers.get("authorization")!=="Bearer "+env.ADMIN_TOKEN)return json({error:"Unauthorized"},401);
   try{return json({ok:true,...await poll(env)})}catch(e){return json({ok:false,error:e.message},502)}
  }
  return json({error:"Not found"},404);
 },
 async scheduled(event,env,ctx){ctx.waitUntil(poll(env).catch(async e=>{console.error("Scheduled price poll failed:",e);try{await ensureSchema(env.DB);await env.DB.prepare("INSERT OR REPLACE INTO tracker_state(key,value) VALUES('last_error',?)").bind(JSON.stringify({message:String(e?.message||e),time:now()})).run()}catch(dbError){console.error("Could not persist scheduled error:",dbError)}}))}
};
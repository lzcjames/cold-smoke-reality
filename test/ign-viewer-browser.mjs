// Real developer IGN preview browser smoke: no synthetic terrain may be staged.
// Execute only after the pinned, licensed source artifact passes all audits.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve,join,sep} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('site/ign-lab');
const main=await readFile(join(root,'index.html'),'utf8').catch(()=>null);
if(!main){
 console.log('Optional IGN archive unavailable; official production game remains unaffected');
 process.exit(0);
}
const server=createServer(async(req,res)=>{
 const raw=new URL(req.url,'http://localhost').pathname;
 const filename=raw==='/'?'index.html':decodeURIComponent(raw).replace(/^\/+/, '');
 const p=resolve(root,filename);
 if(p!==root&&!p.startsWith(root+sep))return res.writeHead(403).end();
 const data=await readFile(p).catch(()=>null);
 if(!data)return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':filename.endsWith('.html')?'text/html':'application/json','Cache-Control':'no-store'}).end(data);
}).listen(0,'127.0.0.1');
await once(server,'listening');
const profile=await mkdtemp('/tmp/cold-smoke-ign-browser-');
const browser=spawn(process.env.BROWSER||'chromium',[
 '--headless','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
 '--remote-debugging-port=0','--window-size=900,650','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let socket;
const timer=setTimeout(()=>browser.kill(),90000);
try{
 let port;
 for(let i=0;i<140&&!port;i++){
  port=(await readFile(profile+'/DevToolsActivePort','utf8').catch(()=>'' )).split('\n')[0];
  if(!port)await delay(100);
 }
 assert(port,'Chrome failed to expose CDP debugging port');
 const [tab]=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 socket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no;});
 let id=0;
 function cdp(method,params={}){
  const seq=++id;
  return new Promise((ok,no)=>{
   const receive=e=>{
    const data=JSON.parse(e.data);
    if(data.id!==seq)return;
    socket.removeEventListener('message',receive);
    if(data.error)no(Error(JSON.stringify(data.error)));
    else ok(data.result);
   };
   socket.addEventListener('message',receive);
   socket.send(JSON.stringify({id:seq,method,params}));
  });
 }
 async function evaluate(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.result.description||JSON.stringify(r.exceptionDetails));
  return r.result.value;
 }
 const base='http://127.0.0.1:'+server.address().port;
 await cdp('Page.enable');await cdp('Runtime.enable');
 await cdp('Page.navigate',{url:base+'/'});
 let result;
 for(let i=0;i<130;i++){
  result=await evaluate(`({ready:window.__ignLab?.verified||false,
    status:document.getElementById('status')?.textContent||'',
    details:window.__ignLab?{tiles:window.__ignLab.tiles,
      samples:window.__ignLab.samples,triangles:window.__ignLab.triangles}:null})`);
  if(result.ready||/预览拒绝加载|初始化失败|不支持 WebGL/.test(result.status))break;
  await delay(180);
 }
 assert(result?.ready,'Real-source WebGL lab did not load: '+result?.status);
 assert.equal(result.details.tiles,6);
 assert.equal(result.details.triangles,18626);
 assert.equal(result.details.samples,9798);
 const visual=await evaluate(`(()=>{
    const c=document.getElementById('scene');
    window.__ignLab.render();
    const off=document.createElement('canvas');
    off.width=180;off.height=130;
    const ctx=off.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(c,0,0,180,130);
    const d=ctx.getImageData(0,0,180,130).data;
    let count=0,min=255,max=0;
    const first=[d[0],d[1],d[2]];
    for(let i=0;i<d.length;i+=4){
      min=Math.min(min,d[i],d[i+1],d[i+2]);
      max=Math.max(max,d[i],d[i+1],d[i+2]);
      if(Math.abs(d[i]-first[0])+Math.abs(d[i+1]-first[1])+
         Math.abs(d[i+2]-first[2])>35)count++;
    }
    return {count,min,max};
  })()`);
 assert(visual.count>150,'WebGL image appears blank or lacks measured mountain pixels: '+JSON.stringify(visual));
 assert(visual.max-visual.min>40,'WebGL shading lacks terrain dynamic range');
 console.log('Real IGN browser render passed:',result.details,visual);
}finally{
 clearTimeout(timer);
 try{socket?.close()}catch{}
 // Chromium can still be writing GPU/cache data after kill() returns.
 // Wait for process exit before deleting the live profile directory.
 if(browser.exitCode===null && browser.signalCode===null){
  const exited=new Promise(resolve=>browser.once('exit',resolve));
  browser.kill();
  await Promise.race([exited,delay(5000)]);
  if(browser.exitCode===null && browser.signalCode===null)browser.kill('SIGKILL');
 }
 await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:200});
}

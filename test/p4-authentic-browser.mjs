// P4 private preview: authentic IGN/OSM Les Deux Alpes and released Alpe d'Huez.
// The preview workflow stages real data only in an ephemeral CI workspace.
// No synthetic second resort, and no public Pages deployment.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('dist/dev.html', root));
const packs = new Map();
for (const id of ['alpe-dhuez','les-deux-alpes']) {
  const raw = await readFile(new URL('dist/reality/'+id+'.json',root));
  packs.set('/reality/'+id+'.json',raw);
}
const source = html.toString('utf8');
assert(source.includes('les-deux-alpes'));
assert(source.includes('alpe-dhuez'));
assert(!source.includes('Synthetic Test Resort'));
const server = createServer((req,res) => {
  const path = new URL(req.url,'http://127.0.0.1').pathname;
  const data = path === '/' ? html : packs.get(path);
  if (!data) return res.writeHead(404).end('Not found');
  res.writeHead(200,{'Content-Type':path==='/'?'text/html':'application/json',
    'Cache-Control':'no-store'}).end(data);
}).listen(0,'127.0.0.1');
await once(server,'listening');
const profile = await mkdtemp('/tmp/p4-authentic-browser-');
const screenshots = new URL('screenshots/p4-real/',root);
await mkdir(screenshots,{recursive:true});
const browser = spawn(process.env.BROWSER || 'chromium', [
  '--headless','--no-sandbox','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--enable-unsafe-webgpu',
  '--remote-debugging-port=0','--window-size=960,640',
  '--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let socket, launchError;
browser.on('error',e=>{launchError=e});
const watchdog = setTimeout(()=>browser.kill(),570000);
const report=[];
try {
  let port='';
  for(let i=0;i<120 && !port;i++) {
    if(launchError) throw launchError;
    port=(await readFile(profile+'/DevToolsActivePort','utf8').catch(()=>'' )).split('\n')[0];
    if(!port) await delay(100);
  }
  assert(port,'Chromium DevTools did not start');
  const [tab] = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve; socket.onerror=reject});
  let seq=0;
  function call(method,params={}) {
    const id=++seq;
    return new Promise((resolve,reject)=>{
      const failed=()=>{socket.removeEventListener('message',onMessage);reject(Error('CDP closed: '+method))};
      const onMessage=e=>{
        const msg=JSON.parse(e.data);
        if(msg.id!==id)return;
        socket.removeEventListener('message',onMessage);
        socket.removeEventListener('close',failed);
        if(msg.error) reject(Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      };
      socket.addEventListener('message',onMessage);
      socket.addEventListener('close',failed,{once:true});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression) {
    const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails) throw Error(r.result.description||JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
  const base='http://127.0.0.1:'+server.address().port;
  async function open(path) {
    const result=await call('Page.navigate',{url:base+path});
    assert(result.loaderId,'Chromium navigation failed');
    for(let i=0;i<140;i++) {
      if(await evaluate('location.href === '+JSON.stringify(base+path)+' && Boolean(window.__ski)').catch(()=>false))return;
      await delay(150);
    }
    throw Error('Timed out waiting for game boot hook: '+path);
  }
  for (const id of ['alpe-dhuez','les-deux-alpes']) {
    for (const backend of ['webgl2','webgpu']) {
      const url='/?manual&w=320&h=180&quality=2&gov=0&lang=en&backend='+
        backend+'&reality='+id+'&network=1'+(backend==='webgpu'?'&offscreen':'');
      await open(url);
      const result=await evaluate(`(async()=>{
        const k=window.__ski, started=performance.now();
        const boot=await k.boot();
        if(!boot.startsWith('ok'))return {boot,error:k.err()};
        const t=k.m.Course.reality, net=t?.network, app=k.app();
        if(!net || !Array.isArray(net.signs) || !net.signs.length)
          throw Error('Missing authentic directed network signs');
        const begin=k.sim(0), end=k.sim(1.25,k.pilot());
        const surface=k.height(end.p[0],end.p[2]);
        const sign=net.signs[0];
        k.view([sign.x,sign.y+4,sign.z+17],
          [sign.x,sign.y+1.6,sign.z-12],0.95,0);
        const markerIds=[...new Set(net.signs.flatMap(s=>[s.from,s.to]))];
        return {
          boot,id:t.id,way:t.osmWay,source:t.elevationSource,
          name:t.resortName,signs:net.signs.length,stakes:net.stakes.length,
          junctions:net.junctions.length,markerIds,
          start:begin.p,end:end.p,speed:end.speed,
          surface,error:k.err(),lost:Boolean(app.gfx.lost),
          bootMs:performance.now()-started,
          credit:document.getElementById('reality-resort-name').textContent,
          pisteHref:document.getElementById('reality-piste').href,
          renderBackend:app.gfx.gl?'webgl2':'webgpu',
        };
      })()`);
      assert.equal(result.boot,'ok '+backend,JSON.stringify(result));
      assert.equal(result.id,id);
      assert.equal(result.credit,result.name);
      assert.equal(result.renderBackend,backend);
      assert(result.signs>=2 && result.junctions>=2 && result.stakes>0,JSON.stringify(result));
      assert(!result.error && !result.lost);
      assert(result.speed>0 && result.end[2]<result.start[2],JSON.stringify(result));
      assert(Math.abs(result.end[1]-result.surface)<0.6,JSON.stringify(result));
      assert(result.pisteHref.endsWith('/way/'+result.way));
      if(id==='les-deux-alpes') {
        assert.equal(result.way,219409078);
        assert.match(result.source,/IGN LiDAR HD MNT 0\.5 m/);
        assert.equal(result.junctions,2);
        assert.equal(result.signs,10, 'two directions at the sharp fork need early and near signs');
        assert(result.markerIds.every(n=>[219409078,643745486,643786947].includes(n)));
      } else {
        assert.equal(result.way,23257919);
        assert(result.markerIds.every(n=>[23257919,256295592,23257916].includes(n)));
      }
      let png;
      if(backend==='webgpu') {
        const picture=await evaluate(`(async()=>{
          const raw=await window.__ski.app().gfx.capture();
          if(!raw?.data || raw.w<64 || raw.h<64) throw Error('No GPU readback');
          let min=255,max=0,varied=0;
          const first=raw.data[0];
          for(let i=0;i<raw.data.length;i+=4) {
            min=Math.min(min,raw.data[i],raw.data[i+1],raw.data[i+2]);
            max=Math.max(max,raw.data[i],raw.data[i+1],raw.data[i+2]);
            if(Math.abs(raw.data[i]-first)>20)varied++;
          }
          if(max-min<50||varied<500)throw Error('WebGPU blank frame');
          const canvas=document.createElement('canvas');
          canvas.width=raw.w;canvas.height=raw.h;
          canvas.getContext('2d').putImageData(new ImageData(raw.data,raw.w,raw.h),0,0);
          return {data:canvas.toDataURL('image/png').split(',')[1],varied};
        })()`);
        assert(picture.data.length>1200);
        png=Buffer.from(picture.data,'base64');
      } else {
        const shot=await call('Page.captureScreenshot',{
          format:'png',captureBeyondViewport:false,fromSurface:true
        });
        assert(shot.data?.length>1200);
        png=Buffer.from(shot.data,'base64');
      }
      await writeFile(new URL(id+'-'+backend+'.png',screenshots),png);
      report.push({id,backend,bootMs:result.bootMs,signs:result.signs,
        stakes:result.stakes,junctions:result.junctions,
        screenshotBytes:png.length,graphicsError:result.error});
      console.log('Authentic P4 browser rendered and skied:',JSON.stringify(report.at(-1)));
    }
  }
  await open('/?manual&w=320&h=180&lang=en&backend=webgl2&ui');
  const picker=await evaluate(`({
    hidden:document.getElementById('reality-picker').hidden,
    selected:document.getElementById('reality-select').value,
    options:[...document.getElementById('reality-select').options].map(x=>x.value)
  })`);
  assert.equal(picker.hidden,false,'Both actual published-preview packs should appear in the picker');
  assert.deepEqual(picker.options,['alpe-dhuez','les-deux-alpes']);
  assert.equal(picker.selected,'alpe-dhuez');
  const splash = await call('Page.captureScreenshot',{
    format:'png',captureBeyondViewport:false,fromSurface:true
  });
  assert(splash.data?.length>1200);
  await writeFile(new URL('homepage-resort-selector.png',screenshots),
    Buffer.from(splash.data,'base64'));
  const selected = await evaluate(`(() => {
    const picker=document.getElementById('reality-select');
    picker.value='les-deux-alpes';
    picker.dispatchEvent(new Event('change',{bubbles:true}));
    return {id:picker.value,href:location.search,button:
      document.getElementById('reality-enter').textContent};
  })()`);
  assert.equal(selected.id,'les-deux-alpes');
  assert.equal(selected.href.includes('reality=les-deux-alpes'),false,
    'choosing the resort must not trigger early navigation');
  assert.match(selected.button,/进入雪场/);
  try {
    await evaluate(`(() => {
      document.getElementById('reality-enter').click();
      return true;
    })()`);
  } catch(error) {
    if(!/context|navigation|closed/i.test(error.message))throw error;
  }
  let entered=false;
  for(let i=0;i<220;i++) {
    entered=await evaluate(`location.search.includes('reality=les-deux-alpes') &&
      location.search.includes('network=1') &&
      window.__ski?.m.Course.reality?.id==='les-deux-alpes' &&
      window.__ski?.app()?.ready &&
      document.getElementById('reality-resort-name').textContent==='Les Deux Alpes'`)
      .catch(()=>false);
    if(entered)break;
    await delay(200);
  }
  assert(entered,'homepage Enter must load authentic Les Deux Alpes and its own network');
  console.log('Two REAL areas: homepage selection, lazy load and successful launch passed');
  console.log('Two REAL ski areas in selector; no synthetic pack');
} finally {
  clearTimeout(watchdog);
  socket?.close();
  browser.kill();
  server.close();
  await delay(300);
  await rm(profile,{force:true,recursive:true});
  await writeFile(new URL('p4-authentic-browser-report.json',root),
    JSON.stringify({kind:'headless SwiftShader smoke NOT hardware FPS',report},null,2)+'\n');
}

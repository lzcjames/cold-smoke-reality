import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const [htmlPath, assetPath, outputPath, mode] = process.argv.slice(2);
const html = (await readFile(htmlPath,'utf8'))
  .replace('if (Course.reality) Game.resetReality();', 'if (Course.reality) Game.reset(Course.reality.start);')
  .replace('App.gfx = gfx;', `App.gfx = gfx;
  const perf = window.__pistePerf = {draws:0, triangles:0, lines:0, bytes:0};
  const draw = gfx.draw, texture = gfx.texture, buffer = gfx.buffer;
  gfx.draw = (p,d) => {
    const instances = d.instances ?? 1, topology = p.desc.topology;
    if (perf.hideJunctions && p.name === 'junctionSigns') return;
    if (d.count > 0 && instances > 0) {
      perf.draws++;
      if (topology === 'lines') perf.lines += Math.floor(d.count/2)*instances;
      else perf.triangles += (topology === 'strip' ? Math.max(0,d.count-2) : Math.floor(d.count/3))*instances;
    }
    return draw(p,d);
  };
  gfx.texture = (o) => {
    const bpp = {rgba8:4,rgba16f:8,r32f:4,rgba32f:16,r8:1,depth:4};
    perf.bytes += o.w*o.h*(bpp[o.format] || 0)*(o.mips ? 4/3 : 1);
    return texture(o);
  };
  gfx.buffer = (data,...args) => {
    perf.bytes += data?.byteLength || 0;
    return buffer(data,...args);
  };`);
const asset = await readFile(assetPath);
const server=createServer((req,res)=>{
  if (req.url.startsWith('/reality/')) return res.writeHead(200,{'Content-Type':'application/json'}).end(asset);
  res.writeHead(200,{'Content-Type':'text/html'}).end(html);
}).listen(0,'127.0.0.1');
await once(server, 'listening');
const profile = await mkdtemp('/tmp/cold-smoke-chromium-');
const browser = spawn(process.env.BROWSER || 'chromium', ['--headless', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--remote-debugging-port=0', '--window-size=800,600', '--user-data-dir='+profile, 'about:blank'], {stdio:'ignore'});
let socket;
let launchError;
browser.on('error', error => { launchError = error; });
const timer = setTimeout(() => browser.kill(), 420_000);
try {
  let port;
  for (let i=0;i<100 && !port;i++) {
    if (launchError) throw launchError;
    port = (await readFile(profile+'/DevToolsActivePort','utf8').catch(()=> '')).split('\n')[0];
    if (!port) await delay(100);
  }
  assert(port, 'Chromium debugging port did not start');
  const [tab] = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve; socket.onerror=reject;});
  let id=0;
  function cdp(method, params={}) {
    const seq=++id;
    return new Promise((resolve,reject)=>{
      function close() {
        socket.removeEventListener('message', receive);
        reject(new Error('Chromium closed during ' + method));
      }
      function receive(e) {
        const msg=JSON.parse(e.data);
        if(msg.id!==seq) return;
        socket.removeEventListener('message',receive);
        socket.removeEventListener('close', close);
        if(msg.error) reject(msg.error); else resolve(msg.result);
      }
      socket.addEventListener('message',receive);
      socket.addEventListener('close', close, { once: true });
      socket.send(JSON.stringify({id:seq,method,params}));
    });
  }
  async function evaluate(expression) {
    const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if (r.exceptionDetails) {
      throw Error(r.result.description || JSON.stringify(r.result.value ?? r.exceptionDetails));
    }
    return r.result.value;
  }
  await cdp('Network.enable');
  await cdp('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
  const base = 'http://127.0.0.1:' + server.address().port;
  async function navigate(path, readiness) {
    const {loaderId}=await cdp('Page.navigate',{url:base+path});
    assert(loaderId);
    for(let i=0;i<100;i++) {
      if(await evaluate('location.href === '+JSON.stringify(base+path)+' && ('+readiness+')').catch(()=>false)) return;
      await delay(200);
    }
    throw Error('Page did not become ready: '+path);
  }

  await cdp('Performance.enable');
  await navigate('/?manual&w=320&h=180&quality=2&backend=webgl2&reality=alpe-dhuez&gov=0&wx=clear&tod=day'+(mode !== 'baseline' ? '&network=1' : ''),'Boolean(window.__ski)');
  const start = await evaluate(`(async () => {
    const k=window.__ski, t=performance.now(), boot=await k.boot();
    if(!boot.startsWith('ok')) return {boot};
    await k.app().later;
    if (location.search.includes("network=1") && !k.m.Course.reality?.network) throw Error("Network mode did not boot");
    const {Sky, Weather, Render}=k.m;
    Sky.rate=0;
    Weather.set('clear',true);
    Render.motionBlur=false;
    return {boot, bootMs:performance.now()-t, navigationToReadyMs:performance.now()};
  })()`);
  assert.equal(start.boot,'ok webgl2',JSON.stringify(start));
  console.log('Boot complete', start);
  const frame = await evaluate(`(() => {
    const k=window.__ski, {Render,Course}=k.m, perf=window.__pistePerf, gl=k.app().gfx.gl;
    const pilot=k.pilot(0.45,5.2);
    for(let i=0;i<120;i++) k.sim(1/60,pilot,{draw:false});
    // Same world-space camera relative to La Balme at its two surveyed intersections.
    const ablate = ${mode === 'ablate'};
    const scenarios=[20, Course.reality.length-34].map(s=>{
      const x=Course.reality.centre(s), z=-s, y=Course.height(x,z);
      const targetX=Course.reality.centre(s+25), targetZ=z-25;
      const camera=[x+5,y+4,z+5], target=[targetX,Course.height(targetX,targetZ)+2,targetZ];
      const pixel = new Uint8Array(4);
      const run=()=>{k.view(camera,target,0.96,0);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);};
      for(let i=0;i<3;i++) run();
      const frames=[];
      for(let i=0;i<(ablate ? 8 : 4);i++){
        perf.hideJunctions = ablate && (i % 4 === 1 || i % 4 === 2);
        perf.draws=perf.triangles=perf.lines=0;
        const t=performance.now(); run();
        frames.push({ms:performance.now()-t,draws:perf.draws,triangles:perf.triangles,lines:perf.lines,hideJunctions:perf.hideJunctions});
      }
      return {s,camera,target,frames};
    });
    return {scenarios,allocationBytes:perf.bytes,viewport:[Render.W,Render.H],graphicsError:k.err()};
  })()`);
  await cdp('HeapProfiler.collectGarbage');
  const heap=(await cdp('Performance.getMetrics')).metrics.filter(m=>m.name.startsWith('JSHeap'));
  await writeFile(outputPath, JSON.stringify({start,frame,heap},null,2)+'\n');
  console.log(start,frame.viewport,frame.scenarios.map(s=>[s.s,s.frames[0]]),heap);
} finally {
  clearTimeout(timer);
  socket?.close();
  browser.kill();
  server.close();
  await delay(500);
  await rm(profile,{force:true,recursive:true});
}

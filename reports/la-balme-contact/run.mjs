import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const output = new URL('./', import.meta.url);
const anchor = '  K.toWorld = function (p)';
const source = await readFile(new URL('dist/dev.html', root), 'utf8');
assert(source.includes(anchor));
const html = source.replace(anchor, (await readFile(new URL('probe.js', output), 'utf8')) + '\n' + anchor);
const asset = await readFile(new URL('dist/reality/alpe-dhuez.json', root));
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') return res.writeHead(200, {'Content-Type':'text/html'}).end(html);
  if (path === '/reality/alpe-dhuez.json') return res.writeHead(200, {'Content-Type':'application/json'}).end(asset);
  res.writeHead(404).end();
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const profile = await mkdtemp('/tmp/cold-smoke-chromium-');
const browser = spawn(process.env.BROWSER || 'chromium', ['--headless', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--remote-debugging-port=0', '--window-size=800,600', '--user-data-dir='+profile, 'about:blank'], {stdio:'ignore'});
let socket;
let launchError;
browser.on('error', error => { launchError = error; });
const timer = setTimeout(() => browser.kill(), 550_000);
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
      function receive(e) {
        const msg=JSON.parse(e.data);
        if(msg.id!==seq) return;
        socket.removeEventListener('message',receive);
        if(msg.error) reject(msg.error); else resolve(msg.result);
      }
      socket.addEventListener('message',receive);
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
  const args = process.argv.slice(2);
  for (const mode of args.includes('--capture') ? ['La-Balme'] : ['La-Balme', 'procedural']) {
    const path = '/?manual&w=320&h=180&quality=2&backend=webgl2' + (mode === 'La-Balme' ? '&reality=alpe-dhuez' : '');
    await navigate(path, 'Boolean(window.__ski)');
    assert.equal(await evaluate('window.__ski.boot()'), 'ok webgl2');
    await evaluate(`(() => {
      const k = window.__ski, {Game, Skier, Render, Course, App} = k.m;
      const pilot = k.pilot(0.45, 5.2), S = Game.s;
      const run = (i, draw) => {
        const startContact = S.contact;
        k.sim(1/60, pilot, {draw});
        const o = Render.origin;
        const height = Course.height;
        const [x,y,z] = S.p, dem = height(x,z,0.5), gs = Skier.sec.gs;
        const refs = Skier.world.seg.slice(0,2).map(([a,b]) => Math.min(...Array.from({length:45}, (_,j) => {
          const q = a.map((c,k) => c + (b[k]-c)*j/44 + o[k]);
          return q[1] - height(q[0],q[2],0.5);
        })));
        const skis = Skier.auditContact(o, height);
        return {frame:i, t:i/60, runT:Game.runT, appT:App.t, body:S.p.slice(), root:Game.root.pos.slice(),
          bodyGap:y-dem, leg:S.leg, physicalGap:y-S.leg-dem, air:S.air, contact:S.contact,
          touchdown:!startContact && S.contact, velocity:S.v.slice(), speed:Math.hypot(...S.v), landV:S.landV,
          sink:gs?.[9], sinkVelocity:gs?.[10], pelvisRise:gs?.[16], correction:Skier.sec.gnd?.slice(),
          refs, skis, min:Math.min(...skis.map(a=>a.sole.all))};
      };
      window.stepContact = run;
      window.closeContact = async () => {
        const [x,y,z] = Game.root.pos, W = Skier.world, a = W.X, b = W.Z;
        const camera = [x+2.2*a[0]+0.7*b[0],y+0.65+2.2*a[1]+0.7*b[1],z+2.2*a[2]+0.7*b[2]];
        camera[1] = Math.max(camera[1],Course.height(camera[0],camera[2],0.5)+0.30);
        Render.setCamera(camera,[x,y+0.13,z],[0,1,0],0.65,0);
        Render.computeGlobals(App.t,1/60,App.state);
        Render.render();
        return k.shot();
      };
    })()`);
    if (args.includes('--verify-topology')) {
      const row = await evaluate('window.stepContact(1,false)');
      assert(Number.isFinite(row.min));
      console.log('Validated rendered mesh index buffer and ski sole topology');
      break;
    }
    if (!args.includes('--capture')) {
      const frames = [];
      for (let i=1;i<=3600;i+=300) {
        frames.push(...await evaluate(`Array.from({length:300}, (_,j) => window.stepContact(${i}+j,false))`));
      }
      assert.equal(frames.length,3600);
      assert(frames.every(f=>Number.isFinite(f.min) && Number.isFinite(f.leg)));
      await writeFile(new URL(mode+'.jsonl', output), frames.map(v=>JSON.stringify(v)).join('\n')+'\n');
      const ranked = frames.filter(f=>f.touchdown).sort((a,b)=>a.min-b.min);
      console.log(mode, 'target', frames[2290], 'worst touchdown', ranked[0], 'deepest', frames.reduce((a,b)=>a.min<b.min?a:b).frame);
    } else {
      const frames = args.filter(a=>/^\d+$/.test(a)).map(Number);
      const chaseOnly = args.includes('--chase-only');
      const radius = chaseOnly ? 3 : 30;
      const keep = new Set(frames.flatMap(v=>Array.from({length:2*radius+1},(_,j)=>v+j-radius)));
      assert(keep.size);
      const shots = new URL(chaseOnly ? 'clean-chase/' : 'frames/',output);
      await mkdir(shots,{recursive:true});
      const results = [];
      for (let i=1;i<=Math.max(...keep);i++) {
        if (!keep.has(i)) {
          let end=i;
          while (end<Math.max(...keep) && !keep.has(end+1) && end-i<180) end++;
          await evaluate(`for(let f=${i};f<=${end};f++) window.stepContact(f,false); void 0`);
          i=end;
          continue;
        }
        const row=await evaluate(`(async()=> {
          const row=window.stepContact(${i},true);
          const chase=await window.__ski.shot();
          const close=${chaseOnly ? 'null' : 'await window.closeContact()'};
          return {row,chase,close};
        })()`);
        results.push(row.row);
        for(const view of chaseOnly ? ['chase'] : ['chase','close']) {
          const png=Buffer.from(row[view].split(',')[1],'base64');
          assert(png.length>1000);
          await writeFile(new URL(String(i).padStart(4,'0')+'-'+view+'.png',shots),png);
        }
      }
      await writeFile(new URL(chaseOnly ? 'clean-chase.jsonl' : 'capture.jsonl',output), results.map(v=>JSON.stringify(v)).join('\n')+'\n');
    }
  }
} finally {
  clearTimeout(timer);
  socket?.close();
  browser.kill();
  server.close();
  await delay(500);
  await rm(profile,{force:true,recursive:true});
}

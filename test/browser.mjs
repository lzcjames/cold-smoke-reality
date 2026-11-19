import { createServer } from 'node:http';
import { once } from 'node:events';
import fixture from './reality-fixture.cjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const html = await readFile(new URL('dist/dev.html', root));
const pages = new Map([
  ['/', [html, 'text/html']],
  ['/test/smoke.html', [await readFile(new URL('test/smoke.html', root)), 'text/html']],
  ...await Promise.all(['00_util.js', '01_gfx.js'].map(async file =>
    ['/src/' + file, [await readFile(new URL('src/' + file, root)), 'text/javascript']])),
]);
const realityAsset = process.argv.includes('--release')
  ? JSON.parse(await readFile(new URL('dist/reality/alpe-dhuez.json', root), 'utf8'))
  : fixture();
// Inject a SECOND SYNTHETIC resort only into this test server's HTML. Never
// touch dist/ or ship these coordinates to production.
const alternateAsset = fixture();
alternateAsset.id = 'test-only-resort';
alternateAsset.piste.name = 'Synthetic Test Ridge';
alternateAsset.elevationSource = 'Synthetic browser test only';
alternateAsset.grid.heights = alternateAsset.grid.heights.map((value, i) =>
  value + 0.6 * Math.floor(i / alternateAsset.grid.cols));
const releasedHtml = html.toString('utf8');
assert(!releasedHtml.includes('test-only-resort'), 'synthetic resort must not be published');
const attribute = /data-reality-catalog="([^"]+)"/.exec(releasedHtml);
assert(attribute && attribute[1].endsWith(']'), 'built resort catalog missing');
const testEntry = JSON.stringify({
  id: alternateAsset.id, name: 'Synthetic Test Resort',
  network: false, revision: 'synthetic-browser-1',
}).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const extra = attribute[1].length > 2 ? ',' : '';
const testCatalog = attribute[1].slice(0, -1) + extra + testEntry + ']';
pages.set('/', [releasedHtml.replace(attribute[0],
  'data-reality-catalog="' + testCatalog + '"'), 'text/html']);
let serveReality = false, realityRequests = 0, successfulRealityRequests = 0;
let alternateRequests = 0, successfulAlternateRequests = 0;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const isPrimary = path === '/reality/alpe-dhuez.json';
  const isSecondary = path === '/reality/test-only-resort.json';
  const isReality = isPrimary || isSecondary;
  if (isPrimary) realityRequests++;
  if (isSecondary) alternateRequests++;
  if (isPrimary && serveReality) successfulRealityRequests++;
  if (isSecondary && serveReality) successfulAlternateRequests++;
  const page = isReality && serveReality
    ? [JSON.stringify(isPrimary ? realityAsset : alternateAsset), 'application/json']
    : pages.get(path);
  if (!page) return res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
  res.writeHead(200, { 'Content-Type': page[1],
    'Cache-Control': isReality ? 'public, max-age=600' : 'no-store' }).end(page[0]);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const profile = await mkdtemp('/tmp/cold-smoke-chromium-');
const browser = spawn(process.env.BROWSER || 'chromium', ['--headless', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--remote-debugging-port=0', '--window-size=800,600', '--user-data-dir='+profile, 'about:blank'], {stdio:'ignore'});
let socket;
let launchError;
browser.on('error', error => { launchError = error; });
const timer = setTimeout(() => browser.kill(), 410_000);
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
  for (const backend of ['webgl2','webgpu']) {
    await navigate('/test/smoke.html?backend='+backend,'Boolean(window.__result)');
    const result=await evaluate('window.__result');
    console.log(result);
    assert(result.startsWith('ok '+backend) && !result.includes(' ERR '));
  }
  const options = 'manual&w=320&h=180&gov=0&quality=2';
  await navigate('/?' + options + '&reality=alpe-dhuez', 'Boolean(window.__ski)');
  assert.match(await evaluate('window.__ski.boot()'), /^ERR Alpe d’Huez terrain unavailable/);
  assert.equal(await evaluate('window.__ski.app().ready'), false);
  console.log('Missing Reality data stops startup');
  serveReality = true;

  let firstRealityRequests = null;
  for (const [mode, lang, backend] of [
    ['procedural', 'en', 'webgpu'], ['reality', 'zh', 'webgl2'], ['reality', 'en', 'webgpu'],
    ...(realityAsset.junctions ? [['network', 'zh', 'webgl2'], ['network', 'en', 'webgpu']] : []),
    ['secondary', 'en', 'webgl2'], ['reality-return', 'en', 'webgpu'],
  ]) {
    const reality = mode !== 'procedural', network = mode === 'network';
    const secondary = mode === 'secondary';
    const requestsBefore = realityRequests, alternateBefore = alternateRequests;
    const query = [options, 'lang=' + lang, 'backend=' + backend];
    if (reality) query.push('reality=' + (secondary ? alternateAsset.id : 'alpe-dhuez'));
    if (network) query.push('network=1');
    await navigate('/?' + query.join('&'), 'Boolean(window.__ski)');
    const result = await evaluate(`(async () => {
      try {
      const k = window.__ski;
      const boot = await k.boot();
      if (!boot.startsWith('ok')) return { boot };
      let junctionDraws = 0, lowerJunctionDraws = 0;
      const gfx = k.app().gfx, draw = gfx.draw;
      gfx.draw = (pipe, args) => {
        if (pipe.name === 'junctionSigns') junctionDraws++;
        return draw(pipe, args);
      };
      const start = k.sim(0);
      const end = k.sim(2, k.pilot());
      const game = k.game(), surface = k.height(end.p[0], end.p[2]);
      const terrain = k.m.Course.reality;
      let restarted = false, continued = false;
      if (terrain?.network) {
        const node = terrain.network.junctions.at(-1);
        const [nx, nz] = terrain.project(...node.point);
        game.reset(-nz - 1, nx);
        game.s.v = [0, 0, -6];
        const transition = k.sim(0.5, null, {draw: false});
        continued = transition.p[2] < nz && Math.abs(transition.p[2] - terrain.network.spawn[1]) > 1000;
        const lowerSign = terrain.network.signs.find(s => s.to === 23257916 && !s.advance);
        if (!lowerSign) throw Error('Campanules junction sign missing');
        const seen = junctionDraws;
        k.view([lowerSign.x, lowerSign.y + 2.6, lowerSign.z + 14],
          [lowerSign.x, lowerSign.y + 1.9, lowerSign.z], 0.85, 0);
        lowerJunctionDraws = junctionDraws - seen;
        game.s.p[0] = 50000;
        restarted = Math.abs(k.sim(1/60, null, {draw: false}).p[2] - terrain.network.spawn[1]) < 0.01;
      } else if (terrain) {
        game.s.p[2] = -terrain.length - 10;
        restarted = k.sim(1 / 60, null, { draw: false }).p[2] === -terrain.start;
      }
      return { boot, start, end, error: k.err(), surface, graphicsAlive: !k.app().gfx.lost,
        lang: k.i18n().lang, reality: Boolean(terrain), restarted, continued, junctionDraws, lowerJunctionDraws,
        piste: terrain?.piste, osmWay: terrain?.osmWay, descent: terrain && -terrain.height(0, -terrain.length),
        resortId: terrain?.id, resortName: terrain?.resortName, source: terrain?.elevationSource,
        credits: document.getElementById('reality-resort-name')?.textContent };
      } catch (error) {
        return { failure: error.message || String(error), stack: error.stack,
          graphicsError: window.__ski.err() };
      }
    })()`);
    assert(!result.failure, JSON.stringify(result));
    assert.equal(result.boot, 'ok ' + backend);
    assert.equal(result.lang, lang);
    assert.equal(result.reality, reality);
    assert(!result.error && result.graphicsAlive && result.end.speed > 0 && result.end.p[2] < result.start.p[2], JSON.stringify(result));
    assert(Math.abs(result.end.p[1] - result.surface) < 0.5, JSON.stringify(result));
    if (!reality) {
      assert.equal(realityRequests, requestsBefore,
        'procedural mode must not request the original DEM');
      assert.equal(alternateRequests, alternateBefore,
        'procedural mode must not request a second DEM');
    }
    if (reality) {
      const expected = secondary ? alternateAsset : realityAsset;
      if (secondary) {
        assert.equal(successfulAlternateRequests, 1,
          'new resort must load its own DEM once');
        assert.equal(successfulRealityRequests, firstRealityRequests,
          'entering another resort must not reload the original');
      } else if (firstRealityRequests == null) {
        firstRealityRequests = successfulRealityRequests;
        assert.equal(firstRealityRequests, 1, 'first selected resort should fetch DEM once');
      } else {
        assert.equal(successfulRealityRequests, firstRealityRequests,
          'switching back must reuse the original DEM cache');
        if (mode === 'reality-return')
          assert.equal(successfulAlternateRequests, 1,
            'switching back must not download the other DEM');
      }
      assert.equal(result.resortId, expected.id);
      assert.equal(result.resortName, secondary ? 'Synthetic Test Resort' : 'Alpe d’Huez');
      assert.equal(result.credits, result.resortName);
      assert.equal(result.piste, expected.piste.name);
      assert.equal(result.osmWay, expected.piste.osmWay);
      assert.equal(result.source, expected.elevationSource);
      assert(result.descent > 25);
      assert.equal(result.restarted, true);
      if (network) assert(result.continued && result.junctionDraws > 0 &&
        result.lowerJunctionDraws > 0, JSON.stringify(result));
      else assert.equal(result.junctionDraws, 0);
    }
    console.log(mode, result.piste || 'seeded mountain', lang, backend, 'skiing, rendered frame and ground contact passed');
  }

  // Also exercise the generated menu link, not only direct ?reality= URLs.
  await navigate('/?' + options + '&ui&lang=en&backend=webgl2',
    'Boolean(document.querySelector("#reality-resorts a"))');
  const alternateLink = await evaluate(`({
    label: document.querySelector('#reality-resorts a').textContent,
    url: document.querySelector('#reality-resorts a').getAttribute('href'),
    hidden: document.getElementById('reality-resorts').hidden
  })`);
  assert.equal(alternateLink.hidden, false);
  assert.match(alternateLink.label, /Synthetic Test Resort/);
  assert.match(alternateLink.url, /reality=test-only-resort/);
  assert.doesNotMatch(alternateLink.url, /network=1/);
  try {
    await evaluate('document.querySelector("#reality-resorts a").click(); true');
  } catch (error) {
    if (!/context|navigation|closed/i.test(error.message)) throw error;
  }
  let opened = false;
  for (let i = 0; i < 200; i++) {
    opened = await evaluate(`location.search.includes('reality=test-only-resort') &&
      Boolean(window.__ski?.app()?.ready) && window.__ski.m.Course.reality?.id === 'test-only-resort' &&
      document.getElementById('reality-resort-name')?.textContent === 'Synthetic Test Resort'`)
      .catch(() => false);
    if (opened) break;
    await delay(200);
  }
  assert.equal(opened, true, 'menu selection must boot the synthetic resort with correct credits');
  assert.equal(successfulAlternateRequests, 1, 'menu selection must reuse cached second DEM');
  console.log('Multi-resort menu link, navigation, credits and cached re-entry passed');
} finally {
  clearTimeout(timer);
  socket?.close();
  browser.kill();
  server.close();
  await delay(500);
  await rm(profile,{force:true,recursive:true});
}

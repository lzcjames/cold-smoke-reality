import { createServer } from 'node:http';
import { once } from 'node:events';
import fixture from './reality-fixture.cjs';
import synthetic from './p3-synthetic-network.cjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const captureImages = process.argv.includes('--screenshots');
const p3Only = process.argv.includes('--p3-only');
const p3 = p3Only || process.argv.includes('--p3');
const captures = new URL('../screenshots/pr10/', import.meta.url);
if (captureImages) await mkdir(captures, { recursive: true });
const p3Captures = new URL('../screenshots/p3/', import.meta.url);
if (p3) await mkdir(p3Captures, { recursive: true });
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
const playableLes2 = JSON.parse(await readFile(
  new URL('dist/reality/les-deux-alpes.json', root), 'utf8'));
assert.equal(playableLes2.id,'les-deux-alpes');
const alternateAsset = fixture();
alternateAsset.id = 'test-only-resort';
alternateAsset.piste.name = 'Synthetic Test Ridge';
alternateAsset.elevationSource = 'Synthetic browser test only';
alternateAsset.grid.heights = alternateAsset.grid.heights.map((value, i) =>
  value + 0.6 * Math.floor(i / alternateAsset.grid.cols));
const releasedHtml = html.toString('utf8');
assert(!releasedHtml.includes('test-only-resort'), 'synthetic resort must not be published');
assert(!releasedHtml.includes('p3-synthetic-'), 'scale-test resorts must not be published');
const p3Assets = new Map(p3 ? [10, 50, 100].map(count => {
  const asset = synthetic.syntheticNetwork(realityAsset, count);
  asset.id = 'p3-synthetic-' + count;
  return [asset.id, asset];
}) : []);
const attribute = /data-reality-catalog="([^"]+)"/.exec(releasedHtml);
assert(attribute && attribute[1].endsWith(']'), 'built resort catalog missing');
const testEntry = JSON.stringify({
  id: alternateAsset.id, name: 'Synthetic Test Resort',
  network: false, revision: 'synthetic-browser-1',
}).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const p3Entries = [...p3Assets].map(([id, asset]) => JSON.stringify({
  id, name: 'SYNTHETIC P3 ' + asset.pistes.length + ' pistes',
  network: true, revision: 'p3-test-' + asset.pistes.length,
}).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
const extra = attribute[1].length > 2 ? ',' : '';
const testCatalog = attribute[1].slice(0, -1) + extra +
  [testEntry, ...p3Entries].join(',') + ']';
pages.set('/', [releasedHtml.replace(attribute[0],
  'data-reality-catalog="' + testCatalog + '"'), 'text/html']);
let serveReality = false, realityRequests = 0, successfulRealityRequests = 0;
let alternateRequests = 0, successfulAlternateRequests = 0;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const isPrimary = path === '/reality/alpe-dhuez.json';
  const isSecondary = path === '/reality/test-only-resort.json';
  const isLes2 = path === '/reality/les-deux-alpes.json';
  const p3Id = path.startsWith('/reality/p3-synthetic-') ?
    path.slice('/reality/'.length).replace(/\.json$/, '') : null;
  const isP3 = p3Id && p3Assets.has(p3Id);
  const isReality = isPrimary || isSecondary || isLes2 || isP3;
  if (isPrimary) realityRequests++;
  if (isSecondary) alternateRequests++;
  if (isPrimary && serveReality) successfulRealityRequests++;
  if (isSecondary && serveReality) successfulAlternateRequests++;
  const page = isReality && serveReality
    ? [JSON.stringify(isPrimary ? realityAsset : isSecondary ? alternateAsset :
      isLes2 ? playableLes2 : p3Assets.get(p3Id)), 'application/json']
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
// Each launch has an independent watchdog; the P3 stress suite no longer
// accumulates the regular regression's elapsed time in one Chromium process.
const timer = setTimeout(() => browser.kill(), p3Only ? 780_000 : 410_000);
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
  async function capture(name, offscreenGPU = false) {
    if (!captureImages) return;
    let data;
    if (offscreenGPU) {
      // Headless WebGPU canvas swapchain frames may not be composited into the
      // browser's Page.captureScreenshot output. Use the actual GPU texture
      // readback path already provided by createGPU({ offscreen: true }).
      const sampled = await evaluate(`(async () => {
        const raw = await window.__ski.app().gfx.capture();
        if (!raw?.data || raw.w < 64 || raw.h < 64) throw Error('No WebGPU readback');
        let min = 255, max = 0, different = 0;
        const first = raw.data[0];
        for (let i = 0; i < raw.data.length; i += 4) {
          min = Math.min(min, raw.data[i], raw.data[i+1], raw.data[i+2]);
          max = Math.max(max, raw.data[i], raw.data[i+1], raw.data[i+2]);
          if (Math.abs(raw.data[i] - first) > 20) different++;
        }
        if (max - min < 50 || different < 500) throw Error('GPU readback has no visible scene');
        const canvas = document.createElement('canvas');
        canvas.width = raw.w; canvas.height = raw.h;
        canvas.getContext('2d').putImageData(new ImageData(raw.data, raw.w, raw.h), 0, 0);
        return { png: canvas.toDataURL('image/png').split(',')[1], width: raw.w,
          height: raw.h, min, max, different };
      })()`);
      assert(sampled?.png?.length > 1200, 'WebGPU texture image missing');
      console.log('WebGPU readback:', name, sampled.width, sampled.height,
        'channel range', sampled.min, sampled.max, 'different pixels', sampled.different);
      data = Buffer.from(sampled.png, 'base64');
    } else {
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const result = await cdp('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: false, fromSurface: true
      });
      assert(result.data?.length > 1200, 'headless screenshot is unexpectedly empty');
      data = Buffer.from(result.data, 'base64');
    }
    await writeFile(new URL(name + '.png', captures), data);
    console.log('saved screenshot:', name + '.png', data.length, 'bytes');
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
  // Keep the established browser regression and the expensive P3 scale run
  // independent; each obtains a fresh Chromium/CDP session in CI.
  const options = 'manual&w=320&h=180&gov=0&quality=2';
  serveReality = p3Only;
  if (!p3Only) {
  for (const backend of ['webgl2','webgpu']) {
    await navigate('/test/smoke.html?backend='+backend,'Boolean(window.__result)');
    const result=await evaluate('window.__result');
    console.log(result);
    assert(result.startsWith('ok '+backend) && !result.includes(' ERR '));
  }
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
    if (captureImages && backend === 'webgpu') query.push('offscreen');
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
    if (captureImages && (mode === 'procedural' || mode === 'secondary' ||
      mode === 'reality-return' || (network && backend === 'webgl2'))) {
      // Use a reproducible downhill camera in both resorts, and a sign-facing
      // camera at the verified Campanules junction for network mode.
      const visible = await evaluate(`(() => {
        const k = window.__ski, t = k.m.Course.reality;
        if (t?.network) {
          const sign = t.network.signs.find(x => x.to === 23257916 && !x.advance);
          k.view([sign.x, sign.y + 4, sign.z + 16],
            [sign.x, sign.y + 1.6, sign.z - 12], 0.95, 0);
        } else if (t) {
          const z = -Math.min(100, t.length / 3), x = t.centre(-z);
          k.view([x, t.height(x, z) + 8, z + 23],
            [x, t.height(x, z - 35) + 2, z - 35], 0.95, 0);
        } else {
          const p = k.game().root.pos;
          k.view([p[0], p[1] + 8, p[2] + 28],
            [p[0], p[1] + 2, p[2] - 24], 0.95, 0);
        }
        return {width: k.app().gfx.width, height: k.app().gfx.height};
      })()`);
      console.log('headless camera rendered:', mode, JSON.stringify(visible));
      await capture(mode + '-' + backend + (backend === 'webgpu' ? '-texture' : ''),
        backend === 'webgpu');
    }
  }

  // Also exercise the generated menu link, not only direct ?reality= URLs.
  await navigate('/?' + options + '&ui&lang=en&backend=webgl2',
    'Boolean(document.querySelector("#reality-resorts a"))');
  const alternateLink = await evaluate(`(() => {
    // A genuine second resort may now precede the synthetic test entry.
    const link = [...document.querySelectorAll('#reality-resorts a')]
      .find(a => a.getAttribute('href')?.includes('reality=test-only-resort'));
    return { label: link?.textContent, url: link?.getAttribute('href'),
      hidden: document.getElementById('reality-resorts').hidden };
  })()`);
  assert.equal(alternateLink.hidden, false);
  assert.match(alternateLink.label, /Synthetic Test Resort/);
  assert.match(alternateLink.url, /reality=test-only-resort/);
  assert.doesNotMatch(alternateLink.url, /network=1/);
  // P4: the accessible selector is only generated when >=2 validated packs
  // are in the runtime catalog. The injected second pack must be selectable.
  const resortPicker = await evaluate(`({
    hidden: document.getElementById('reality-picker').hidden,
    selected: document.getElementById('reality-select').value,
    options: [...document.getElementById('reality-select').options].map(x => x.value)
  })`);
  assert.equal(resortPicker.hidden, false);
  assert.equal(resortPicker.selected, 'alpe-dhuez');
  // P4: exercise the source-backed, read-only winter Jandri trip preview
  // in actual headless Chromium before the native resort-picker hit test.
  const winterPreview = await evaluate(`(() => {
    const p=document.getElementById('jandri-winter-preview');
    const d=document.getElementById('jandri-winter-destination');
    if (!p || p.hidden) return {missing:true};
    p.open=true;
    d.value='jandri-3200'; d.dispatchEvent(new Event('change',{bubbles:true}));
    const summit=document.getElementById('jandri-winter-path').textContent;
    const summitLegs=[...document.querySelectorAll('#jandri-winter-legs li')].map(e=>e.textContent);
    d.value='jandri-2600'; d.dispatchEvent(new Event('change',{bubbles:true}));
    const mid=document.getElementById('jandri-winter-path').textContent;
    const midLegs=[...document.querySelectorAll('#jandri-winter-legs li')].map(e=>e.textContent);
    const day=document.getElementById('jandri-winter-date');
    day.value='2027-02-10'; day.dispatchEvent(new Event('change',{bubbles:true}));
    const midHours=document.getElementById('jandri-winter-hours').textContent;
    d.value='jandri-3200'; d.dispatchEvent(new Event('change',{bubbles:true}));
    const summitHours=document.getElementById('jandri-winter-hours').textContent;
    day.value='2027-05-03'; day.dispatchEvent(new Event('change',{bubbles:true}));
    const unsourced=document.getElementById('jandri-winter-hours').textContent;
    const disabled=document.getElementById('jandri-winter-normal').disabled &&
      document.getElementById('jandri-winter-express').disabled;
    const title=document.getElementById('title').classList.contains('on');
    p.open=false;
    return {summit,mid,summitLegs,midLegs,midHours,summitHours,unsourced,disabled,title,url:location.href};
  })()`);
  assert.equal(winterPreview.missing,undefined,'Jandri planner present on title');
  assert.match(winterPreview.summit,/1650.*2600.*3200/);
  assert.match(winterPreview.mid,/1650.*2600/);
  assert.equal(winterPreview.summitLegs.length,2);
  assert.equal(winterPreview.midLegs.length,1);
  assert.match(winterPreview.summitLegs[0],/Jandri I.*1650.*2600/);
  assert.match(winterPreview.summitLegs[1],/Jandri II.*2600.*3200/);
  assert.match(winterPreview.summitLegs[1],/待核验/);
  assert.doesNotMatch(winterPreview.mid,/3200/);
  assert.match(winterPreview.midHours,/08:45.*16:45/);
  assert.doesNotMatch(winterPreview.midHours,/第二段/);
  assert.match(winterPreview.summitHours,/第二段 08:55.*16:30/);
  assert.match(winterPreview.unsourced,/无已核对的冬季时刻表/);
  assert.equal(winterPreview.disabled,true);
  assert.equal(winterPreview.title,true);
  assert.match(winterPreview.url,/backend=webgl2/);
  console.log('Actual Chromium winter planner destination and disabled boarding passed');
  // Hit-test the *actual* homepage controls. Previously .layer inherited
  // pointer-events:none; the JS-driven selection tests missed a dead dropdown.
  const pointerCheck = await evaluate(`(() => {
    const ids = ['reality-select', 'reality-enter'];
    return ids.map(id => {
      const el = document.getElementById(id);
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {id, width:b.width, height:b.height,
        pointer: getComputedStyle(el).pointerEvents,
        hit:top === el || el.contains(top),
        actual:top?.id || top?.tagName};
    });
  })()`);
  for (const control of pointerCheck) {
    assert(control.width > 20 && control.height > 15, JSON.stringify(control));
    assert.equal(control.pointer, 'auto', JSON.stringify(control));
    assert(control.hit, 'Homepage picker must receive real clicks: ' + JSON.stringify(control));
  }
  console.log('Actual mouse/touch hit-testing of homepage resort controls passed');
  // Reproduce the player complaint: an actual mouse click on the native
  // dropdown must NOT bubble to the full-screen title's tap-to-start action.
  const selectPoint = await evaluate(`(() => {
    const b = document.getElementById('reality-select').getBoundingClientRect();
    return {x:b.left + b.width/2,y:b.top + b.height/2};
  })()`);
  const beforeNativeOpen = await evaluate(`({
    url: location.href, title:document.getElementById('title').classList.contains('on'),
    startText:document.getElementById('go').textContent
  })`);
  assert(beforeNativeOpen.title, 'The home screen must still be visible');
  await cdp('Input.dispatchMouseEvent', {type:'mousePressed',
    x:selectPoint.x,y:selectPoint.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',
    x:selectPoint.x,y:selectPoint.y,button:'left',clickCount:1});
  await delay(250);
  const afterNativeOpen = await evaluate(`({
    url:location.href,title:document.getElementById('title').classList.contains('on')
  })`);
  assert.equal(afterNativeOpen.url,beforeNativeOpen.url,
    'Simply opening the resort dropdown must not navigate');
  assert.equal(afterNativeOpen.title,true,
    'Simply opening the resort dropdown must not start skiing');
  // Dismiss OS-native menu, then simulate an Enter commit on the focused
  // select. Enter is a selection key, never a launch shortcut.
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  const committed = await evaluate(`(() => {
    const picker=document.getElementById('reality-select');
    picker.focus();
    picker.dispatchEvent(new KeyboardEvent('keydown',{
      key:'Enter',code:'Enter',bubbles:true,cancelable:true
    }));
    return {url:location.href,title:document.getElementById('title').classList.contains('on')};
  })()`);
  assert.equal(committed.url,beforeNativeOpen.url);
  assert.equal(committed.title,true,'Enter inside select must never auto-start');
  console.log('Native dropdown click and Enter selection do not launch a resort');

  // Main Pages may contain the independently validated real P4 resort in
  // addition to the synthetic regression-only resort appended by this server.
  const officialIds = JSON.parse(attribute[1].replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&')).map(x => x.id);
  assert.deepEqual(resortPicker.options, [...officialIds, 'test-only-resort']);
  // P4: ensure the real 3-piste launch menu only shows for Les Deux Alpes,
  // defaults to its measured green run, and never auto-starts on selection.
  const startingPisteUI = await evaluate(`(() => {
    const r=document.getElementById('reality-select');
    const w=document.getElementById('reality-start-piste-wrap');
    const p=document.getElementById('reality-start-piste');
    const hiddenForAlpe=w.hidden;
    r.value='les-deux-alpes';r.dispatchEvent(new Event('change',{bubbles:true}));
    const options=[...p.options].map(o=>o.value);
    const state={hiddenForAlpe,visibleForLes2:!w.hidden,
      selected:p.value,options,
      title:document.getElementById('title').classList.contains('on'),
      href:location.search};
    r.value='alpe-dhuez';r.dispatchEvent(new Event('change',{bubbles:true}));
    state.hiddenAgain=w.hidden;
    return state;
  })()`);
  assert.equal(startingPisteUI.hiddenForAlpe,true);
  assert.equal(startingPisteUI.visibleForLes2,true);
  assert.equal(startingPisteUI.hiddenAgain,true);
  assert.equal(startingPisteUI.selected,'643745486');
  assert.deepEqual(startingPisteUI.options,['643745486','643786947','219409078','644393970','219275197']);
  assert.equal(startingPisteUI.title,true);
  assert.doesNotMatch(startingPisteUI.href,/piste=/);
  console.log('Real Les Deux Alpes piste selector displays correctly without auto-loading');
  // Selecting an item must not fetch a second terrain pack. Only the
  // separate homepage Enter button may load and start that resort in-place.
  const requestsBeforePick = alternateRequests;
  const selectedWithoutLoading = await evaluate(`(() => {
    const picker = document.getElementById('reality-select');
    picker.value = 'test-only-resort';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    return { selected: picker.value,
      href: location.search,
      button: document.getElementById('reality-enter').textContent };
  })()`);
  assert.equal(selectedWithoutLoading.selected, 'test-only-resort');
  assert.equal(selectedWithoutLoading.href.includes('reality=test-only-resort'), false);
  assert.equal(alternateRequests, requestsBeforePick,
    'selection alone must not fetch the next DEM');
  assert.match(selectedWithoutLoading.button, /进入雪场/);
  // The same document and GPU context must survive clicking Enter resort:
  // no page navigation/reload, but a real resort and actual run must start.
  const beforeInPlace = await evaluate(`(() => {
    window.__resortEntryPageSentinel = 'same-document-ski-start';
    return {timeOrigin:performance.timeOrigin};
  })()`);
  // Send a real Chromium pointer click, not an element.click() synthetic
  // activation that bypasses the very overlay bug reported by the player.
  const enterPoint = await evaluate(`(() => {
    const b = document.getElementById('reality-enter').getBoundingClientRect();
    return {x:b.left+b.width/2,y:b.top+b.height/2};
  })()`);
  await cdp('Input.dispatchMouseEvent', {type:'mousePressed',
    x:enterPoint.x,y:enterPoint.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',
    x:enterPoint.x,y:enterPoint.y,button:'left',clickCount:1});
  let opened = false;
  for (let i = 0; i < 200; i++) {
    opened = await evaluate(`location.search.includes('reality=test-only-resort') &&
      Boolean(window.__ski?.app()?.ready) && window.__ski.m.Course.reality?.id === 'test-only-resort' &&
      window.__ski.ui().state === 'run' && window.__ski.game().mode === 'run' &&
      window.__resortEntryPageSentinel === 'same-document-ski-start' &&
      document.getElementById('reality-resort-name')?.textContent === 'Synthetic Test Resort'`)
      .catch(() => false);
    if (opened) break;
    await delay(200);
  }
  assert.equal(opened, true, 'clicking Enter resort must start validated resort immediately in the existing page');
  const afterInPlace = await evaluate(`({timeOrigin:performance.timeOrigin, marker:window.__resortEntryPageSentinel})`);
  assert.equal(afterInPlace.timeOrigin,beforeInPlace.timeOrigin,'resort launch must not reload');
  assert.equal(afterInPlace.marker,'same-document-ski-start');
  assert.equal(successfulAlternateRequests, 1, 'menu selection must reuse cached second DEM');
  console.log('Multi-resort in-place entry, zero reloads, credits and terrain cache passed');
  await capture('secondary-menu-reentry-webgl2');

  // End-to-end real ski launch: select Les Deux Alpes and its green piste
  // in the actual home UI, then enter in place using the published IGN/OSM
  // resort pack (never substitute a synthetic or Jandri 3200 terrain).
  await navigate('/?' + options + '&ui&lang=zh&backend=webgl2',
    'Boolean(window.__ski?.app()?.ready && document.getElementById("reality-select"))');
  const selectedRealPiste = await evaluate(`(() => {
    const r=document.getElementById('reality-select');
    const p=document.getElementById('reality-start-piste');
    r.value='les-deux-alpes';
    r.dispatchEvent(new Event('change',{bubbles:true}));
    p.value='643745486';
    p.dispatchEvent(new Event('change',{bubbles:true}));
    window.__realPistePageSentinel='single-page-green-run';
    return {resort:r.value,piste:p.value,
      visible:!document.getElementById('reality-start-piste-wrap').hidden,
      title:window.__ski.ui().state,timeOrigin:performance.timeOrigin};
  })()`);
  assert.equal(selectedRealPiste.resort,'les-deux-alpes');
  assert.equal(selectedRealPiste.piste,'643745486');
  assert.equal(selectedRealPiste.visible,true);
  assert.equal(selectedRealPiste.title,'title');
  const realEnterPoint = await evaluate(`(() => {
    const b=document.getElementById('reality-enter').getBoundingClientRect();
    return {x:b.left+b.width/2,y:b.top+b.height/2};
  })()`);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',
    x:realEnterPoint.x,y:realEnterPoint.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',
    x:realEnterPoint.x,y:realEnterPoint.y,button:'left',clickCount:1});
  let realStarted=false;
  for(let i=0;i<200;i++){
    realStarted=await evaluate(`(() => {
      const k=window.__ski, t=k?.m?.Course?.reality;
      return k?.ui()?.state==='run' && k?.game()?.mode==='run' &&
        t?.id==='les-deux-alpes' && t.selectedPiste?.osmWay===643745486 &&
        Boolean(t.selectedSpawn) && location.search.includes('piste=643745486') &&
        window.__realPistePageSentinel==='single-page-green-run';
    })()`).catch(()=>false);
    if(realStarted)break;
    await delay(200);
  }
  assert.equal(realStarted,true,'real Petites Crêtes must start without reloading or switching to Diable 1');
  assert.equal(await evaluate('performance.timeOrigin'),selectedRealPiste.timeOrigin);
  console.log('Real IGN/OSM Petites Crêtes green piste: mouse-enter and active ski run passed');
  const beforeReturn=await evaluate(`(() => {
    const k=window.__ski, game=k.game(), btn=document.getElementById('reality-return-start');
    const spot=k.m.Course.reality.selectedSpawn;
    game.s.p[0] += 45; game.s.p[2] -= 100;
    const rect=btn.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const top=document.elementFromPoint(x,y);
    return {visible:!btn.hidden,hit:top===btn,
      title:btn.title,spot,url:location.href,timeOrigin:performance.timeOrigin,x,y};
  })()`);
  assert.equal(beforeReturn.visible,true,'quick return appears only with measured piste');
  assert.equal(beforeReturn.hit,true,'quick return must be mouse-clickable');
  assert.match(beforeReturn.title,/非 Jandri 3S/);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',
    x:beforeReturn.x,y:beforeReturn.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',
    x:beforeReturn.x,y:beforeReturn.y,button:'left',clickCount:1});
  let returned=false;
  for(let i=0;i<100;i++){
    returned=await evaluate(`(() => {
      const k=window.__ski,t=k.m.Course.reality,g=k.game();
      const spot=t.selectedSpawn;
      return !k.app().swapping && k.ui().state==='run' && g.mode==='run' &&
        Math.hypot(g.s.p[0]-spot[0],g.s.p[2]-spot[1])<15;
    })()`).catch(()=>false);
    if(returned)break;
    await delay(100);
  }
  assert.equal(returned,true,'quick return must restart at selected real green run');
  assert.equal(await evaluate('location.href'),beforeReturn.url,'quick return must not navigate');
  assert.equal(await evaluate('performance.timeOrigin'),beforeReturn.timeOrigin,'quick return must not reload');
  console.log('Measured piste quick return: actual click, same terrain and active replay passed');
  // Jandri 2 lower segment is an authentic July-2026 OSM way clipped to the
  // currently measured lower IGN DEM. Also exercise opt-in contact telemetry.
  await navigate('/?' + options + '&ui&lang=zh&backend=webgl2&skiDiag=1',
    'Boolean(window.__ski?.app()?.ready && document.getElementById("reality-select"))');
  const jandriChosen=await evaluate(`(() => {
    const r=document.getElementById('reality-select'),p=document.getElementById('reality-start-piste');
    r.value='les-deux-alpes';r.dispatchEvent(new Event('change',{bubbles:true}));
    p.value='644393970';p.dispatchEvent(new Event('change',{bubbles:true}));
    window.__jandriPisteSentinel='jandri-2-lower-IGN-preview';
    return {selected:p.value,shown:!document.getElementById('reality-start-piste-wrap').hidden};
  })()`);
  assert.deepEqual(jandriChosen,{selected:'644393970',shown:true});
  const jandriButton=await evaluate(`(() => {
    const b=document.getElementById('reality-enter').getBoundingClientRect();
    return {x:b.left+b.width/2,y:b.top+b.height/2};
  })()`);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',
    x:jandriButton.x,y:jandriButton.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',
    x:jandriButton.x,y:jandriButton.y,button:'left',clickCount:1});
  let jandriStarted=false;
  for(let i=0;i<200;i++){
    jandriStarted=await evaluate(`(() => {
      const k=window.__ski,t=k?.m?.Course?.reality;
      return k?.ui()?.state==='run'&&k?.game()?.mode==='run'&&
        t?.id==='les-deux-alpes' && t.selectedPiste?.osmWay===644393970 &&
        t.selectedPiste?.name.includes('下部实测片段') &&
        location.search.includes('piste=644393970') &&
        window.__jandriPisteSentinel==='jandri-2-lower-IGN-preview';
    })()`).catch(()=>false);
    if(jandriStarted)break;
    await delay(200);
  }
  assert.equal(jandriStarted,true,'Jandri 2 lower OSM segment must start on real IGN terrain');
  const jandriMoving=await evaluate(`(() => {
    const k=window.__ski,t=k.m.Course.reality,p=t.selectedSpawn;
    const h=t.height(...p);
    return {inDEM:t.withinDEM(...p),height:h,
      changed:k.sim(1,k.pilot()).p[2]!==p[1],mode:k.game().mode};
  })()`);
  assert.equal(jandriMoving.inDEM,true);
  assert.ok(Number.isFinite(jandriMoving.height));
  assert.equal(jandriMoving.changed,true);
  const jandriTrace=await evaluate(`(() => {
    const diag=window.__skiSkiDiag;
    if(!diag)return null;
    return diag.summary();
  })()`);
  assert.ok(jandriTrace && jandriTrace.frames>0,
    'actual Chromium Jandri ski run must produce opt-in contact samples');
  assert.ok(Number.isFinite(jandriTrace.maxDelta.leftPitchRad));
  console.log('Real IGN/OSM Jandri 2 contact trace captured', jandriTrace);
  const skiSamples = await evaluate(`(() => {
    const rows=window.__skiSkiDiag.snapshot();
    return rows.slice(-28).map(({frame,dt,on,leftPitch,rightPitch,
      leftY,rightY,rootY})=>({frame,dt,on,leftPitch,rightPitch,leftY,rightY,rootY}));
  })()`);
  console.log('Jandri 2 final contact samples', JSON.stringify(skiSamples));
  const skiStartup=await evaluate(`(() => {
    const rows=window.__skiSkiDiag.snapshot();
    const early=rows.slice(0,40);
    const transitions=[];
    for(let i=1;i<rows.length;i++){
      const a=rows[i-1],b=rows[i];
      if(a.on!==b.on || Math.abs(b.leftPitch-a.leftPitch)>0.02 ||
        Math.abs(b.rightPitch-a.rightPitch)>0.02 ||
        Math.abs(b.leftY-a.leftY)>0.025 ||
        Math.abs(b.rightY-a.rightY)>0.025){
        transitions.push({frame:b.frame,prevOn:a.on,on:b.on,
          dLeftPitch:b.leftPitch-a.leftPitch,
          dRightPitch:b.rightPitch-a.rightPitch,
          dLeftY:b.leftY-a.leftY,dRightY:b.rightY-a.rightY,dt:b.dt});
      }
    }
    return {early:early.map(({frame,dt,on,leftPitch,rightPitch,leftY,rightY,rootY,
      snowSink})=>({frame,dt,on,leftPitch,rightPitch,leftY,rightY,rootY,snowSink})),
      transitions:transitions.slice(0,24)};
  })()`);
  console.log('Jandri 2 contact startup / exceptional transitions', JSON.stringify(skiStartup));
  assert.ok(skiStartup.early.length>=2);
  assert.ok(skiStartup.transitions.length<=24);
  assert.ok(jandriTrace.pitchReversals.left.reversals <=
    jandriTrace.pitchReversals.left.compared);
  console.log('Real IGN/OSM Jandri 2 lower segment skiing passed');
  }

  if (p3) {
    await cdp('Performance.enable');
    const records = [];
    for (const count of [3, 10, 50, 100]) {
      const id = count === 3 ? 'alpe-dhuez' : 'p3-synthetic-' + count;
      const url = '/?' + options + '&backend=webgl2&reality=' + id + '&network=1';
      await navigate(url, 'Boolean(window.__ski)');
      const result = await evaluate(`(async () => {
        const k = window.__ski, started = performance.now();
        const boot = await k.boot();
        if (!boot.startsWith('ok')) return { boot };
        const bootMs = performance.now() - started;
        const network = k.m.Course.reality?.network;
        if (!network) throw Error('P3 network missing');
        const sign = network.signs.find(x => x.name.startsWith('SYNTHETIC')) || network.signs[0];
        const eye = [sign.x, sign.y + 4, sign.z + 16];
        const look = [sign.x, sign.y + 1.7, sign.z - 16];
        const gfx = k.app().gfx, gl = gfx.gl;
        const original = gfx.draw;
        let signDraws = 0, sceneDraws = 0;
        gfx.draw = function(pipe, params) {
          sceneDraws++;
          if (pipe.name === 'junctionSigns') signDraws++;
          return original.call(this, pipe, params);
        };
        const samples = [];
        for (let i = 0; i < 22; i++) {
          signDraws = 0; sceneDraws = 0;
          const t = performance.now();
          k.view(eye, look, 0.96, 0);
          const submitMs = performance.now() - t;
          gl.finish();
          if (i >= 6) samples.push({
            completeMs: performance.now() - t, submitMs,
            draws: sceneDraws, junctionDraws: signDraws,
          });
        }
        const summarize = name => {
          const data = samples.map(s => s[name]).sort((a,b) => a-b);
          return { median: data[Math.floor(data.length / 2)],
            p95: data[Math.floor((data.length - 1) * .95)],
            min: data[0], max: data.at(-1) };
        };
        return {
          boot, bootMs, id: k.m.Course.reality.id, signs: network.signs.length,
          stakes: network.stakes.length, junctions: network.junctions.length,
          samples, frame: summarize('completeMs'), submission: summarize('submitMs'),
          draws: summarize('draws'), junctionDraws: summarize('junctionDraws'),
          error: k.err(), lost: gfx.lost,
        };
      })()`);
      assert.equal(result.boot, 'ok webgl2', JSON.stringify(result));
      assert.equal(result.id, id);
      assert(!result.error, 'graphics errors: ' + result.error);
      assert.equal(result.lost, false);
      assert(result.samples.length === 16 && result.samples.every(x => x.junctionDraws <= 1),
        'junction signage should remain one draw per frame');
      if (count > 3) assert(result.signs > count, 'synthetic forks should make signs');
      const screenshot = await cdp('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false,
      });
      if (screenshot.data) await writeFile(new URL(count + '-pistes.png', p3Captures),
        Buffer.from(screenshot.data, 'base64'));
      const heap = (await cdp('Performance.getMetrics')).metrics;
      result.jsHeapUsed = heap.find(x => x.name === 'JSHeapUsedSize')?.value;
      result.jsHeapTotal = heap.find(x => x.name === 'JSHeapTotalSize')?.value;
      records.push(result);
      console.log('P3 Browser 3D', JSON.stringify({
        pistes: count, bootMs: result.bootMs, signs: result.signs,
        frameMs: result.frame, submissionMs: result.submission,
        draws: result.draws, signDraws: result.junctionDraws,
        heapUsed: result.jsHeapUsed,
      }));
    }
    await writeFile(new URL('../p3-browser-metrics.json', root),
      JSON.stringify({ kind: 'headless-SwiftShader-stress-NOT-hardware-FPS',
        viewport: [320, 180], quality: 2, records }, null, 2) + '\n');
  }
} finally {
  clearTimeout(timer);
  socket?.close();
  browser.kill();
  server.close();
  await delay(500);
  await rm(profile,{force:true,recursive:true});
}

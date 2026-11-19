const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fixture = require('./reality-fixture.cjs');
const src = path.join(__dirname, '../src');
const run = files => files.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const { create } = vm.runInNewContext(run(['02a_reality.js']) + '\nReality');

test('samples measured cells and their bilinear interpolation in game coordinates', () => {
  const terrain = create(fixture());
  assert.equal(terrain.height(0, 0), 0);
  assert.equal(terrain.height(5, -15), -4.375);
  assert.equal(terrain.height(10, -20), -5.75);
  assert.equal(terrain.centre(120), 5);
  assert.equal(terrain.centre(400), 0);
  assert.equal(terrain.contains(0, -399.9), true);
  assert.equal(terrain.contains(0, -400), false);
  assert.equal(terrain.contains(500, -20), false);
  assert.ok(Number.isFinite(terrain.height(10000, -10000)));
});

test('rejects missing, malformed, out-of-coverage, and uphill data', () => {
  assert.throws(() => create(), /Invalid/);
  const badGrid = fixture();
  badGrid.grid.heights.pop();
  assert.throws(() => create(badGrid), /Invalid/);
  const uphill = fixture();
  uphill.piste.points.reverse();
  assert.throws(() => create(uphill), /descent/);
  const outside = fixture();
  outside.piste.points[1][0] = 1000;
  assert.throws(() => create(outside), /coverage/);
});

test('Course retains its seeded terrain and shares Reality height with collision and camera', () => {
  const context = vm.createContext({ fixture });
  vm.runInContext('const Variants = { val: {}, def() {}, on() {} };\n' +
    run(['00_util.js', '02a_reality.js', '03_course.js']) + `
      Course.setSeed(261111);
      const procedural = Course.height(0, -50, 0.5);
      Course.setSeed(261111);
      const repeat = Course.height(0, -50, 0.5);
      Course.setReality(Reality.create(fixture()));
      const fine = Course.height(5, -15, 0.5);
      const coarse = Course.height(5, -15, 64);
      const normal = Course.normal(5, -15).slice();
      const snow = Course.snowTop(5, -15);
    `, context);
  const values = vm.runInContext('({ procedural, repeat, fine, coarse, normal, snow })', context);
  assert.equal(values.procedural, values.repeat);
  assert.notEqual(values.procedural, values.fine);
  assert.equal(values.fine, -4.375);
  assert.equal(values.coarse, values.fine);
  assert.ok(values.normal[1] > 0.9 && values.normal[2] < 0);
  assert.ok(values.snow >= values.fine);
});

test('places numbered piste signs on the DEM and uses the French difficulty colours', () => {
  const { layout, colour } = vm.runInNewContext(run(['14c_piste_markers.js']) + '\nPisteMarkers');
  const asset = require('../data/reality/alpe-dhuez.json');
  const terrain = create(asset);
  const posts = layout(terrain);
  assert.equal(terrain.difficulty, 'advanced');
  assert.equal(colour(terrain.difficulty), '#171b20');
  assert.equal(colour('expert'), colour('advanced'));
  assert.notEqual(colour('easy'), colour('intermediate'));
  assert.notEqual(colour(create(fixture()).difficulty), colour('advanced'));
  assert.ok(posts.length > 1);
  for (const [index, post] of posts.entries()) {
    assert.equal(post.number, posts.length - index);
    assert.equal(post.y, terrain.height(post.x, post.z));
    assert.ok(terrain.contains(post.x, post.z));
    assert.ok((post.x - terrain.centre(-post.z)) * (index % 2 === 0 ? 1 : -1) > 0);
  }
});

test('piste sign posts share the plate difficulty tint in the rendered shader', () => {
  const diskFills = [];
  const ctx = {
    beginPath() {}, arc() {}, stroke() {}, fillText() {},
    fill() { diskFills.push(this.fillStyle); },
    getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  };
  const { init } = vm.runInNewContext(run(['14c_piste_markers.js']) + '\nPisteMarkers', {
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) },
    SL: { common: '', fog: '' },
    Sky: { lut: {} },
  });
  let shader, draw;
  const gfx = {
    texture: () => ({}),
    buffer: () => ({}),
    pipeline: desc => { shader = desc; return {}; },
    draw: (_pipe, args) => { draw = args; },
  };
  assert.equal(init(gfx, { length: 0, start: 0, halfWidth: 18, centre: () => 0,
    contains: () => true, height: () => 0, piste: 'Test' }), null);
  for (const [difficulty, expected] of [
    ['novice', '#087a42'], ['easy', '#1259ad'], ['intermediate', '#b7212b'],
    ['advanced', '#171b20'], ['expert', '#171b20'], ['unknown', '#56616d'],
  ]) {
    diskFills.length = 0;
    const terrain = {
      start: 14, length: 440, halfWidth: 18,
      centre: () => 0, height: () => 0, contains: () => true,
      piste: 'Test', difficulty,
    };
    const markers = init(gfx, terrain);
    assert.ok(markers);
    markers.draw([0, 0, 0]);
    assert.equal(diskFills[0], expected);
    assert.equal(shader.uniforms.postColor, 'vec4f');
    assert.match(shader.fs, /M\.postColor\.rgb \* M\.postColor\.rgb/);
    const expectedChannels = expected.slice(1).match(/../g).map(h => parseInt(h, 16));
    assert.deepEqual(Array.from(draw.u.postColor.slice(0, 3), x => Math.round(x * 255)), expectedChannels);
    assert.equal(draw.u.postColor[3], 1);
  }
});

test('uses exact OSM nodes, downhill exits, and one DEM for the piste network', () => {
  const { create: createNetwork } = vm.runInNewContext(run(['02b_piste_network.js']) + '\nPisteNetwork');
  const asset = require('../data/reality/alpe-dhuez.json'), terrain = create(asset);
  const network = createNetwork(terrain, asset), sample = {};
  assert.deepEqual(asset.junctions.map(j => j.osmNode), [251693664, 253678404]);
  assert.equal(network.lookup(...network.spawn, sample), true);
  assert.equal(sample.piste.osmWay, 256295592);
  assert.equal(network.lookup(50000, 50000, sample), false);
  assert.deepEqual(Array.from(network.signs, s => [s.from, s.to, s.arrow, s.difficulty]), [
    [256295592, 256295592, '←', 'intermediate'],
    [256295592, 23257919, '→', 'advanced'],
    [23257919, 23257916, '←', 'intermediate'],
    [23257919, 23257916, '←', 'intermediate'],
  ]);
  // La Balme ends at the Campanules join. Give the player one advance
  // warning and another readable roadside board before the junction.
  const lower = asset.junctions[1], [jx, jz] = terrain.project(...lower.point);
  const campanules = network.signs.filter(sign => sign.from === 23257919 &&
    sign.to === 23257916);
  assert.equal(campanules.length, 2);
  assert.equal(campanules[0].advance, true);
  assert.equal(campanules[1].advance, false);
  const gap = sign => Math.hypot(sign.x - jx, sign.z - jz);
  assert.ok(gap(campanules[0]) > 90 && gap(campanules[0]) < 130);
  assert.ok(gap(campanules[1]) > 25 && gap(campanules[1]) < 55);
  assert.ok(gap(campanules[0]) > gap(campanules[1]) + 50);
  for (const post of [...network.signs, ...network.stakes]) {
    assert(terrain.withinDEM(post.x, post.z));
    assert.equal(post.y, terrain.height(post.x, post.z));
  }
  const broken = { ...asset, junctions: asset.junctions.map(j => ({ ...j })) };
  broken.junctions[0].outgoing = [23257916];
  assert.throws(() => createNetwork(terrain, broken), /does not share/);
});


test('supports a second resort geometry without an engine change', () => {
  const alternate = fixture();
  alternate.id = 'test-alternate-resort';
  alternate.piste.name = 'Other piste';
  assert.equal(create(alternate).id, alternate.id);
  assert.equal(create(alternate).piste, 'Other piste');
  const invalid = fixture();
  invalid.id = '../other';
  assert.throws(() => create(invalid), /Invalid/);
});

test('lazy resort loader only fetches allowlisted revisioned assets and uses browser HTTP cache', async () => {
  const data = fixture(), another = fixture();
  another.id = 'second-resort';
  const catalog = [
    { id: 'alpe-dhuez', name: 'Alpe d’Huez', network: false, revision: 'a1b2' },
    { id: 'second-resort', name: 'Second Resort', network: false, revision: 'c3d4' },
  ];
  const calls = [];
  const context = {
    document: { getElementById: id => id === 'app' ?
      { dataset: { realityCatalog: JSON.stringify(catalog) } } : null },
    fetch: async (url, options) => {
      calls.push({ url, cache: options.cache });
      return { ok: true, json: async () => url.includes('second-resort') ? another : data };
    },
  };
  const Reality = vm.runInNewContext(run(['02a_reality.js']) + '\nReality', context);
  assert.deepEqual(Array.from(Reality.catalog(), r => r.id), ['alpe-dhuez', 'second-resort']);
  assert.equal(Reality.defaultId(), 'alpe-dhuez');
  assert.equal(Reality.has('second-resort'), true);
  assert.equal(Reality.has('unknown'), false);
  assert.equal(calls.length, 0, 'reading catalog must not download DEM');
  await assert.rejects(Reality.load('../other'), /Unknown resort/);
  await assert.rejects(Reality.load('second-resort', true), /Unknown resort or piste network/);
  assert.equal(calls.length, 0, 'unknown or unsupported resort must not fetch');
  const first = await Reality.load('alpe-dhuez');
  assert.equal(first.id, 'alpe-dhuez');
  assert.equal(first.resortName, 'Alpe d’Huez');
  const other = await Reality.load('second-resort');
  assert.equal(other.id, 'second-resort');
  assert.equal(other.piste, another.piste.name);
  assert.deepEqual(calls, [
    { url: 'reality/alpe-dhuez.json?v=a1b2', cache: 'force-cache' },
    { url: 'reality/second-resort.json?v=c3d4', cache: 'force-cache' },
  ]);
  const wrong = vm.runInNewContext(run(['02a_reality.js']) + '\nReality', {
    document: context.document,
    fetch: async () => ({ ok: true, json: async () => another }),
  });
  await assert.rejects(wrong.load('alpe-dhuez'), /identity mismatch/);
  const retryCalls = [];
  const recovering = vm.runInNewContext(run(['02a_reality.js']) + '\nReality', {
    document: context.document,
    fetch: async (url, options) => {
      retryCalls.push(options.cache);
      return options.cache === 'force-cache'
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => data };
    },
  });
  assert.equal((await recovering.load('alpe-dhuez')).id, 'alpe-dhuez');
  assert.deepEqual(retryCalls, ['force-cache', 'reload']);
});

test('resort catalog is a small, separately packaged list, not DEM data', () => {
  const catalog = require('../data/reality/catalog.json');
  assert.equal(catalog.version, 1);
  assert.deepEqual(catalog.resorts.map(r => r.id), ['alpe-dhuez', 'les-deux-alpes']);
  assert.equal(catalog.resorts[1].optional, true,
    'P4 resort remains unavailable until surveyed DEM and OSM are supplied');
  assert.ok(Buffer.byteLength(JSON.stringify(catalog)) < 4096);
  const source = require('../data/reality/alpe-dhuez.json');
  assert.equal(source.id, catalog.resorts[0].id);
  assert.ok(source.grid.heights.length > 100000);
});


test('persistent resort cache reuses packs, expires revisions and caps its disk entries', async () => {
  const records = new Map(), requests = [];
  const origin = 'https://example.test/game/';
  const keyFor = key => typeof key === 'string' ? new URL(key, origin).href : key.url;
  function response(asset) {
    return { ok: true, clone() { return response(asset); }, async json() { return asset; } };
  }
  const cache = {
    match: async key => records.get(keyFor(key)) || null,
    put: async (key, value) => { records.set(keyFor(key), value); },
    keys: async () => [...records.keys()].map(url => ({ url })),
    delete: async key => records.delete(keyFor(key)),
  };
  const ids = ['alpe-dhuez', 'second-resort', 'third-resort', 'fourth-resort'];
  const catalog = ids.map(id => ({ id, name: id, network: false, revision: 'rev1' }));
  const Reality = vm.runInNewContext(run(['02a_reality.js']) + '\nReality', {
    URL, location: { href: origin },
    document: { getElementById: () => ({ dataset: { realityCatalog: JSON.stringify(catalog) } }) },
    caches: { open: async () => cache },
    fetch: async url => {
      requests.push(url);
      const asset = fixture(); asset.id = url.split('/').pop().split('.json')[0];
      return response(asset);
    },
  });
  await Reality.load('alpe-dhuez');
  await Reality.load('alpe-dhuez');
  assert.equal(requests.length, 1, 'same cached pack should not fetch twice');
  Reality.catalog()[0].revision = 'rev2';
  await Reality.load('alpe-dhuez');
  assert.equal(requests.length, 2, 'a new asset revision must fetch');
  assert.equal(records.size, 1, 'older version of the same resort must be evicted');
  await Reality.load('second-resort');
  await Reality.load('third-resort');
  await Reality.load('alpe-dhuez'); // A -> B -> C -> A should preserve A, evict B next
  await Reality.load('fourth-resort');
  assert.equal(records.size, 3, 'cache must be bounded to three resort packs');
  assert.equal([...records.keys()].some(url => url.includes('alpe-dhuez')), true,
    'revisited original resort must remain cached');
  assert.equal([...records.keys()].some(url => url.includes('second-resort')), false,
    'least recently visited resort must be evicted');
  await Reality.load('alpe-dhuez');
  assert.equal(requests.length, 5, 'recently visited resort must remain cached');
  await Reality.load('second-resort');
  assert.equal(requests.length, 6, 'evicted resort must fetch again');
});

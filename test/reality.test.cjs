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

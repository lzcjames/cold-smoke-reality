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

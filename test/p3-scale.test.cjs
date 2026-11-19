// Deterministic P3 scale gates: all extra ways are SYNTHETIC, never OSM claims.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { syntheticNetwork } = require('./p3-synthetic-network.cjs');
const source = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
const real = require('../data/reality/alpe-dhuez.json');

function modules() {
  const backing = { textures: [], buffers: [], draws: [], filled: [] };
  const ctx = {
    fillStyle: '', strokeStyle: '', font: '', textBaseline: '',
    fillRect(x, y, w, h) { backing.filled.push([x, y, w, h]); },
    strokeRect() {}, fillText() {},
    getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  };
  const gfx = {
    caps: { maxTex: 2048 },
    texture(opts) { backing.textures.push(opts); return {}; },
    buffer(data) { backing.buffers.push(data); return {}; },
    pipeline(x) { backing.pipeline = x; return { name: x.name }; },
    draw(_pipe, data) { backing.draws.push(data); },
  };
  const script = [
    '02a_reality.js', '02b_piste_network.js', '14d_junction_signs.js',
  ].map(source).join('\n') + '\n({Reality,PisteNetwork,JunctionSigns})';
  const m = vm.runInNewContext(script, {
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) },
    PisteMarkers: { colour: difficulty =>
      difficulty === 'advanced' ? '#171b20' : '#b7212b' },
    Sky: { lut: {} }, SL: { common: '', fog: '' },
  });
  return { ...m, gfx, backing };
}

test('10/50/100 synthetic ways fit in a bounded 2D sign atlas and retain original real geometry', () => {
  const original = JSON.stringify(real);
  const base = modules(), terrain = base.Reality.create(real);
  const originalNetwork = base.PisteNetwork.create(terrain, real);
  assert.equal(originalNetwork.signs.length, 4);
  for (const count of [10, 50, 100]) {
    const m = modules();
    const synthetic = syntheticNetwork(real, count);
    const network = m.PisteNetwork.create(terrain, synthetic);
    assert.equal(synthetic.pistes.length, count);
    assert.equal(synthetic.junctions.length, 2 + Math.min(count - 3, 20));
    assert.ok(network.signs.length >= count - 3 + 4,
      'every test branch should have a direction sign');
    assert.equal(network.signs.filter(x => x.to === 23257916).length, 2,
      'do not change genuine Campanules signs');
    const markers = m.JunctionSigns.init(m.gfx, network);
    assert(markers?.pipe, 'signs must initialize');
    assert.equal(markers.stats.signs, network.signs.length);
    assert.ok(markers.stats.atlasWidth <= 2048 &&
      markers.stats.atlasHeight <= 2048, 'textures must fit a 2048 GPU limit');
    assert.equal(m.backing.textures.length, 1, 'one batched atlas');
    assert.equal(m.backing.buffers.length, 1, 'one batched vertex buffer');
    assert.equal(markers.stats.vertexCount * 8, m.backing.buffers[0].length);
    assert.equal(m.backing.filled.length, network.signs.length);
    const atlas = m.backing.textures[0];
    assert.equal(atlas.w, markers.stats.atlasWidth);
    assert.equal(atlas.h, markers.stats.atlasHeight);
    assert.equal(atlas.format, 'r8', 'full-resolution monochrome glyphs use 1 B/pixel');
    assert.equal(atlas.data.byteLength, atlas.w * atlas.h);
    const values = m.backing.buffers[0];
    assert.ok(atlas.data.byteLength + values.byteLength < 10 * 1024 * 1024,
      '100-piste visual resources must not consume over 10 MiB');
    let uvCount = 0, laterRow = false;
    for (let i = 0; i < values.length; i += 8) {
      const u = values[i + 3], v = values[i + 4];
      if (u >= 0) {
        uvCount++;
        assert.ok(u <= 1 && v >= 0 && v <= 1, 'sign atlas UV outside range');
        if (v > 80 / atlas.h && atlas.h > 80) laterRow = true;
      }
    }
    assert(uvCount > network.signs.length * 5);
    if (atlas.h > 80) assert(laterRow, 'must address later atlas rows');
    for (const sign of network.signs.slice(0, 12)) {
      const found = {};
      assert.equal(network.lookup(sign.x, sign.z, found), true);
      assert.ok(Number.isFinite(found.distance));
    }
    // All draws for the active 3-band window share a single mesh/pipeline.
    const center = network.signs[0];
    markers.draw({ cam: { pos: [center.x, center.y + 4, center.z] },
      origin: [0, 0, 0] });
    assert.ok(m.backing.draws.length <= 1);
    console.log('P3 synthetic', count, {
      signs: network.signs.length, stakes: network.stakes.length,
      atlas: [atlas.w, atlas.h], vertices: markers.stats.vertexCount,
      atlasBytes: atlas.w * atlas.h, vertexBytes: values.byteLength,
    });
  }
  assert.equal(JSON.stringify(real), original, 'published DEM/OSM must remain untouched');
});

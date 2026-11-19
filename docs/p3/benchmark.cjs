#!/usr/bin/env node
// CI P3 profiling: deterministic SYNTHETIC networks, not user-visible resorts.
// This measures CPU construction/lookup and estimated graphics allocations.
// It is NOT a hardware GPU FPS benchmark, nor a replacement for JS/RSS profiling.
'use strict';
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { syntheticNetwork } = require('../../test/p3-synthetic-network.cjs');
const root = path.join(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const real = JSON.parse(fs.readFileSync(path.join(root, 'data/reality/alpe-dhuez.json'), 'utf8'));
const moduleScript = ['02a_reality.js', '02b_piste_network.js', '14d_junction_signs.js']
  .map(read).join('\n') + '\n({Reality,PisteNetwork,JunctionSigns})';
const canvasContext = {
  fillStyle: '', strokeStyle: '', font: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, fillText() {},
  getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
const env = vm.runInNewContext(moduleScript, {
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => canvasContext }) },
  PisteMarkers: { colour: x => x === 'advanced' ? '#171b20' : '#b7212b' },
  SL: { common: '', fog: '' }, Sky: { lut: {} },
});
const terrain = env.Reality.create(real);
const summary = array => {
  const a = array.slice().sort((a, b) => a - b), at = q => a[Math.floor((a.length - 1) * q)];
  return { n: a.length, median: at(0.5), p95: at(0.95), min: a[0], max: a.at(-1) };
};
const sampleCount = 2000;
const repeat = 12;
const results = [];
for (const count of [3, 10, 50, 100]) {
  const asset = count === 3 ? real : syntheticNetwork(real, count);
  const graphMs = [], lookupMs = [], atlasMs = [];
  let probe, atlasInfo, networkInfo;
  for (let i = 0; i < repeat; i++) {
    const t0 = performance.now();
    const network = env.PisteNetwork.create(terrain, asset);
    const t1 = performance.now();
    const out = {};
    let matches = 0;
    // Same world-space sweep for all sizes; no dependence on branch count.
    for (let n = 0; n < sampleCount; n++) {
      const s = 20 + (terrain.length - 45) * n / (sampleCount - 1);
      const z = -s, x = terrain.centre(s) + 14 * Math.sin(n * 0.1);
      if (network.lookup(x, z, out)) matches++;
    }
    const t2 = performance.now();
    const allocation = { textures: [], buffers: [], draws: [] };
    const gfx = {
      caps: { maxTex: 2048 },
      texture: o => { allocation.textures.push({ w: o.w, h: o.h, format: o.format }); return {}; },
      buffer: data => { allocation.buffers.push(data.byteLength); return {}; },
      pipeline: opts => ({ name: opts.name }),
      draw: (_pipe, args) => { allocation.draws.push(args.count); },
    };
    const signs = env.JunctionSigns.init(gfx, network);
    const t3 = performance.now();
    if (i === repeat - 1) {
      probe = { matches, samples: sampleCount };
      atlasInfo = { ...signs.stats, textureBytes: allocation.textures.reduce((s, t) =>
        s + t.w * t.h * (t.format === 'r8' ? 1 : 4), 0),
        vertexBytes: allocation.buffers.reduce((a, b) => a + b, 0),
        totalTrackedBytes: allocation.textures.reduce((s, t) =>
          s + t.w * t.h * (t.format === 'r8' ? 1 : 4), 0)
          + allocation.buffers.reduce((a, b) => a + b, 0),
      };
      networkInfo = { pistes: asset.pistes.length, junctions: asset.junctions.length,
        signs: network.signs.length, stakes: network.stakes.length,
        originalDEMPoints: real.grid.heights.length,
        dataBytes: Buffer.byteLength(JSON.stringify(asset)) };
      // Force one actual virtual draw call; the GPU backend is mocked here.
      const item = network.signs[0];
      signs.draw({ cam: { pos: [item.x, item.y + 5, item.z] }, origin: [0, 0, 0] });
      assert.equal(allocation.draws.length, 1, 'junction signs remain one batch');
    }
    graphMs.push(t1 - t0);
    lookupMs.push((t2 - t1) / sampleCount);
    atlasMs.push(t3 - t2);
  }
  results.push({ ...networkInfo, lookup: probe, graphics: atlasInfo, timing: {
    graphBuildMs: summary(graphMs.slice(2)),
    lookupMsEach: summary(lookupMs.slice(2)),
    atlasConstructionMs: summary(atlasMs.slice(2)),
  } });
}
const baseline = results[0];
for (const item of results) {
  item.deltaFrom3 = {
    packBytes: item.dataBytes - baseline.dataBytes,
    graphicsBytes: item.graphics.totalTrackedBytes - baseline.graphics.totalTrackedBytes,
    graphicsMiB: (item.graphics.totalTrackedBytes -
      baseline.graphics.totalTrackedBytes) / (1024 * 1024),
  };
}
const output = { kind: 'P3-synthetic-CPU-and-graphics-estimate',
  timestamp: new Date().toISOString(), platform: process.platform, node: process.version,
  method: { repeat, discardedWarmup: 2, sampleCount, textureLimit: 2048,
    graphicsBytes: 'texture pixel bytes based on format plus vertex bytes (no driver overhead)',
    warning: 'Synthetic paths only; timings are Node CPU, not FPS or physical GPU' },
  cases: results };
const outputPath = process.argv[2] || path.join(root, 'p3-scale-metrics.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
for (const r of results) console.log(JSON.stringify({
  pistes: r.pistes, junctions: r.junctions, signs: r.signs,
  graphMs: +r.timing.graphBuildMs.median.toFixed(2),
  atlasMs: +r.timing.atlasConstructionMs.median.toFixed(2),
  lookupUs: +(1000 * r.timing.lookupMsEach.median).toFixed(3),
  graphicsMiB: +r.deltaFrom3.graphicsMiB.toFixed(3),
  atlas: [r.graphics.atlasWidth, r.graphics.atlasHeight] }));
console.log('raw:', outputPath);

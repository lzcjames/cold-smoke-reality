// A second real resort may contain legitimate secondary-to-secondary OSM
// junctions. Use test-only geometry here; never persist synthetic IDs as OSM.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const script = ['02a_reality.js', '02b_piste_network.js']
  .map(p => fs.readFileSync(path.join(root, 'src', p), 'utf8')).join('\n') +
  '\n({ Reality, PisteNetwork })';
const { Reality, PisteNetwork } = vm.runInNewContext(script);
const original = require('../data/reality/alpe-dhuez.json');

test('real La Balme network stays identical after generalizing junction validation', () => {
  const terrain = Reality.create(original);
  const network = PisteNetwork.create(terrain, original);
  assert.equal(network.signs.length, 4);
  assert.equal(network.junctions.length, 2);
  const coords = network.spawn;
  const source = original.pistes.find(x => x.osmWay === 256295592);
  assert(source);
  const projected = terrain.project(...source.points[1]);
  assert(Number.isFinite(projected[0]) && Number.isFinite(coords[0]));
});

test('a test-only secondary-to-secondary fork is accepted via exact shared node', () => {
  const data = structuredClone(original);
  const terrain = Reality.create(original);
  const baseline = PisteNetwork.create(terrain, original);
  const primary = data.pistes.find(p => p.osmWay === data.piste.osmWay);
  const secondary = data.pistes.find(p => p.osmWay === 256295592);
  assert(secondary && primary);
  const index = secondary.nodes.findIndex((node, i) =>
    i > 2 && i < secondary.nodes.length - 3 && !primary.nodes.includes(node));
  assert(index >= 0, 'the known secondary OSM way has non-primary nodes');
  const point = secondary.points[index], junctionNode = secondary.nodes[index];
  assert.equal(primary.nodes.includes(junctionNode), false);
  const branchId = 9900099000; // synthetic, for test only
  const synthetic = {
    osmWay: branchId, name: 'SYNTHETIC P4 fork (not OSM)',
    difficulty: 'intermediate', nodes: [junctionNode, 9900099001],
    points: [point.slice(), [point[0] + 20, point[1] - 25]],
  };
  data.pistes.push(synthetic);
  data.junctions.push({
    osmNode: junctionNode, point: point.slice(),
    incoming: [secondary.osmWay], outgoing: [secondary.osmWay, branchId],
  });
  const network = PisteNetwork.create(terrain, data);
  assert.equal(network.junctions.length, baseline.junctions.length + 1);
  assert.deepEqual(Array.from(network.spawn), Array.from(baseline.spawn));
  assert(network.signs.some(x => x.from === secondary.osmWay && x.to === branchId),
    'directional sign should reference the synthetic exact-node branch');
  const invalid = structuredClone(data);
  invalid.junctions.at(-1).outgoing[1] = 123456789;
  assert.throws(() => PisteNetwork.create(terrain, invalid), /surveyed node/);
});

// Test-only: synthetic downhill branch geometry. NEVER commit generated ways
// or nodes into data/reality: they are not OSM survey observations.
'use strict';
const assert = require('node:assert/strict');

function syntheticNetwork(realAsset, targetPistes) {
  assert(Number.isInteger(targetPistes) && targetPistes >= realAsset.pistes.length &&
    targetPistes <= 100, 'target network size must be 3..100');
  const asset = structuredClone(realAsset);
  const main = asset.pistes.find(p => p.osmWay === asset.piste.osmWay);
  assert(main && main.nodes.length >= 8);
  const reserved = new Set(asset.junctions.map(j => j.osmNode));
  const slots = main.nodes.map((node, index) => ({ node, index }))
    .filter(({ node, index }) => index > 0 && index < main.nodes.length - 1 && !reserved.has(node));
  assert(slots.length >= 10, 'expected plenty of surveyed main-route sample nodes');
  const groups = new Map();
  const extra = targetPistes - asset.pistes.length;
  for (let n = 0; n < extra; n++) {
    const slot = slots[n % slots.length], { index, node } = slot;
    const p0 = main.points[index], pNext = main.points[index + 1];
    const delta = [pNext[0] - p0[0], pNext[1] - p0[1]];
    const d = Math.hypot(...delta);
    assert(d > 0);
    const left = [-delta[1] / d, delta[0] / d];
    // Spread branches in a short corridor inside the measured DEM,
    // alternating side and widening just enough to exercise the index.
    const branchWithinSlot = Math.floor(n / slots.length);
    const offset = (n % 2 ? -1 : 1) * (25 + branchWithinSlot * 9);
    const add = (t, sideways) =>
      [p0[0] + delta[0] * t + left[0] * sideways,
       p0[1] + delta[1] * t + left[1] * sideways];
    const id = 900000000 + n;
    const piste = {
      osmWay: id,
      name: 'SYNTHETIC (not OSM) ' + (n + 1),
      difficulty: n % 4 === 0 ? 'advanced' : 'intermediate',
      nodes: [node, 800000000000 + n * 2, 800000000001 + n * 2],
      points: [[...p0], add(0.65, offset), add(1.25, offset * 1.25)],
    };
    asset.pistes.push(piste);
    if (!groups.has(node)) groups.set(node, { osmNode: node, point: [...p0],
      incoming: [main.osmWay], outgoing: [main.osmWay] });
    groups.get(node).outgoing.push(id);
  }
  asset.junctions.push(...groups.values());
  assert.equal(asset.pistes.length, targetPistes);
  return asset;
}
module.exports = { syntheticNetwork };

#!/usr/bin/env node
'use strict';
// Audits exact OSM node identity only. Shared nodes are NOT proof of a safe,
// downhill or groomed connection; metre-nearby lines are never auto-joined.
const fs = require('node:fs');

function audit(index) {
  if (index?.source !== 'OpenStreetMap / Overpass' ||
      !Array.isArray(index.features) || !index.features.length)
    throw new Error('Expected a nonempty, attributed OSM survey index');
  const ways = index.features.filter(f => f.type === 'way' && f.drawable);
  const byNode = new Map(), byId = new Map();
  for (const way of ways) {
    if (!Number.isSafeInteger(way.id) || byId.has(way.id) ||
        !Array.isArray(way.nodes) || !Array.isArray(way.coordinates) ||
        way.nodes.length !== way.coordinates.length || way.nodes.length < 2 ||
        !way.names?.length || way.tags?.['piste:type'] !== 'downhill')
      throw new Error('Invalid or duplicate downhill OSM way');
    byId.set(way.id, way);
    const seen = new Set();
    for (let i = 0; i < way.nodes.length; i++) {
      const id = way.nodes[i], xy = way.coordinates[i];
      if (!Number.isSafeInteger(id) || seen.has(id) ||
          !Array.isArray(xy) || xy.length !== 2 ||
          !xy.every(Number.isFinite) || xy[0] < -180 || xy[0] > 180 ||
          xy[1] < -90 || xy[1] > 90)
        throw new Error('Invalid repeated OSM node or coordinate');
      seen.add(id);
      const prev = byNode.get(id) || [];
      if (prev.some(ref => ref.xy[0] !== xy[0] || ref.xy[1] !== xy[1]))
        throw new Error('Shared OSM node has conflicting coordinates');
      prev.push({ wayId: way.id, name: way.names[0], endpoint: i === 0 || i === way.nodes.length - 1, xy });
      byNode.set(id, prev);
    }
  }
  const crossings = [...byNode.entries()]
    .filter(([, refs]) => new Set(refs.map(ref => ref.name)).size > 1)
    .map(([osmNode, refs]) => ({
      osmNode,
      coordinates: refs[0].xy,
      ways: refs.map(({wayId, name, endpoint}) => ({wayId, name, endpoint}))
        .sort((a,b) => a.wayId - b.wayId)
    })).sort((a,b) => a.osmNode - b.osmNode);
  const groups = new Map();
  for (const way of ways) {
    const name = way.names[0];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(way);
  }
  const routes = [...groups].map(([name, members]) => {
    const memberIds = new Set(members.map(w => w.id));
    const visited = new Set(), components = [];
    for (const way of members) {
      if (visited.has(way.id)) continue;
      const stack = [way.id], component = [];
      while (stack.length) {
        const id = stack.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        component.push(id);
        for (const node of byId.get(id).nodes) {
          for (const ref of byNode.get(node))
            if (memberIds.has(ref.wayId) && !visited.has(ref.wayId))
              stack.push(ref.wayId);
        }
      }
      components.push(component.sort((a,b) => a-b));
    }
    return {
      name, wayCount: members.length,
      approxPlanarLengthM: Math.round(members.reduce((sum, w) => sum + (w.approxPlanarLengthM || 0), 0)),
      exactNodeComponents: components.sort((a,b) => b.length-a.length || a[0]-b[0])
    };
  }).sort((a,b) => a.name.localeCompare(b.name, 'en'));
  return {
    sourceSHA256: index.originalResponseSHA256,
    snapshotTimestampUTC: index.snapshotTimestampUTC,
    wayCount: ways.length,
    uniqueNodeCount: byNode.size,
    crossNameSharedNodes: crossings,
    routes,
    warning: 'Only exact shared OSM nodes; not certified junctions, directed downhill travel, piste boundaries, or 3D gameplay.'
  };
}

if (require.main === module) {
  const index = JSON.parse(fs.readFileSync(process.argv[2] || 'docs/p4/JANDRI-OSM-INDEX.json', 'utf8'));
  process.stdout.write(JSON.stringify(audit(index), null, 2) + '\n');
}
module.exports = { audit };

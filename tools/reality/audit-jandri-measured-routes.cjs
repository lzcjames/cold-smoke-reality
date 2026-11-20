#!/usr/bin/env node
'use strict';
/**
 * Compare official measured source-only Jandri MNT profile audit with the
 * pinned OSM node topology. Do not infer playable connections or signs.
 */
const fs = require('node:fs');
const { audit } = require('./audit-jandri-topology.cjs');
const PINNED = '40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26';

function verify(index, report) {
  const graph = audit(index);
  if (graph.sourceSHA256 !== PINNED || graph.wayCount !== 37 ||
      graph.crossNameSharedNodes.length !== 8 ||
      report?.stage !== 'full_authentic_MNT_mosaic_gate_non_publishing' ||
      report?.status !== 'complete_real_mosaic_and_profiles_not_published' ||
      report.osmSourceSHA256 !== PINNED ||
      report.tileCountExpected !== 24 ||
      !Array.isArray(report.sourceTiles) || report.sourceTiles.length !== 24 ||
      new Set(report.sourceTiles.map(t => t.tile)).size !== 24 ||
      !Array.isArray(report.crossTileEdges) || report.crossTileEdges.length !== 37 ||
      !Array.isArray(report.osmWayProfiles) || report.osmWayProfiles.length !== 37)
    throw new Error('Authentic complete measured Jandri audit required; no partial result accepted');
  if (!report.sourceTiles.every(t => /^[0-9]{4}-[0-9]{4}$/.test(t.tile) &&
        /^[0-9a-f]{64}$/.test(t.sha256) && t.bytes > 4096))
    throw new Error('Unverified original ground MNT source provenance');
  const byId = new Map();
  for (const p of report.osmWayProfiles) {
    if (!Number.isSafeInteger(p.osmWay) || byId.has(p.osmWay) ||
        !Number.isFinite(p.lengthM) || p.lengthM <= 0 ||
        !Number.isFinite(p.firstElevationM) || !Number.isFinite(p.lastElevationM) ||
        !Number.isFinite(p.netElevationChangeM) ||
        !Number.isFinite(p.cumulativeAscentM) || p.cumulativeAscentM < 0 ||
        !Number.isFinite(p.cumulativeDescentM) || p.cumulativeDescentM < 0 ||
        !Number.isFinite(p.maxAbsoluteSampleGradePct) || p.maxAbsoluteSampleGradePct < 0 ||
        !Number.isSafeInteger(p.sampleCount) || p.sampleCount < 2 ||
        p.direction !== 'unconfirmed_not_implied_by_OSM_node_order')
      throw new Error('Uncertified or invalid measured OSM way profile');
    if (Math.abs(p.lastElevationM-p.firstElevationM-p.netElevationChangeM) > .04 ||
        Math.abs(p.cumulativeAscentM-p.cumulativeDescentM-p.netElevationChangeM) > .04)
      throw new Error('Profile elevation/accounting consistency failed');
    byId.set(p.osmWay, p);
  }
  const ways = index.features.filter(w => w.type === 'way' && w.drawable);
  if (ways.some(w => !byId.has(w.id)) || byId.size !== ways.length ||
      report.crossTileEdges.some(e => e.validPairs !== 2000))
    throw new Error('Missing source way or invalid adjacent ground edge');

  const waySummary = ways.map(w => {
    const p = byId.get(w.id);
    // Overall end-to-end trend is not proof of a safe directed piste.
    const trend = Math.abs(p.netElevationChangeM) < 1
      ? 'endpoints_near_equal'
      : (p.netElevationChangeM < 0 ? 'OSM_order_end_lower' : 'OSM_order_start_lower');
    return {
      osmWay: w.id, names: w.names, osmDifficulty: w.tags['piste:difficulty'] || null,
      measured: {
        lengthM: p.lengthM, startM: p.firstElevationM, endM: p.lastElevationM,
        netM: p.netElevationChangeM, ascentM: p.cumulativeAscentM,
        descentM: p.cumulativeDescentM, maxSampleGradePct: p.maxAbsoluteSampleGradePct
      },
      endpointTrendOnly: trend,
      approvedDownhillDirection: null,
      approvedDifficulty: null,
      reason: 'Source DEM supplies measured height, not skiable direction, safe width, or piste operator grading.'
    };
  }).sort((a,b) => a.osmWay-b.osmWay);

  const waysById = new Map(ways.map(w => [w.id, w]));
  const candidates = graph.crossNameSharedNodes.map(node => {
    const evidence = node.ways.map(w => {
      const way = waysById.get(w.wayId), p = byId.get(w.wayId);
      const pos = way.nodes.indexOf(node.osmNode);
      const endpoint = pos === 0 ? 'first' : pos === way.nodes.length-1 ? 'last' : 'interior';
      return {
        osmWay: w.wayId, name: w.name, locationInWay: endpoint,
        measuredNodeHeightM: endpoint === 'first' ? p.firstElevationM :
          endpoint === 'last' ? p.lastElevationM : null
      };
    });
    const endpointSamples = evidence.filter(e => e.measuredNodeHeightM !== null);
    const delta = endpointSamples.length > 1 ?
      Math.max(...endpointSamples.map(e=>e.measuredNodeHeightM)) -
      Math.min(...endpointSamples.map(e=>e.measuredNodeHeightM)) : null;
    return {
      osmNode: node.osmNode, coordinates: node.coordinates,
      ways: evidence, endpointHeightSpreadM: delta === null ? null : +delta.toFixed(2),
      approvedAsSkiJunction: false, approvedSignage: false,
      reason: 'Shared original OSM node is only a junction candidate; interior-node height and local traversability are not certified.'
    };
  });
  return {
    stage: 'measured_profiles_review_only_not_playable',
    osmSourceSHA256: PINNED, wfsSourceSHA256: report.wfsSourceSHA256,
    officialRasterCount: 24, measuredOSMWayCount: waySummary.length,
    sharedNodeCandidates: candidates.length, approvedJunctions: 0,
    approvedPlayableWays: 0, waySummary,
    junctionCandidates: candidates,
    outstanding: [
      'Measure each shared-node height and directed local slope at original OSM nodes.',
      'Verify safe downhill/transition edges and piste operator grading, not just total height change.',
      'Confirm groomed piste boundaries and hazards independently of bare-earth MNT.',
      'Publish no 3D gameplay pack until terrain, collisions and browser tests pass.'
    ]
  };
}

if (require.main === module) {
  const index = JSON.parse(fs.readFileSync(process.argv[2] || 'docs/p4/JANDRI-OSM-INDEX.json','utf8'));
  const report = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const result = verify(index, report);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
module.exports = {verify};

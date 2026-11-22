# Bounded on-demand DEM tile loading (source-only prototype)

The browser now has an opt-in module `TerrainTileCache.create(manifest, options)`
that implements the first **data loading layer** for the whole Les Deux
Alpes grid. This module is included in the code bundle but **never invoked
on ordinary game boot** and does not change skier ground-contact physics.

A verified `cold-smoke-measured-tiles-staging/v1` manifest produced by
`tools/reality/tile_measured_dem.cjs` can be supplied with a local fetch
callback and a SHA-256 implementation:

```js
const digest = async raw => {
  const bytes = new TextEncoder().encode(raw);
  const sha = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(sha)].map(x => x.toString(16).padStart(2, '0')).join('');
};
const loader = TerrainTileCache.create(stagingManifest,{
  fetchTile: async filename => {
    const response=await fetch('staging/' + filename);
    if(!response.ok) throw Error('Source tile unavailable');
    return await response.text();
  },
  digest, maxResident: 4
});
const names=loader.nearby(projectedEast,projectedNorth,100);
const sourceOnlyTile=await loader.acquire(names[0]);
```

The loader checks each response's **exact byte count, SHA-256,
official-source identity and measured georeference**, and keeps only a
bounded number of resident tiles. Concurrent requests for the same
tile are deduplicated and corrupted responses are never cached.

**Do not register this manifest as a playable resort.** The source
tiles all explicitly reject gameplay approval, and no automatic snow
collision, piste boundaries, lift arrivals or renderer geometry are
inferred. To make this live, we still need a separately reviewed
game-ready DEM scene interface, continuous collision seams, slope
direction verification and a dedicated frame-time/stability regression.
Until then the existing single-DEM skiing physics remain unchanged.

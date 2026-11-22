# Synchronous measured DEM height snapshots (not player collision yet)

The source-only height pipeline now has a deterministic, synchronous
last stage:

1. Read original IGN WFS and source MNT data, verify real terrain and
   audit the OSM way source identities.
2. Export the measured 15m Jandri 2 staging grid.
3. Partition into 64-cell overlap-safe chunks, verified by SHA-256.
4. Prefetch selected chunks with `TerrainTileCache` away from physics.
5. Build `TerrainHeightSnapshot.create(manifest, acquiredTiles)` from
   already loaded, verified source chunks.
6. Query `snapshot.sample(east,north)` synchronously with **no network
   fetch, no Promise and no per-query heap array**.

This snapshot makes its own fixed Float32 copies of verified heights, so
cache eviction or a later mutable tile view cannot move ground under the
skier. All overlapping original grid-node heights must agree within
0.002 metres **before** making the snapshot visible to a caller. Outside
fully loaded detailed ground it returns `null`; there is no fabricated
snow surface, distant fallback or approximate piste join.

## Genuine original raster evidence

Latest non-publishing IGN workflow:
[run 45052165038](https://github.com/lzcjames/cold-smoke-reality/actions/runs/45052165038).
Its actual 140×68 Jandri 2 15m output was independently inspected:

- 6 source-only DEM chunks, 9,520 unique original height cells.
- 9,798 stored cells when including shared margins.
- 278 repeated adjacent edge/corner height observations.
- **0 mismatches among all 278 repeated original source heights.**
- Original elevation minimum 1,966.93m and maximum 2,647.92m.

This is real measured terrain integrity, not a skier collision or
piste safety guarantee.

## Next game gate

The snapshot explicitly carries `approvedForGameplay:false` and
`readyForPhysics:false`; it is not wired into the game's `Course`,
collision sampler or WebGL terrain mesh. A future separate gameplay
PR must align the player's local metre frame with Lambert-93,
prefetch and double-buffer all nearby verified chunks, refuse movement
into unloaded/no-data terrain, retain a fixed 60fps ground sampler,
add adjacent-tile skier-contact regression, and only approve real piste
boundaries, hazards, exits and route directions after audited evidence.

Never call asynchronous `cache.acquire` within the ski movement loop,
and never let a missing tile fall back to an invented elevation.

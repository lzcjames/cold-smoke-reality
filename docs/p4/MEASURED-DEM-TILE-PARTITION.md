# Reusable small DEM tile packaging (staging only)

Cold Smoke Reality can no longer scale by embedding a complete mountain
raster into the HTML shell. For each independently verified DEM staging
grid, run:

```sh
node tools/reality/tile_measured_dem.cjs \
  jandri2-measured-grid-staging.json /tmp/jandri2-source-tiles 64
```

Each source-only output chunk holds at most 64×64 elevation cells. Tile
borders deliberately overlap by one *original measured height sample*
so no extra terrain height is extrapolated at seams. Each tile has a
distinct SHA-256, numeric EPSG:2154 extent and byte budget. The manifest
records the original complete source-grid SHA-256. After writing chunks,
the tool reconstructs and checks **every original height value and the
shared borders**; it fails on missing, replaced, oversized or divergent
tiles.

The actual 140×68, 15m Jandri 2 staging grid should produce **six**
small terrain chunks. They are NOT currently published to GitHub Pages
or registered in `Reality.load`; an actual runtime streaming/LOD
renderer requires separate integration, measured render/collision
continuity validation and memory/LRU constraints.

Every source tile and index remains `approvedForGameplay:false`.
Tile splitting proves exact data integrity only; it does not approve
a resort-wide skiable surface, groomed boundaries, avalanche hazards,
lifts, named downhill joins or new terrain physics.

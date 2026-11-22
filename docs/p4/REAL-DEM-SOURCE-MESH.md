# Genuine IGN DEM: source-only triangle mesh staging

`TerrainSourceMesh.fromMeasuredTile(tile, origin)` turns an **already
verified, acquired source tile** into finite, metre-relative triangle
positions, normals and indices. It is not called by game boot and does
not change skier contact, routes, GPU asset loads or existing
rendering. Mesh output is explicitly
`approvedForGameplay:false` and `readyForCollision:false`.

## Spatial conventions

Original DEM samples are stored top (north) to bottom (south) and
left (west) to right (east), all in EPSG:2154 metre coordinates.
The mesh uses local X=east-originEast, local Z=originNorth-north,
local Y=realAltitude-baseElevationM. Upward triangle winding for flat
ground is independently regression-tested.

**Important:** the game renderer must not assume those local
coordinates equal its own scene origin without a separately reviewed
Lambert-93 → live-game-metre transform. Large absolute EPSG:2154
coordinates must never be used directly as GPU float32 positions.

A 64×64 sample tile generates 4,096 vertices and 7,938 triangles.
The builder rejects all missing source heights, nonfinite coordinates,
unknown tile naming, and over-budget geometry. It generates no
off-piste boundaries and does not infer piste widths, hazard limits,
lift stations or downhill routing.

## Already verified

The six authentic Jandri 2 source tiles contain identical shared
height samples from official IGN source; their source-only
piecewise triangle mesh has the same original shared geometry.
Separate tests verify local-metre positions at adjacent tile edges,
flat-surface upward normals, measured slope normals and small mesh
budgets.

**Next independent release gates:** original source authorization
and piste membership, real local frame alignment, bounded WebGL
buffer creation/eviction, no-height fallback outside verified
ground, and browser skier-contact stability along tile seams.

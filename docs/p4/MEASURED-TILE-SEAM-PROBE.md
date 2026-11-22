# Diagnostic source-DEM seam sampler (not active gameplay)

The terrain cache's source tiles have overlapping original height cells.
`TerrainTileProbe.create(sourceOnlyCache)` supports **asynchronous,
diagnostic-only** interpolation in Lambert-93 metres. At a shared
boundary it queries both independently loaded tiles and rejects
differences greater than 0.001m. Outside genuine detailed ground it
returns `null`, never an invented height or fallback slope.

This is an important precursor to the future live skier terrain-contact
implementation, but is not itself a skiable surface: neither the
`Course` ground sampler nor the visual renderer uses this module.
The CI tests check identical source-height continuity, deliberately
corrupted shared borders, invalid requests and missing detailed ground.

The final game integration still needs a deterministic synchronous
height buffer, controlled LOD, zero-allocation collision sampling,
terrain streaming around skier position, and performance/wobble
regression in a real browser. An asynchronous data fetch cannot be
placed directly in a 60fps collision calculation.

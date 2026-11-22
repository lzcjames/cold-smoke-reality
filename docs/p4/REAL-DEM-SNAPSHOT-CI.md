# Exhaustive real IGN Jandri 2 height sampler gate

This adds a real-data regression for the source-only measured DEM workflow.
The full 24-tile official MNT reconstruction already creates six small,
source-verified Jandri 2 tiles. The CI now exercises the same synchronous
height sampler that will eventually be used after a separate gameplay
approval, instead of stopping at checksums.

## What the new gate verifies

`tools/reality/audit_real_dem_snapshot.cjs`:

- Checks the archived six chunks can reproduce the exact original DEM
  source grid and are still marked non-playable.
- Creates an immutable, synchronous snapshot from **already loaded**
  chunks: no download, Promise or per-query fetch in this test.
- Evaluates **all 9,520 original source vertices** against their actual
  measured altitude, accounting for the snapshot's Float32 format.
- Evaluates the **9,313 interpolated cell midpoints** independently of
  the snapshot, ensuring no incorrect seam coordinates or bilinear
  sampling at tile edges.
- Independently audits all **278 redundant original grid-node
  observations** along the overlapping borders. The measured archived
  source contained **zero discrepant observations**.
- Verifies the edge outside the entire measured crop is **null**, not
  a generated or extrapolated mountain surface.
- Writes `jandri2-real-snapshot-evidence.json` with maximum altitude
  deviation, checked nodes and no-gameplay flags.

A failed source hash, missing chunk, changed height, wrong georeference,
interpolation mismatch, or false gameplay approval stops the CI run.

## What this does NOT do

It does not modify the player, scene renderer, snow-contact physics,
course routing, lift transit, route safety boundaries or production
resort data. The real measured crop spans only the lower Jandri 2
source area and is **not** evidence that all of Les Deux Alpes is
playable. The source-only integrity gate remains
`approvedForGameplay:false` and `readyForPhysics:false`.

Future release stages need an independently approved local-metre
reference frame, deterministic ground buffering across newly acquired
regions, visible mesh LOD and actual browser skiing stability tests.

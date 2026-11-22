# Les 2 Alpes · Whole-resort implementation contract

> Status: **not yet a whole-resort playable map**. This document is a development contract, not a claim of delivered terrain. Jandri is one region of the target ski domain, not a separate game level.

## What is actually playable now

The asset `data/reality/les-deux-alpes.json` currently exposes three measured piste starts: Petites Crêtes (OSM way 643745486), Vallons du Diable (643786947), and Diable 1 (219409078). `test/les-deux-alpes-piste-entry.test.cjs` intentionally checks this and asserts that its DEM crop stays below 2600 m. The glacier and higher Jandri terminals **must not** be inferred from this crop.

This scope is smaller than the product goal: **a connected, navigable, full Les 2 Alpes resort** with terrain, piste network, lift travel and off-piste/non-skiable distinctions. The previous Hemu-world-style importer (`tools/reality/import_portable_resort.cjs`) accepts separately decoded world JSON but exports metadata only. Do not execute arbitrary archive JavaScript, and do not confuse an inventory with a playable import.

## Survey before drawing

1. Use the user's **official winter piste plan** as the **coverage/sector checklist**, not as an elevation source or automatically georeferenced line geometry.
2. Obtain a date-pinned OSM/Overpass export covering **all** of Les 2 Alpes, including downhill pistes, gondolas/chairlifts, stations, and shared route nodes. Source way IDs and exact shared nodes are required for claimed network connections; apparent visual proximity is not proof.
3. Compare the pinned OSM index with official map names/sectors. Treat discrepancies as unresolved, not permission to invent a segment.
4. Obtain and license an IGN or Copernicus elevation mosaic covering the full village-to-glacier footprint (with a margin); record bbox, datum/CRS, timestamp, checksums and valid-data extent. No fake glacier heights.
5. Report counts of mapped, validated and missing piste/connection/lift geometry **per sector**. Declare full coverage only when corroborated by actual sources.

Relevant existing foundations: `tools/reality/index_regional_overpass.cjs`, `tools/reality/report_resort_inventory.cjs`, `tools/reality/resort_wide_inventory.cjs`, `src/02a_reality.js`, `src/02b_piste_network.js`.

## Runtime data architecture

The legacy `Reality.create` accepts one dense grid with dimensions capped at 1200 × 1200; this is not a suitable model for arbitrary resort-wide detail. Extend rather than silently replacing it:

- A **resort manifest** lists geographic bounds, projection (EPSG:2154), source metadata, sector IDs, terrain tiles, piste graph and lift graph references.
- **Terrain tiles** have globally aligned grid coordinates and shared border samples. Query routines (`height`, `altitude`, `withinDEM`) must return a continuous surface across tile edges and a defined unavailable/pending result outside verified coverage. Physics and camera must consume the same authoritative heights as rendering.
- Stream nearby terrain and decorations based on skier/camera position, with limited cache, prefetch along velocity and an LOD hierarchy. Keep the title HTML lightweight; do not inline a full-resort DEM. Avoid blocking the skier at a streaming boundary.
- Use projected world coordinates and a stable geographic transform through all sectors: no reorienting world axes at each piste, and no independent mini-level loading at junctions.
- Build directed downhill piste links only from verified geometry and downhill elevation checks. Include clear metadata distinguishing groomed area, off-piste, impassable terrain and unknown status. An OSM centreline alone does **not** verify actual piste width or hazards.
- A lift is a **network transition** between verified terminal locations. First version may use a concise simulated ride or a fast-travel command; no costly moving cabins needed.
- Reuse the existing ski solver and graphics backends. Changes to terrain streaming must not regress the PR #68 contact stability work.

## Delivery order / gates

| Gate | Deliverable | Acceptance check |
| --- | --- | --- |
| 1 | Official sector coverage table + pinned full-resort OSM/lift snapshot + DEM source manifest | Every geometry is source-attributed; unresolved sectors explicitly marked |
| 2 | Two or more **real** adjoining DEM tiles and a tile-aware terrain adapter | Identical seam heights/normals, safe missing-tile behavior, reproducible sample tests |
| 3 | Multi-sector downhill graph and validated spawn choices | Route points within verified DEM, proper junctions, unchanged Alpe d'Huez |
| 4 | Lift graph and terminal transitions | Verified endpoints; safe spawn; no invented 2600/3200 endpoints |
| 5 | Full official sector coverage, scenery and signage | One connected resort where source evidence permits; missing data disclosed |
| 6 | Browser/playability and performance regression | WebGL2/WebGPU, contact stability, near-camera streaming, GitHub Pages deployment |

## Non-goals and safeguards

- Do not increase the menu piste count without real world coordinate coverage.
- Do not promise *all runs playable* just because an OSM tag or an official map label was indexed.
- Do not substitute procedural snow hills for a claimed surveyed geography.
- Do not conflate Alpe d'Huez pistes with Les 2 Alpes.
- Do not treat a user-provided Hemu sample as automatically available in the current repository; read its actual bytes before reusing it.
- Do not merge an implementation PR until CI and comparable browser stability tests pass.

## Immediate next engineering task

Review the current pinned region source, identify uncovered official sectors and required DEM extent, then implement the smallest verified adjacent-tile prototype with seam and skiing-contact tests. Only after tile continuity is established should the full piste/lift network be wired in.

## Current measured DEM tile export prototype

The existing shipped Les Deux Alpes Reality asset has a **124 × 126**
height sample grid at 15 m spacing, covering approximately 1,845 ×
1,875 metres of ground (not the whole ski resort). The exporter uses
the existing values exactly, including partial east/south edge tiles.

```sh
node tools/reality/export_dem_tiles.cjs \
  data/reality/les-deux-alpes.json /tmp/les2alpes-dem-tiles 41
node --test test/export-dem-tiles.test.cjs test/tiled-dem.test.cjs \
  test/tile-stream.test.cjs
```

The CLI creates `manifest.json` and source-exact JSON tiles with
SHA-256 hashes. With a 41-sample nominal side, the current crop becomes
16 overlapping tiles. No additional GIS coverage has been added, and
the file output is intentionally not automatically shipped by the
website build. The active 3-piste mode stays on the previous verified
single-grid loader until real multi-sector coverage, camera, and
collision validation are ready.

**Source data and use:** preserve the original licensed DEM provenance
from the Reality asset; the tile manifest hash alone does not establish
provenance or legal rights to new datasets.

## A/B measured tile collision experiment

The current real Les Deux Alpes crop can be tested through the new
tile-height adapter **without turning it on for ordinary players**:

```
?reality=les-deux-alpes&network=1&tileCollision=1
```

The `tileCollision=1` developer flag partitions the already loaded,
source-verified lower-sector grid into overlapping measured 41-sample
tiles in memory **before** the first camera or physics query. The live
`Reality.height` and `Reality.altitude` functions then query those
tiles, so skier collision and terrain rendering share the same heights.
Outside the original DEM grid, the renderer retains the prior clamped
edge behavior. The skier cannot unlock any new unmeasured terrain.
No async tile swapping occurs during skiing in this experiment.

The automated `test/reality-tile-preview.test.cjs` probes real sampled
and sub-cell heights against the original single-grid sampler (when the
optional licensed asset exists), including multiple tile seams, and
checks Alpe d'Huez does not opt into this flag. This is a preparatory
A/B gate, **not** full streaming, new piste coverage or proof of smooth
physical gameplay on real hardware.

## Separate published DEM file preload (developer option)

When the licensed Les Deux Alpes source asset is present, `node build.js`
now also exports a **source-identical experimental pack** to
`dist/reality/les-deux-alpes-tiles/`. Normal resort play still uses the
original single JSON pack. The opt-in URL is:

```text
?reality=les-deux-alpes&network=1&tileStream=1
```

At boot, the external experiment fetches the manifest and each of the
measured tiles (maximum three in flight), verifies SHA-256 against the
manifest, cross-checks the original source grid checksum, checks seam
compatibility and every original height sample, and only **then** allows
the terrain to serve shared render/physics height queries. A missing,
modified, incomplete or mismatched pack fails startup rather than falling
back to fabricated slopes.

This demonstrates separate-file loading into a live Reality height
provider. **It does not yet stream/unload tiles while moving**, and does
not increase the geographic extent beyond the lower measured crop.
Use `tileCollision=1` for the older in-memory A/B control experiment.

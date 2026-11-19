# P4 — Les Deux Alpes geometric fidelity audit (2026-11-19)

**Purpose:** distinguish verified geographical source data from the appearance of a photorealistic / complete piste network. This document does **not** claim that the simulated slopes match surveyed run boundaries or that all official paths are reproduced.

## Source records actually used in the live resort pack

- OSM centreline geometry: snapshot **2026-07-24T11:04:51Z**, with source SHA-256 pinned in `data/reality/les-deux-alpes.json`.
- Terrain: **IGN LiDAR HD MNT 0.5 m** ground model with original raster file SHA-256 manifests in prior [P4 proof run](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44546686678); shipped game DEM is a **15 m** grid, 124 columns × 126 rows, using interpolation, not native 0.5 m raster.
- The **two exact shared OSM nodes** are 6057592057 and 6057592113. The release's directed OSM graph was validated with actual ground heights. An exact shared OSM vertex is not a fully surveyed 3D intersection or a ski patrol guarantee.

| Actual OSM way used | Name in game | OSM vertices | Game centreline length | Approx. sampled start → end elevation | Why this is not necessarily an entire official run |
| --- | --- | ---: | ---: | ---: | --- |
| 219409078 | Diable 1 | 15 | 1,309 m | 2,406 → 1,804 m | A selected OSM way segment, not an established official full-route polygon |
| 643745486 | Petites Crêtes | 26 | 618 m | 2,403 → 2,348 m | A short way segment, not an authenticated piste footprint |
| 643786947 | Vallons du Diable | 76 | 2,644 m | 2,382 → 1,700 m | A selected OSM way; official cartographic naming/edition may vary |

Lengths are the sum of planar EPSG:2154 distances between the pinned asset's OSM vertices, not tape-measured piste centreline distances or the length of an officially defined ski itinerary. Elevations are interpolations from the shipped 15 m web grid, not direct measurements of each 0.5 m source pixel.

## What the player sees that is estimated

- **Piste width is fixed at 36 m** in `src/02a_reality.js`: `halfWidth = 18`. A centreline from OSM is not an OSM polygon of actual piste edges; this width is a gameplay estimate **applied uniformly to all routes**.
- Rendered snow surface, lighting, trees, markers and surrounding scenic details are programmatically generated. The 15 m downsampling and the renderer can alter the appearance of tight turns and small snowbanks.
- The game does **not** currently reconstruct every lift, building, trail boundary, official piste junction layout, or the full Les Deux Alpes resort.
- Generated road signs denote game-route connections. They are **not** surveyed or licensed copies of real resort signage.

## Independent references for visual review

- [Official Les 2 Alpes resort map and sector description](https://www.les2alpes.com/winter/discover/skiing-in-les-2-alpes/ski-area/sectors-and-runs/)
- [Official resort ski map index](https://www.skipass-2alpes.com/en/resort-maps/)
- [Diable 1, operator trail entry](https://explore.les2alpes.com/en/ski-trails/diable-1)
- [Petites Crêtes, operator trail entry](https://explore.les2alpes.com/fr/pistes-de-ski/petites-cretes)

Use the official map as a *visual reference only*: it is a stylized diagram, not a georeferenced GIS boundary dataset. Do not trace its illustrated paths as surveyed positions or redistribute operator map artwork without separate rights.

## Next fidelity gates (still open)

1. Obtain licensed *actual piste boundary polygons / corridor width observations* for these three OSM segments. Until then, do not call the fixed 36 m gameplay corridor a real width. If widths vary, preserve per-piste values in independent metadata and allow each route to render/collide consistently.
2. Verify whether the selected OSM way IDs cover the operator's entire named pistes or only portions. Review historic OSM segmentation and naming changes; compare with official route maps **without treating artistic diagrams as metric geometry**.
3. Evaluate scenery improvements using real screenshots and repeatable WebGL2/WebGPU benchmarks. Never smooth away the real MNT elevation evidence without retaining a measurable before/after slope and collision check.
4. Preserve Alpe d'Huez geometry and independent lazy asset loading. Always rerun the exact-node identity audit `node test/p4-truth-in-geometry.cjs` as a release gate.

**Status:** Authentic source geometry and terrain are proven for the selected 3-way subset; complete visual/on-snow fidelity is **not** proven.

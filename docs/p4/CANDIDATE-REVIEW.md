# P4 Les Deux Alpes — measured candidate assessment (2026-11-19)

**Status: investigation only. Do not publish a three-piste pack yet.**

## Reproducible evidence

- [GitHub Actions survey and DEM probe](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44531317057), with two archived artifacts: `p4-les-deux-alpes-osm-survey` (original OSM JSON and source audit) and `p4-real-dem-probe` (unpublished single-piste JSON and report).
- OSM source timestamp: `2026-07-24T11:04:51Z`; snapshot contains 339 elements. The filtered audit reported 201 named downhill ways, 166 exact shared-node candidates, and a largest undirected connected component of 177 ways. The last two quantities **do not** imply directionally skiable connectivity.
- Copernicus DEM GLO-30 is a **DSM**, not IGN RGE ALTI ground terrain. Source tiles are N44 and N45, with SHA-256 values preserved in the archived `p4-dem-probe-report.json`. The sampled grid in the unpublished Diable 1 probe is 251 × 292 cells at 15 m. Interpolating the 30 m DSM to 15 m does not create 15 m source resolution.
- The earlier probe validated Diable 1 alone, not the multi-piste import or a player-visible three-piste scene.

## OSM exact-node evidence

| Way | OSM name | DEM sampled endpoints (metres) | Endpoint descent | Strict uphill adjacent samples |
| --- | --- | --- | --- | --- |
| 219409078 | Diable 1 | 2404.7 → 1804.0 | 600.6 m | 0 |
| 643745486 | Petites Crêtes | 2406.1 → 2349.5 | 56.6 m | 2 |
| 643786947 | Vallons du Diable | 2379.8 → 1703.4 | 676.4 m | 9 |

Those are preliminary **vertex samples**, not piste grades or a complete skiability judgement. Heights use bilinear interpolation of the archived Copernicus-derived 15 m grid. Node coordinates were projected from WGS84 to EPSG:2154; local upslope samples can arise from OSM geometry, DSM artifacts or genuine terrain changes. Do not treat the count alone as a release failure or proof of skiing impossibility.

- **Node 6057592057** links Diable 1 and Petites Crêtes exactly (approximately 2373.4 m in the sampled grid).
- **Node 6057592113** links Diable 1 and Vallons du Diable exactly (approximately 1804.0 m).
- Petites Crêtes and Vallons du Diable share **no** OSM node in the retained source.
- In the original source ordering, the Vallons du Diable node is near a locally uphill/flat set of samples (`1801.9, 1803.0, 1804.0, 1804.7, 1803.8` m). Whether the directed 12–25 m junction descent threshold is satisfied **has not been established**.


## Directed junction gate (measured, 2026-11-19)

A second examination of the **original archived** OSM JSON and unpublished Copernicus-derived asset evaluates the exact directed-junction rule already implemented in `tools/reality/network.py`. Each waypoint is transformed from WGS84 to EPSG:2154, and terrain height is bilinearly interpolated from the archived 15 m game grid. For each path direction at the node, interpolate along the source line to 25 m, then calculate `(height_at_node - height_at_25m) * direction`, where direction is `-1` for upstream/incoming and `+1` for downstream/outgoing. The existing importer accepts a direction only if that value is at least 0.5 m and the path has at least 12 m of length.

| Shared OSM node | Way | Incoming 25 m test | Outgoing 25 m test |
| --- | --- | ---: | ---: |
| 6057592057 | Diable 1 (219409078) | +11.32 m, passes | +12.13 m, passes |
| 6057592057 | Petites Crêtes (643745486) | +2.37 m, passes | -0.07 m, fails |
| 6057592113 | Diable 1 (219409078) | +11.31 m, passes | End of OSM way, unavailable |
| 6057592113 | Vallons du Diable (643786947) | -1.85 m, fails | -0.33 m, fails |

All values are approximate, specific to the archived Copernicus **DSM**, and must not be presented as survey-grade piste grades. The exact-node test is satisfied at both nodes, but **node 6057592113 has no accepted downhill outgoing path** among these selected ways under the current 25 m / 0.5 m rule. A combined three-way P4 import is therefore **blocked** with the available DSM. Node 6057592057 also does not provide a confirmed two-way outgoing fork: Petites Crêtes has no acceptable outgoing direction there.

**Do not loosen `network.py` thresholds to force the route into production.** Obtain finer ground elevations (preferably IGN RGE ALTI) and reassess exact-node connections, or choose a different surveyed real set of 3–5 ways. Do not assert that a sampled DSM rise proves an officially mapped ski run is unskiable in real life. These findings apply to the candidate game route and this DEM dataset only.

## Release gates

1. Reproduce the import using the original pinned OSM artifact and source-identified DEM tiles; record checksums and source licence. Independently check provenance.
2. Run `tools/reality/p4_import.py` on the three selected actual way IDs with a crop that covers all selected lines plus at least its 20 m guard margin; confirm explicit downhill directional junction checks, primary monotonicity and all-way connectivity. Do not weaken the checks just to make this selection pass.
3. If any junction fails, investigate with a finer **ground DEM** (preferred IGN RGE ALTI) and/or select alternative real OSM ways; record the exact reason. A geometric overlap or shared OSM node is not sufficient.
4. Only after passing the real-data gates, stage `data/reality/les-deux-alpes.json`, run the build/test/browser checks on both renderers and inspect actual terrain, collision, sign placement and memory. Keep the optional resort unavailable until acceptance.

This report records a genuine measured **candidate**, not a playable second ski area.

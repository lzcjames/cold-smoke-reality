# Jandri authentic IGN MNT: batch-two numerical audit

This report documents the **corrected disjoint** second raster batch,
GitHub Actions run https://github.com/lzcjames/cold-smoke-reality/actions/runs/44637043402
(2026-11-19; `p4-jandri-four-real-ign-rasters-audit`, artifact 14584816087).
Official original IGN WFS metadata source remains run 44635187118.
These are *real IGN LiDAR HD MNT* GeoTIFF downloads, **not** game assets.

Initial two-tile pilot (run 44636013026) verified `0945-6438` and
`0946-6438`. An initial four-tile batch incorrectly re-downloaded
`0946-6438`; that first pass was not counted as four *additional*
distinct tiles. Corrected batch selection explicitly excludes the two
actual pilot IDs; regression tests assert disjoint batches.

| Distinct newly verified Lambert-93 tile | Valid elevation fraction | Minimum (m) | Maximum (m) |
| --- | ---: | ---: | ---: |
| 0945-6439 | 100% | 1237.813 | 1982.401 |
| 0945-6440 | 100% | 1645.919 | 2040.503 |
| 0946-6439 | 100% | 1392.272 | 1943.899 |
| 0946-6440 | 100% | 1646.708 | 1952.771 |

The 0.5 m, EPSG:2154 footprint and origin checks passed on all four.
Original downloaded file hashes and versions are in the artifact manifest,
not redistributed rasters. The batch also sampled 2000 paired elevations
at each touching edge:

| Shared edges | Maximum absolute neighbour pixel difference | 95th percentile |
| --- | ---: | ---: |
| 0945-6439 → 0946-6439 | 4.224 m | 0.562 m |
| 0945-6439 → 0945-6440 | 2.366 m | 0.263 m |
| 0945-6440 → 0946-6440 | 0.552 m | 0.352 m |
| 0946-6439 → 0946-6440 | 4.286 m | 0.237 m |

Those are differences between two *adjacent* raster cell centres, not
coincident surveyed heights; nonzero differences can be real steep
terrain, so no seam repair is inferred.

**Cumulative unique rasters verified: 6 of 24.** The remaining 18 tiles,
full coverage, OSM downhill altitude profiles, route joins, rendering and
skiable 3D terrain are not validated. No release-game source or HTML
changed, and no raw MNT rasters were committed or published.

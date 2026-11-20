# Jandri LiDAR HD MNT — all 24 source rasters independently verified

**Status: completed original-raster acquisition/individual-file validation for
the pinned 37-OSM-way screening footprint. This is NOT a published 3D resort.**

The original IGN WFS metadata and 24/24 official `url_mnt` coverage were
archived in [the live index audit](JANDRI-MNT-LIVE-COVERAGE.md).
The first twelve distinct official 1 km tiles were checked in
[JANDRI-MNT-RASTER-PILOT.md](JANDRI-MNT-RASTER-PILOT.md),
[JANDRI-MNT-BATCH-TWO.md](JANDRI-MNT-BATCH-TWO.md), and
[JANDRI-MNT-BATCH-THREE.md](JANDRI-MNT-BATCH-THREE.md).
The final twelve were checked in **two disjoint, bounded six-tile jobs**:

- [Real IGN raster run 44723028741](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44723028741),
  both matrix jobs succeeded.
- Batch 0 audit artifact: `p4-jandri-final-mnt-audit-0`, ID `14622632347`.
- Batch 1 audit artifact: `p4-jandri-final-mnt-audit-1`, ID `14622482654`.
- Every original raster was checked for the official approved MNT URL,
  Lambert-93 projection, exact 0.5 m / 2000×2000 pixel footprint,
  physical ground heights and valid pixels. Each SHA-256 was archived
  in the short-lived numerical provenance reports, never in the game.

| Actual IGN tile | Valid pixels | Min ground (m) | Max ground (m) |
| --- | ---: | ---: | ---: |
| 0949-6438 | 100% | 2487.658 | 2868.155 |
| 0949-6439 | 100% | 2314.851 | 2648.534 |
| 0949-6440 | 100% | 2184.809 | 2607.073 |
| 0950-6438 | 100% | 2563.134 | 2842.353 |
| 0950-6439 | 100% | 2404.809 | 2971.852 |
| 0950-6440 | 100% | 2213.918 | 2720.953 |
| 0951-6438 | 100% | 2630.283 | 3004.127 |
| 0951-6439 | 100% | 2675.119 | 3145.163 |
| 0951-6440 | 100% | 2527.625 | 3065.892 |
| 0952-6438 | 100% | 2620.179 | 3309.358 |
| 0952-6439 | 100% | 2968.764 | 3254.850 |
| 0952-6440 | 100% | 2654.998 | 3078.679 |

Each batch tested seven internal cardinal edges with 2000 valid
neighbouring-pixel pairs per edge. Maximum absolute **adjacent cell**
difference was 8.324 m in batch 0, 5.497 m in batch 1; adjacent cell
values are not coincident measurements. A legitimate cliff or
slope can yield abrupt changes; edge diagnostics alone neither prove
nor disprove a DEM discontinuity. **Cross-batch edges and full mosaic
coverage have NOT yet been measured.**

### Scope and strict next gates

**24/24 authentic 0.5 m source MNT tiles have now been individually
downloaded and checked**, for the rectangular EPSG:2154 index covering
the 37 *pinned* downhill OSM ways plus 250 m screening margin.
The files were not retained between jobs and were never published as
static assets; to construct a playable elevation pack a **fresh,
bounded full mosaic import** must retrieve the real files again and
perform a continuous coverage audit, check all seams between batches,
measure actual piste gradients and per-junction altitude continuity,
and prepare a compact, separately loaded game asset. Game/browser
physics and collision tests must pass before release.

Missing Jandri 5, possible Jandri 1 bis and resort-return alignments
are not included in this original source footprint. Do not invent
missing downhill connectors, slopes, route direction or hazard terrain.

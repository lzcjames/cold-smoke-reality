# Jandri real IGN MNT raster batch three — independent audit

**Verified real source raster batch** (not game terrain). GitHub Actions:
https://github.com/lzcjames/cold-smoke-reality/actions/runs/44638318662
Artifact `p4-jandri-third-six-real-mnt-audit`, ID `14584734983`,
stores source SHA-256 and numerical diagnostics, not raw DEM.

The real official WFS original index comes from run 44635187118
(24/24 metadata URL coverage for pinned 37-OSM-way geometry).
Six previous unique ground tiles were documented in
[JANDRI-MNT-RASTER-PILOT.md](JANDRI-MNT-RASTER-PILOT.md)
and [JANDRI-MNT-BATCH-TWO.md](JANDRI-MNT-BATCH-TWO.md).
The third batch explicitly excludes all six and tests disjoint inventory.

| Newly verified authentic IGN MNT tile | Valid pixels | Min ground (m) | Max ground (m) |
| --- | ---: | ---: | ---: |
| 0947-6438 | 100% | 1480.620 | 2386.289 |
| 0947-6439 | 100% | 1885.102 | 2408.934 |
| 0947-6440 | 100% | 1868.565 | 2267.471 |
| 0948-6438 | 100% | 2024.245 | 2812.819 |
| 0948-6439 | 100% | 2108.674 | 2672.746 |
| 0948-6440 | 100% | 1807.797 | 2441.615 |

All six files passed strict Lambert-93 0.5 m / 2000×2000 official
tile checks, have valid ground elevation samples and source checksums
recorded in the private temporary Actions report. Seven tested
adjacent edges have valid paired samples; the largest absolute
adjacent-cell elevation difference was **7.239 m** and the greatest
95th-percentile edge difference was **1.109 m**. Differences are
*between neighbouring raster cell centres*, not two measurements at
the same position; an abrupt terrain slope can produce real changes.

**Cumulative distinct real raster files checked: 12 of 24 (50%).**
No full mosaic, vertical seam correction, route grades, simulated
grooming, ski physics, collisions or gameplay were approved.
Original MNT source files are kept out of the game and Git history.
The archived OSM geometry still omits Jandri 5 and any newer route.

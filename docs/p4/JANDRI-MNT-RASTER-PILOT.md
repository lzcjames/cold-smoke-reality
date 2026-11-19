# Real IGN Jandri raster pilot (two neighbouring tiles, non-publishing)

**Result: passed**, GitHub Actions run
https://github.com/lzcjames/cold-smoke-reality/actions/runs/44636013026
on 2026-11-19, associated with PR #38.

Authentic IGN LiDAR HD **MNT ground elevation** GeoTIFF downloads
were independently checked against the previously archived real IGN
WFS metadata index (run 44635187118; all 24 needed tile metadata
links approved). Only the first two geographically adjacent raster
tiles in the **37-way, 250 m margin** Jandri screening envelope were
downloaded:

| Real Lambert-93 tile | Valid raster fraction | Min valid ground (m) | Max valid ground (m) |
| --- | ---: | ---: | ---: |
| 0945-6438 | 1.000000 | 940.487 | 1493.426 |
| 0946-6438 | 1.000000 | 985.811 | 1948.734 |

Both original rasters passed the existing strict 0.5 m / 2000×2000 /
EPSG:2154 / tile-footprint checks. The script records original file
SHA-256 values, editions, missions and sizes; no raw raster is committed
or added to the release. Artifact
`p4-jandri-two-real-ign-rasters-audit`, ID `14583292315`
contains the machine-readable source manifest only (30-day retention).

**Not yet verified:** the other 22 required MNT tiles, overlap/seam
consistency, validity over *each* OSM run with elevation margin,
continuous downhill direction, physically skiable junctions, avalanche
or hazard safety, game collision or 3D gameplay. Both tiles being
100% valid does **not** imply the whole Jandri sector is complete.
The historic OSM snapshot still lacks Jandri 5 and possible Jandri 1 bis.
Next phase should expand the real-raster acquisition in bounded batches
and verify seams and measured centreline altitude profiles before
attempting a private skiable 3D candidate.

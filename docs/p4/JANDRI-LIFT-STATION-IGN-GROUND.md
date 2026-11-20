# P4: Jandri I / II OpenSkiData station heights versus genuine IGN ground

This is a **non-publishing source-only measurement gate**, not a ride feature.
It reads the six genuine source-linked OpenSkiData station records matched in
[PR #49](https://github.com/lzcjames/cold-smoke-reality/pull/49) and the
previously verified 24 genuine IGN LiDAR HD MNT ground tiles.

The source snapshots are pinned in archived GitHub Actions evidence:

- OpenSkiData station crosswalk [run 44741585451](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44741585451).
- Original official IGN WFS metadata [run 44635187118](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44635187118).

The audit independently projects each real station coordinate to EPSG:2154
Lambert-93. It calculates the actual 1 km tile containing the station
(NORTH-edge tile index, unlike normal lower-left grid indexing), checks
whether this tile is one of the **24 tiles covering only the frozen 37-way
Jandri OSM piste footprint + 250 m margin**, and downloads the authorized
original 0.5 m GeoTIFF *only if it is present in that pinned source
inventory*. Each downloaded tile is independently verified and hashed.

For source stations actually covered, the tool performs a bilinear ground
elevation measurement from four finite original IGN pixels, no guessed
interpolation over missing pixels or tile boundaries. Station 3D geometry
from OpenSkiData/Mapterhorn is kept separately: **a cable-car station roof,
floor or cable height is not identical to bare-earth elevation.**
Any station outside the original piste inventory is explicitly
reported as **unmeasured/not covered**, not fabricated or rejected as
a false station.

A verified ground height alone does not grant a public boarding,
alighting, walking or skiing path. Even a station's `top`, `bottom`,
`entry` and `exit` source tags require independent operator
confirmation. Jandri I station source linkage includes **four
records**, and Jandri II includes **two**; these do not prove six
separately open passenger platforms.

**Neither normal lift rides nor the requested 直达终点站 option is
enabled in the live game.** The outcome of this job identifies exactly
which source station geometries need additional official GNSS, operator
site-plan, or new independently licensed LiDAR MNT coverage before
boarding and disembark locations can be certified. Source file
authorization and only numeric provenance are recorded; no raw
LiDAR is published to GitHub Pages.

Review the workflow evidence artifact
`p4-jandri-I-II-authentic-IGN-station-ground` for the measured
coverage counts, original source hashes and per-station ground heights.

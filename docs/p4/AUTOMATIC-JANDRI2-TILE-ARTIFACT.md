# Automatic non-playable Jandri 2 terrain tile artifact

The full measured IGN MNT workflow already downloads and audits 24
official TIFF source tiles, measures 37 original Jandri OSM ways and
exports a 15m measured Jandri 2 source-only candidate.

This follow-up automatically splits that measured candidate into
**small overlapping DEM chunks** using the existing
`tile_measured_dem.cjs` tool and then checks that the complete
original measured height grid reconstructs exactly.

`check_measured_tiles.cjs` validates the split manifest's original-grid
SHA-256, source OSM identity, individual file hashes and shared tile
edges. Its short evidence JSON is archived alongside the measured
source report. Every chunk remains `approvedForGameplay:false` and
`readyForRuntime:false`. The entire artifact remains outside the
production resort catalog and existing piste physics.

On a successful run, download the **private CI evidence artifact** for
review. No multi-megabyte source raster is copied to GitHub Pages.

This closes the source data -> reviewed candidate -> reproducible
small chunks pipeline. The next independent phase is rendering those
chunks around the skier, followed by collision continuity tests and
piste/area verification; this workflow alone authorizes none of them.

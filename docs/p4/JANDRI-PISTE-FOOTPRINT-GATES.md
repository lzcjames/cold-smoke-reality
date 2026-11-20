# P4 Jandri: evidence gate for piste widths, obstacles and no-go terrain

**Status: source-data review; no certified skiable footprint.**

The 2026-07-24 pinned 37 downhill OSM ways are **centrelines, not
polygons of groomed terrain**. All 37 ways are OSM-tagged `piste:difficulty=easy`;
this is OSM contributor classification, **not** independently confirmed
operator grading, nor evidence that the underlying bare-earth incline
is everywhere easy. The snapshot has no real mapped width data, no
groomed piste area polygons and no validated rock/tree/cliff masks.

**Specific tunnel caution:** genuine OSM way `660937155` is tagged
`Jandri 3`, `tunnel=yes`, `layer=-1`. Its underpass passage, clearance,
roof and safely navigable geometry cannot be inferred from the IGN
bare-earth raster. Treat that geometry as unresolved; never convert it
automatically into an open downhill slope or connect it over the roof.

The strict offline audit script
`tools/reality/audit-jandri-piste-footprint.cjs` and its tests record the
current missing evidence for all 37 ways. It refuses to approve any
piste-area gameplay geometry based only on a centreline or on the
24-tile authentic MNT source. Source audit command:

```sh
node --test test/jandri-piste-footprint.test.cjs
node tools/reality/audit-jandri-piste-footprint.cjs docs/p4/JANDRI-OSM-INDEX.json
```

To make a real playable Jandri run, collect independently attributable
operator piste boundaries/widths, verified hazard and no-go polygons,
actual passage/tunnel limits, grounded downhill route connectivity and
direction, and re-check visual/physics performance in Chromium. Source
geometry must be dated, georeferenced, reproducible, explicitly
licensed and checked against the full measured 24-tile MNT. An
unattributed centreline buffer or guessed tree placement must never
be described as authentic slopes or safe skiable terrain.

This PR does not add gameplay resources, terrain to the HTML, or signs.

## Limited Jandri 1/2 lower-DEM gameplay preview

The repo's already published, source-pinned Les Deux Alpes 3-piste IGN DEM
happens to overlap two segments of the Jandri OSM network. The runtime overlay
in `src/02e_jandri_lower.js` exposes **only** the contiguous nodes from
OSM ways `219275197` (Jandri 1) and `644393970` (Jandri 2) that fall
at least 21 metres inside the existing DEM extent; the precise EPSG:2154
projected coordinates are tested against the original 2026-07-24 immutable
OSM snapshot in `test/jandri-lower-measured-play.test.cjs`. The raster is
untouched and its SHA-256 is checked. This provides a limited **skiable
simulation along real surveyed centreline and real mountain ground**.

This is **not** a verified groomed piste surface, operator route boundary,
full Jandri route, legally safe corridor, or current-condition recommendation.
Its edge stakes are visual estimations, its terrain uses LiDAR *bare ground*,
and OSM `easy` labels do not prove the rider experiences a green run.
The Jandri 3 tunnel `660937155` and all routes outside DEM remain blocked.
The lift 2600/3200 station regions still lack verified playable landing areas.

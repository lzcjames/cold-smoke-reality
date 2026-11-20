# P4 Jandri: evidence gate for piste widths, obstacles and no-go terrain

**Status: source-data review; not a playable 3D terrain pack.**

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

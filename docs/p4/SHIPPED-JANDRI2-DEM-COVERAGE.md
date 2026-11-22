# Audit the actual shipped Jandri 2 DEM footprint

Use the OSM source survey already pinned in
`docs/p4/JANDRI-OSM-INDEX.json` and the **actual** current
`data/reality/les-deux-alpes.json` measured height grid:

```sh
/usr/bin/python3 tools/reality/audit_shipped_osm_dem.py --out /tmp/jandri2-shipped.json
```

The tool converts source WGS84 lon/lat to Lambert-93 with GDAL and
samples every original Jandri 2 way at <=5m interior spacing, keeping
a 20m edge margin for conservative DEM interpolation coverage.
It returns an *evidence report*, not a new game asset.

Interpretation:
- `sourceWayCount`: expected 11 source OSM ways named Jandri 2.
- `fullyDetailedWayCount`: number of ways completely supported by
  the **current shipping DEM with margin** (not proof of route safety).
- `uncoveredSegmentIndices`: original OSM segment indices that leave
  that measured DEM footprint or cross invalid sample cells.

The output intentionally says `approvedForGameplay: false` for all
ways, including those covered by detailed ground. No route is joined by
proximity or name. The report does not prove grooming width, hazards,
one-way downhill eligibility or safe lift access. Full Jandri still
requires high-altitude IGN terrain data to be bundled in a controlled,
performant new resort pack.

A CI GIS test runs this audit against genuine shipping inputs and asserts
the pinned 11-way Jandri 2 inventory without guessing how many can be
safely skied. It does not modify existing ski physics or the public map.

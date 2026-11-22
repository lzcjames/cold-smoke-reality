# OSM source survey adapter for any future resort

Hemu 1.4.0 demonstrates data-driven pistes/lifts and two DEM layers. The
portable Hemu-shaped import path (`portable_resort_adapter.cjs`) covers one
input format; **real French resorts arrive as surveyed OSM features instead**.
The new `osm_survey_adapter.cjs` handles that second input format without
needing to write separate per-ski-run importer code.

## Import a source survey

```sh
# All pinned source ways, grouped by exact names
npm run resort:osm-import -- docs/p4/JANDRI-OSM-INDEX.json les-deux-alpes /tmp/l2a-all-source.json

# Only 11 original ways labelled Jandri 2; no guessed connections
npm run resort:osm-import -- docs/p4/JANDRI-OSM-INDEX.json les-deux-alpes /tmp/jandri2-source.json "Jandri 2"

node --test test/osm-survey-adapter.test.cjs
```

Input is the archived, attributed OSM survey index shape produced by the
existing P4 OSM tools. Only source downhill ways are copied; original
OSM way/node IDs and lon/lat coordinates remain unchanged. Source way
fragments sharing a name are **not** joined into a continuous run.
Shared nodes are reported as source topology candidates only.

This is a **source-only** JSON descriptor. `approvedForGameplay` is false
on every way, and the results do not enter GitHub Pages resort packs.
The index's SHA-256 field is retained as provenance but the adapter cannot
cryptographically verify the original Overpass response bytes from that
field alone. Any new resort first requires its own archived source and
independent provenance audit.

## Required additional gates

1. Verify a licensed detailed DEM along every segment (not just its
   vertices), plus a lightweight distant backdrop. Verify CRS and datum.
2. Review direction and genuine elevations; original OSM node order is
   not automatically skier downhill order.
3. Approve actual skiable piste widths, safe crossings and lift station
   exits from independent source data. A shared OSM node alone is not
   approved.
4. Emit the existing `Reality` pack and register an audited route
   provider with `ResortRoutes`; do not change physics per piste.
5. Run browser/game physics and performance tests before publishing.

This importer does not alter ski physics or existing resort scenery.

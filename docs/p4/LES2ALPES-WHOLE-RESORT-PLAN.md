# Les Deux Alpes — whole-resort foundation (winter map, 22 November 2026)

The winter map supplied by the user is a **cartographic overview**, not
georeferenced piste boundaries. Its labels establish that this project must
include more than Jandri. The extracted map sector register is
`data/reality/les-deux-alpes-sectors.json` and records 12 prominent
named altitude/terrain sectors: Lauze, Puy Salié, Jandri 3200, Toura,
Jandri 2600, Pierre Grosse, Fée, Diable, Crêtes, Belle Étoile,
Vallée Blanche, and the resort base. Mont de Lans and Venosc are
additional marked access areas, not presumed skiable terrain tiles.

**Do not infer exact terrain geometry from this image.** The map shows
difficulty poles, intersections, no-entry areas, piste closures,
off-piste avalanche warnings, ski return advisories and different
types of lifts. These are data-model requirements, not spatial
measurements. Genuine marked piste boundaries, snow grooming and
hazards require independent evidence.

## Data reality check

The pinned source in `docs/p4/JANDRI-OSM-INDEX.json` contains only
**37 original Jandri-related downhill ways** and six route labels:
Jandri 1, 2, 3, 4, Balade du Jandri and Woops du Jandri.
It does **not** contain the complete official resort. Missing sectors
must be sourced and attributed before any whole-resort completeness
or connectivity claim.

Generate a reproducible gap summary:

```sh
node tools/reality/report_resort_inventory.cjs \
 data/reality/les-deux-alpes-sectors.json \
 docs/p4/JANDRI-OSM-INDEX.json /tmp/les2alpes-inventory.json
node --test test/les2alpes-resort-wide-inventory.test.cjs test/overpass-region-source.test.cjs
```

## Expand source data to the entire region

The manual `Les Deux Alpes regional OSM candidate survey (source only)`
GitHub Action uses the existing Overpass acquisition code. Its WGS84
bounding box `44.97 6.05 45.09 6.23` is **an intentionally broad
investigation window**, not an officially surveyed ski-area polygon.
It can include other resorts and unrelated pistes. All ways require
an independent Les Deux Alpes membership assessment, as do route names
and fork identities. Store the raw response bytes and its SHA-256,
then use `overpass_region_source.cjs` to produce a source index.
No direct publication occurs.

## Terrain tile acquisition

The reusable `planGroundTiles(source, projection, options)` enumerates
EPSG:2154 squares from actual OSM points *and every intervening
segment*, with a configurable surrounding margin. The caller must
supply an independently verified WGS84 → Lambert-93 transform.
The returned tile list is a **download/coverage plan**, not DEM files
or a measured ski area. It can later be linked to verified official
IGN LiDAR tiles; do not infer off-piste safety from an interpolated
centreline.

The whole-resort model should retain the proven Hemu-inspired
two-level terrain strategy: fine data near the skier, separately
loaded low-detail scenery away from the skier. Do not embed the
entire mountain grid in the HTML shell. Bounded per-region packs,
cache eviction and browser-frame regression remain necessary.

## Release gates

1. Verify candidate OSM ways and map names belong to this resort;
   produce a comprehensive, timestamped source snapshot.
2. Build certified near/far DEM tile inventories and exact continuity
   checks covering selected player routes and their surrounding width.
3. Review direction, crossings, groomed piste geometry, route difficulty
   and actual lift terminals. Produce gameplay-ready route and lift data.
4. Integrate individual sectors into the existing shared runtime,
   keeping global physics and rendering unchanged.
5. Open the Jandri sector first; enable the other areas only once each
   passes DEM, route, sign and playable ski-contact regression.

**This PR is data inventory and source acquisition infrastructure.
It does not claim a complete 3D resort or expand the playable snow area.**

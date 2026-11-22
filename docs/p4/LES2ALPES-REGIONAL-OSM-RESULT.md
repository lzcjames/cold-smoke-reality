# Les Deux Alpes regional OSM result — actual source evidence (2026-11-22)

The four-quadrant regional OSM query run
[45050848311](https://github.com/lzcjames/cold-smoke-reality/actions/runs/45050848311)
**completed** its source-only workflow, including a partial-failure audit.
Its archived original-response evidence
`les2alpes-regional-osm-candidates-not-approved`
contains **three independent Overpass responses** and an explicit
failed quadrant 3.

Verified counts extracted from those original response indexes:

| Source | Original named downhill way occurrences |
| --- | ---: |
| Southwest quadrant 1 | 69 |
| Southeast quadrant 2 | 208 |
| Northeast quadrant 4 | 1 |
| Northwest quadrant 3 | **unavailable (timeout / HTTP error)** |
| **Three successful sources** | **278** |

There are **272 distinct OSM way IDs** (six way IDs appear in
two quadrant responses) and **93 distinct recorded route-name strings**.
This is significantly broader than the older pinned 37-way Jandri-only
survey. Named candidates include Jandri 5, Pierre Grosse,
Bellecombe, Fée, Toura, Puy Salié, Diable, Petites Crêtes and the
Vallée Blanche access piste.

**This does not mean 272 approved pistes.** All source ways are
unreviewed, could include adjacent areas, and use three independent
OSM timestamps rather than one atomic snapshot. One quadrant remains
absent. No safe piste widths, crossings, hazard polygons, lift
terminals or detailed DEM outside the previous Jandri envelope are
validated.

The exact response hashes, timestamps and count claims are recorded
in `LES2ALPES-REGIONAL-OSM-EVIDENCE-2026-11-22.json`.

## Reproducible overlap/source review

Download and extract the original GitHub Action evidence ZIP. Then run:

```sh
node tools/reality/audit_osm_shards.cjs \
    /path/to/extracted/regional-evidence \
    /tmp/les2alpes-verified-shards.json
```

The audit checks **original raw response SHA-256**, per-shard source
index SHA and timestamp, authentic original node IDs, longitude/latitude
coordinates, cross-quadrant duplicates and conflicting geometry
snapshots. It does not fabricate a merged snapshot or promote any
source route to gameplay.

Next: retry **only the missing quadrant** or obtain a complete
attributed original OSM snapshot, resolve genuine ski-area membership,
review the official map's route difficulty and lifts, then separately
acquire measured high-resolution DEM for each usable section.

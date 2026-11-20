# P4 Jandri external ski-piste boundary source discovery and intake

The verified IGN LiDAR HD MNT has **ground elevations**, not a groomed
piste perimeter. The pinned 37-way Jandri OSM survey is a set of
**centrelines**, not 37 measured skiable areas. The Jandri 3 tunnel
(way `660937155`) remains a separate passage/clearance blocker.

## Potential *candidates* found on 2026-11-20 (not approved source data)

- Data.gouv.fr / DataSud publishes an **OSM-derived ski-piste polygon**
  extraction for Auvergne-Rhône-Alpes and neighbouring regions, under
  the ODbL: https://www.data.gouv.fr/datasets/openstreetmap-pistes-de-ski-polygones .
  It is an OSM extraction, **not** independently certified piste
  boundaries or an operator-approved course. A current-region dataset
  listing does not prove there are Jandri-specific polygon features.
- ArcGIS REST `2Alpes` FeatureServer polygon layer:
  https://services.arcgis.com/d3voDfTFbHOCRwVR/ArcGIS/rest/services/2Alpes/FeatureServer/3
  . It contains polygon geometries in WGS84, but the layer provides
  no meaningful source attribution or licence, and does not establish
  that its polygons are groomed ski pistes. **Do not download these
  polygons into game assets or describe them as official piste bounds.**
  Its metadata indicates an old data edit date (2022), also requiring
  freshness verification.
- The Les 2 Alpes official ski map documents the **general** ski
  domain but is a reference image rather than a georeferenced piste
  boundary polygon: https://www.les2alpes.com/hiver/skier-aux-2-alpes/domaine-skiable/ .

## Safe candidate intake

`tools/reality/audit-jandri-boundary-intake.cjs` accepts a separately
obtained GeoJSON FeatureCollection plus an explicit, dated source
record. Each feature must carry `sourceFeatureId` and `osmWayIds`
that match the actual pinned OSM ways. The source record must contain
`sourceURL` (HTTPS), `sourceDate` (YYYY-MM-DD), `license`
(`ODbL-1.0` or `Licence-Ouverte-2.0`) and the **original
GeoJSON file's SHA-256**. The tool verifies the original file SHA-256 and requires the audited GeoJSON object to match the decoded authenticated file bytes exactly; it then checks format, closed WGS84 polygon rings, ID references and OSM vertex-in-polygon overlap. A separately edited in-memory object is rejected even if its supplied file hash is valid.

```sh
node tools/reality/audit-jandri-boundary-intake.cjs \
  docs/p4/JANDRI-OSM-INDEX.json \
  /path/to/sourced-piste-areas.geojson \
  /path/to/verified-source-provenance.json \
  > /tmp/jandri-boundary-candidate-audit.json
```

**Critical limitation:** accepted source metadata is user-supplied,
and elementary ring/overlap checks are not full GIS-topology validation
or independent verification of rights, operator status, winter grooming,
hazards, exclusions, tunnels, or accessibility. The tool therefore
reports **zero approved playable areas** even for a spatially overlapping
polygon, and publishes no game asset.

For release, perform separate source-rights verification, full
polygon topology/holes and georeferencing QA, centreline-to-corridor
continuity, operator piste and hazard verification, tunnel clearance,
and on-slope simulation tests. Only then should a derived runtime
collision mask be prepared as a separate optional pack.

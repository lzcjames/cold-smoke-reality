# Les Deux Alpes — P4 real-world piste survey

**Status:** OSM and DEM acquisition/validation gate; **no second ski area released**.
This audit complements the generic P4 importer and resort picker in PR #12.
It does not create or claim a skiable route.

## Authoritative and licensed upstream sources

- **IGN RGE ALTI®**: official French terrain elevation model, under
  [Licence Ouverte v2.0](https://www.data.gouv.fr/datasets/rge-alti-r).
  Preferred for terrain precision. Record actual grid edition, tile identifier,
  download URL, license and SHA-256 before publishing.
- **OpenStreetMap downhill way geometry**: © OpenStreetMap contributors,
  [ODbL](https://www.openstreetmap.org/copyright). A piste must have
  `piste:type=downhill`, a real named way, real OSM node IDs and coordinates.
  Common names or line proximity alone do **not** prove a downhill junction.
- **Geofabrik Rhône-Alpes regional raw OSM PBF**:
  [download provider](https://download.geofabrik.de/europe/france/rhone-alpes.html),
  with original OSM node references preserved. This is a source fallback if
  public Overpass endpoints are overloaded; the PBF SHA-256 and fetch timestamp
  are recorded. A fetch timestamp is *not* claimed to be an OSM historical
  snapshot timestamp.
- **Copernicus GLO-30**, if IGN acquisition is temporarily unavailable:
  [official DEM license and availability](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).
  This is a surface model with its own attribution terms and less fine detail
  than the preferred IGN RGE ALTI; do not silently label it as IGN.
- The official [Les Deux Alpes ski area](https://www.les2alpes.com/hiver/skier-aux-2-alpes/domaine-skiable/)
  is useful for checking place/piste names, but its drawn piste map is not a
  license to copy graphical paths as geospatial data.

## Reproducing the topological audit

The exploratory survey covers 44.975–45.050° N, 6.095–6.205° E (WGS84).
**These are just extraction bounds**, not an assertion that any particular
lift, piste or 3–5-route network exists inside them.

```sh
python3 -m unittest discover -s test -p 'p4_audit_test.py'
curl --fail --location --get \
  --data-urlencode data@tools/reality/les-deux-alpes.overpass \
  'https://overpass.private.coffee/api/interpreter' >p4-les-deux-alpes-osm.json
python3 tools/reality/p4_audit.py --osm p4-les-deux-alpes-osm.json \
  --report p4-source-audit.json
```

Fallback to original Geofabrik PBF if Overpass is unavailable:

```sh
python3 -m pip install osmium
curl -fL -o /tmp/rhone-alpes.osm.pbf \
  https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf
python3 tools/reality/p4_pbf_extract.py \
  --pbf /tmp/rhone-alpes.osm.pbf \
  --source-url https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf \
  --out p4-les-deux-alpes-osm.json
python3 tools/reality/p4_audit.py --osm p4-les-deux-alpes-osm.json \
  --report p4-source-audit.json
```

The original data and report are archived only as PR-only CI evidence.
Eligible ways are grouped by exact **shared node IDs with identical coordinates**,
not by endpoint proximity. These are only candidate undirected components.
Full validation next requires descending elevation at the exact junction,
valid length on both incoming and outgoing segments, **complete DEM coverage**,
3–5 correctly selected source ways, an explicit source manifest and reproducible
JSON pack checksums. If those conditions fail, the second resort must remain
hidden from the published catalog.

When using CI evidence, see
[PR #13](https://github.com/lzcjames/cold-smoke-reality/pull/13);
the main P4 game UI/importer preparation is
[PR #12](https://github.com/lzcjames/cold-smoke-reality/pull/12).

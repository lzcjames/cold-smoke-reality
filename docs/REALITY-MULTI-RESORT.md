# P2: independent, on-demand Reality resort packs

**Status:** staged in an independent PR for acceptance. This release adds a scalable
pack registry and lazy terrain loading; it does **not** add a new real resort or
tile-stream a single enormous mountain. Existing La Balme / Déversoir /
Campanules content and ski physics remain unchanged.

## Runtime architecture

- A tiny, build-validated list of resort names/IDs, network support and
  content-hash revisions is embedded in the existing game HTML's `#app`
  `data-reality-catalog` attribute. No DEM values or piste polylines are
  embedded in the HTML.
- Each resort has its own `data/reality/<id>.json` source and is published as
  `dist/reality/<id>.json`. The manifest source is
  `data/reality/catalog.json`; only listed IDs are routable. Slugs are
  constrained to lowercase letters/digits and `-`. The build rejects missing,
  invalid or duplicate resort files, invalid topology and mismatched identities.
- Default procedural mode never invokes the resort loader, so it downloads
  **zero** real-resort DEM packs. Opening
  `?reality=alpe-dhuez` loads only `alpe-dhuez.json`, while
  `?reality=alpe-dhuez&network=1` enables the verified multi-piste graph.
- URLs include an asset-content SHA-256 revision,
  `/reality/<id>.json?v=<16-hex>`. The browser fetches with
  `cache: 'force-cache'`: a browser *may* reuse its HTTP disk cache on return
  visits, subject to ordinary browser/cache eviction policies. When a pack
  changes, its revision changes. Neither a persistent JS reference to all raw
  DEM JSON nor a Service Worker is introduced.
- Resort links are generated from the catalog at runtime. The original
  single-piste route, network opt-in, credit label and native mode remain
  compatible with existing gameplay.
- **No far-away resort is initialized or rendered** while the current resort
  is being played. The existing terrain clipmap is shared among pistes within
  the selected resort, and the existing spatial index and sign batching remain.

## Adding the next **real** resort

1. Acquire a legally usable, georeferenced DEM and actual OSM downhill piste
   geometry. Record copyright, original product version and OSM way IDs.
2. Prepare a measured region, for example (illustrative bounding arguments,
   *not an actual new resort*):
   ```sh
   /usr/bin/python3 tools/reality/import.py --dem /path/to/real-dem.tif \
     --osm /path/to/real-osm.json --source ign --resort-id second-resort \
     --crop-bounds WEST SOUTH EAST NORTH \
     --piste-bounds SOUTH WEST NORTH EAST \
     --out data/reality/second-resort.json
   ```
   If the resort requires its own measured piste junctions, populate and
   validate `pistes[]`/`junctions[]` using the topology rules from
   [La Balme network](reality-network/README.md). Do not invent joins.
3. Add one entry to `data/reality/catalog.json`:
   `{"id":"second-resort","name":"Actual resort name"}`.
4. Run `npm run check`, `npm test`,
   `/usr/bin/python3 -B test/reality-import.py`,
   `npm run test:browser -- --release`; review attribution and game captures.
   The builder validates, versions and stages the new pack automatically;
   no `Reality.id` hardcoding or new HTML route is needed.
5. Test loading, cross-resort navigation and performance on hardware before
   enabling a larger area.

**Important:** the repo contains only one licensed real resort asset today.
The second-resort test uses exclusively synthetic data in a temporary directory
and does **not** publish a fictional ski area.

## Acceptance and performance limits

- Catalog presence adds only small metadata to HTML; DEM and piste geometry
  remain separate. Existing Alpe d'Huez source JSON is byte-for-byte unchanged.
- Default procedural start must not request `/reality/*.json`; enforced by a
  browser regression test.
- Build integration test stages a second synthetic resort without editing game
  source, validates both packs and verifies that changing one JSON changes only
  that resort's revision.
- Existing Reality Mode and optional network continue to share one DEM and
  their existing WebGL2 / WebGPU pipelines.
- Compare release HTML bytes, downloaded DEM bytes, startup time, and (where
  possible) memory and actual hardware GPU FPS on the same machine before/after.
  Build/test success alone is not hardware FPS certification. Physical GPU
  acceptance remains tracked in
  [PERFORMANCE-TODO](reality-network/PERFORMANCE-TODO.md).

### Future scaling (not included in P2)

A single huge resort may eventually need independently compressed binary DEM
tiles, spatial streaming, distance LODs and bounded GPU/CPU cache eviction.
This P2 release deliberately avoids modifying rendering resolution, snow
quality, weather or skier physics.

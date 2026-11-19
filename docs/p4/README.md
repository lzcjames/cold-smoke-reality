# P4 — Les Deux Alpes: measured-data onboarding and resort picker

**Status (2026-11-19): P4 preparation only.** The repository has exactly one
published real resort pack, Alpe d’Huez. The Les Deux Alpes DEM and verified
3–5-way OSM network **have not yet been acquired or audited**. No pretend terrain,
guessed way IDs or invented graph edges are shipped. The optional catalog entry
is skipped at build time until the actual validated
`data/reality/les-deux-alpes.json` exists.

## Verified upstream sources and licensing

- **IGN RGE ALTI®** (5 m or 1 m terrain model) — official French geodata,
  [data.gouv.fr dataset](https://www.data.gouv.fr/datasets/rge-alti-r).
  Available under **Licence Ouverte v2.0**. Obtain a licensed source GeoTIFF
  covering the chosen crop and record its **actual edition, tile IDs, URL and
  SHA-256**. Never confuse a piste-map screenshot with a ground-elevation DEM.
- **OpenStreetMap downhill ways** — © OpenStreetMap contributors,
  **ODbL 1.0**. Survey with an Overpass `out body geom` snapshot with actual
  node IDs, coordinates, tags and `osm3s.timestamp_osm_base`. Verify data
  provenance, the obligations of the share-alike database licence, and keep
  in-game attribution.
- [Official Les Deux Alpes piste information](https://www.les2alpes.com/winter/discover/skiing-in-les-2-alpes/ski-area/sectors-and-runs/)
  is useful **for human cross-checking**, not a geometry licence. Current
  trail names, lifts and openings may change independently from the snapshot.

Grounded geographic anchor for the survey: the Jandri lower station is
approximately **45.009871° N, 6.126514° E** (Alpes Isère tourism board).
The example bbox below covers a broad surrounding area **for discovery only**;
it is **not a claim** that any three particular runs intersect.

## Repeatable measured-data workflow

1. Survey named OSM downhill ways and their exact node intersections. This step
   needs internet access and may return a 429/503 while Overpass is busy:

   ```sh
   python3 tools/reality/p4_osm.py \
     --bbox 44.98 6.10 45.06 6.22 \
     --out /tmp/les-deux-alpes-osm.json \
     --review /tmp/les-deux-alpes-review.json
   ```

   Review the `ways` and `sharedNodeWayIds` fields. Choose **one primary
   and 2–4 genuinely neighbouring named downhill ways**, not merely nearby
   polylines. Confirm their selected paths and branch nodes against current
   OSM/official mapping and actual downhill elevation continuity. Do **not**
   infer a connection just because the lines cross visually.

2. Download an original **real**, licensed RGE ALTI terrain GeoTIFF from IGN
   covering the desired sub-area **plus margin**. Inspect product edition,
   licence, data date, missing-cell coverage and projection. Determine
   `--crop-bounds WEST SOUTH EAST NORTH` and
   `--piste-bounds SOUTH WEST NORTH EAST` from the reviewed lines. The
   importer samples a uniform 15 m EPSG:2154 grid and refuses holes and
   out-of-coverage centres. The runtime accepts at most 1200×1200 cells.

3. Build the actual measured pack, replacing every capitalised placeholder
   with audited values — do **not** commit data from a synthetic fixture:

   ```sh
   /usr/bin/python3 tools/reality/p4_import.py \
     --dem /path/to/real-ign-terrain.tif \
     --osm /tmp/les-deux-alpes-osm.json --source ign \
     --primary-way ACTUAL_PRIMARY_OSM_WAY_ID \
     --neighbour-way ACTUAL_NEIGHBOUR_WAY_ID_1 \
     --neighbour-way ACTUAL_NEIGHBOUR_WAY_ID_2 \
     --crop-bounds WEST SOUTH EAST NORTH \
     --piste-bounds SOUTH WEST NORTH EAST \
     --dem-edition "Exact RGE ALTI tile IDs and publication date" \
     --dem-reference https://geoservices.ign.fr/rgealti \
     --out data/reality/les-deux-alpes.json
   ```

   A fourth or fifth measured piste may use additional `--neighbour-way`
   options. The tool checks exact IDs, node coordinate consistency, positive
   downhill transitions, monotonic primary run, graph connectivity, and a
   confirmed fork. It writes the OSM timestamp, DEM edition and the source
   file hashes into the asset. Build validation re-checks the provenance
   shape and graph before any file is published. Source claims still require
   independent human review; a checksum is not proof of legal ownership.

4. **Only after measured data are reviewed**, commit the real asset and record
   each selected OSM way + node, elevation coverage, attribution and source
   hash in this document. Existing `data/reality/catalog.json` already
   contains an **optional** Les Deux Alpes entry. After adding the file,
   `npm run check` automatically stages it as
   `dist/reality/les-deux-alpes.json` and publishes it with its own content
   revision. Before that, the build logs an explicit missing-optional warning
   and the UI remains **single-resort**.

5. Verify the complete `?reality=les-deux-alpes` and
   `?reality=les-deux-alpes&network=1` experiences and switch both ways via
   the resort selector. Confirm measured positions, correct signed downhill
   joins, skier/board collision, WebGL2 and WebGPU visual captures, zero
   default-mode DEM requests, correct old/second-resort cache isolation and
   honest attributions. Do the physical GPU FPS/p95 and memory hardware A/B
   before approving the multi-resort production release.

## Changes staged in this PR

- Generic exact-OSM-ID network importer, with backward-compatible La Balme
  defaults, and a fail-closed measured-data pipeline for the second resort.
  The runtime now accepts **secondary-to-secondary exact-node junctions**, not
  only junctions directly on the primary way; a test-only non-primary fork
  confirms this without changing the original La Balme signs or spawn.
- Dated Overpass survey utility and offline GIS regression against real
  retained Alpe d’Huez source extracts. **No live API requests in CI**.
- Optional Les Deux Alpes catalog entry; build refuses a provenance-free
  placeholder pack, and a missing optional asset is not published.
- A keyboard-accessible, generated resort **dropdown** shown only when there
  are at least two validated available resort resources. Switching clears the
  previous resort's `network=1` toggle and triggers the existing per-resort
  lazy loading and three-pack LRU cache. Existing deep links remain.
- Test-only second-resort data are injected into Chromium to exercise the
  selector and cache; production assets are not modified.
- GIS dependency installation uses bounded retry attempts because Ubuntu
  mirrors returned HTTP 503 in the P3 `main` workflow. The GitHub Pages
  deployment itself succeeded independently of that mirror issue.

## Acceptance state

- [ ] Genuine OSM way IDs and node-connected 3–5-piste survey reviewed
- [ ] Licensed real IGN GeoTIFF fetched and licence/source recorded
- [ ] Measured second-resort JSON built, validated and published separately
- [ ] Two real resorts manually inspected with browser image captures
- [ ] Hardware performance and memory comparison performed

Until those are checked, **P4 is not delivered as a second playable resort**.

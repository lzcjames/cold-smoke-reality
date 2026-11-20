# P4 Jandri — first real OpenSkiData lift and station audit

**2026-11-20 — authentic OpenSkiData source downloaded; NOT a playable
lift transport network.**

Source-only GitHub Actions [run 44731959163](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44731959163)
successfully downloaded the official [OpenSkiData](https://www.openskidata.org/)
daily publisher datasets **lifts.geojson** and **spots.geojson** and
`metadata.json` (not OpenSkiMap vector tiles).
The streaming parser selected geometry intersecting the screening
rectangle **[6.115, 44.980, 6.220, 45.030]** WGS84.

The actual downloaded source yielded:
- **45** nearby lift-line candidates, including many lifts outside the
  immediate Jandri piste sector.
- **74** nearby mapped lift-station spot candidates.
- At least these source-backed lifts, with *upstream OSM identifiers*:
  - **Jandri I** — `gondola`, `way/1229057878`
  - **Jandri II** — `gondola`, `way/1361005452`
  - **Bellecombe** — `chair_lift`, `way/23425340`
  - **Diable** — `mixed_lift`, `way/30483362`
- Publisher status `operating` in this **dataset** is not proof of
  currently operating lifts or public passenger boarding permission.
- The resulting local evidence is GitHub Actions artifact
  **`p4-jandri-openskidata-lifts-stations-real-audit`**,
  ID **14627115869**. It records the actual publisher build timestamp,
  OSM source timestamp, source file SHA-256, full matching local
  geometries/spot IDs and attribution, but no worldwide raw dump.

## Data architecture and next safety gates

OpenSkiData's lifts/spots are largely *derived from OpenStreetMap*;
this is a valuable normalized ski-network cross-reference, **not
independent OSM geometry confirmation**. It includes 3D elevations from
Mapterhorn; nearby **IGN LiDAR HD MNT** is the real terrain reference
for eventual local boarding height checks. Daily OpenSkiData feature
hashes are unstable; use their `sources[]` upstream OSM way/node IDs
as durable keys, and resolve station `liftId` only within the pinned
daily build.

The future independent optional
`data/reality/les-deux-alpes-lifts.json` package must remain
**unpublished** until all of the following are checked:
- Source-authenticated station positions, true lower/middle/upper
  stations and permitted boarding/alighting directions.
- Matching OSM way geometries, operator name and operational status,
  including cases where stations/lifts have been rebuilt or replaced.
- Local measured IGN ground height at each boarding/alighting point.
- Actual walk/ski connections to **groomed and authorized** piste areas,
  not just near-by coordinates or a 37-way OSM node connection.
- Proper support/cable/cabin geometry and clearance, game interactions,
  camera and physics tests, and bounded lazy asset loading.
- No fabricated lift speed, ride duration, queue length, access or
  departure/arrival placement where missing.

Published [OpenSkiData terms](https://www.openskidata.org/):
automated full dataset downloads at most once per day; do not use their
vector tiles directly. The source is ODbL with combined contributor
attribution. Required attribution string:
`Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors
(ODbL), Skimap.org, Who's On First, © Mapterhorn`.

This PR changes audit tooling **only**; it adds **zero bytes** of
OpenSkiData geometry or simulated lifts to the shipped game and leaves
the existing resort selector and game physics unchanged.

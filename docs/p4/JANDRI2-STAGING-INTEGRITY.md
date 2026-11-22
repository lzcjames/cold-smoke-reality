# Genuine Jandri 2 staging grid — first artifact integrity gate

The real IGN LiDAR workflow run
[45048782414](https://github.com/lzcjames/cold-smoke-reality/actions/runs/45048782414)
completed all **24 official source tiles, 37 cross-tile boundaries and 37
OSM centreline elevation profiles**. It also emitted an independently
audited but **non-playable** `Jandri 2` measured grid: 140 × 68 samples
at 15m, containing 11 authentic OSM source fragments. No new playable
route was released.

See `JANDRI2-MEASURED-EVIDENCE-LEDGER.json` for original source SHA,
artifact ID, exact exported grid SHA, extent and elevation range.

This stage adds `tools/reality/verify_measured_staging.cjs`, invoked
immediately after full official-source re-download in the existing
nonpublishing MNT workflow:

```sh
node tools/reality/verify_measured_staging.cjs \
    jandri2-measured-grid-staging.json \
    jandri-full-measured-mosaic-report.json \
    docs/p4/JANDRI-OSM-INDEX.json \
    jandri2-staging-integrity-report.json
```

The checker fails on mismatched OSM provenance, missing official raster
tile identities, unmatched measured way IDs, invalid elevation cells,
excessive browser JSON, or gameplay-ready flags. It produces an explicit
source-only integrity report and does not modify any live resort assets.

This is a meaningful bridge from experimental DEM output to a
reproducible future sector build, but does not certify trail direction,
groomed width, hazards, off-piste limits, signage or lift exit safety.

**Remaining gate:** compare this genuine limited-altitude crop against
all official-map sectors and acquire the missing upper glacier and
other regional source data. Then create independently validated,
area-limited `Reality` assets with lazy loading, and test player
ski-contact stability before opening.

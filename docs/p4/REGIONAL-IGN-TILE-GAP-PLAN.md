# Verified regional OSM → official IGN LiDAR kilometre-tile acquisition plan

This source-only planner uses the **actual** archived, SHA-verified
original OSM ways from the Les Deux Alpes four-quadrant collection,
projects each original lon/lat point to Lambert-93 EPSG:2154, samples
**every segment interior** at <=25m, and registers any 1km square
within 90m of the original centreline. It does not invent pistes,
mark skiable widths or download any imagery.

The first source archive came from
[GitHub Actions 45050848311](https://github.com/lzcjames/cold-smoke-reality/actions/runs/45050848311)
(3 of 4 independently dated responses, 278 way observations, 272
unique original OSM IDs, one missing NW quadrant). Running the
spatial tile enumeration on this exact evidence yielded:

| Geographic source statistic | Result |
| --- | ---: |
| Distinct OSM way candidates | 272 |
| Distinct source-footprint 1km Lambert-93 tiles | **47** |
| Candidate tiles intersecting existing 24-tile Jandri MNT mosaic | **21** |
| Candidate tiles **outside** the original 24-tile mosaic | **26** |
| Original source acquisition WGS84 quadrant coverage | 3 of 4 |

The original verified 24 MNT files span Lambert-93 source tile labels
`0945–0952` (easting, km) by `6438–6440` (northing, km).
The 47 candidate tiles span a broader investigation window. **These
are not 47 confirmed Les Deux Alpes tiles**: the regional OSM
bounding box can capture adjacent resorts, unverified or duplicate
ways. Membership and hazard/marked-piste checks must precede
requesting these additional official IGN assets.

## Reproduce

Download and extract the original regional OSM Action artifact into
a directory containing `status.json`, `quadrant-*-overpass-raw.json`
and `quadrant-*-source-index.json`. Then use a Python environment
with system GDAL/OSR installed:

```sh
/usr/bin/python3 tools/reality/plan_regional_dem_tiles.py \
  --source-dir /tmp/les2alpes-regional-evidence \
  --out /tmp/les2alpes-regional-dem-candidate-tiles.json
```

The output enumerates individual tile IDs, authentic original source
way IDs, whether an original 24-tile Jandri source TIFF was already
verified, independent source timestamps, geometry conflicts and
missing quadrant flags. It always sets
`allOsmWaysConfirmedInsideLesDeuxAlpes:false`,
`newRegionalDEMDownloaded:false`, and
`approvedForGameplay:false`.

The workflow cannot auto-promote these tiles to live gameplay.
First review official-map resort membership, the missing NW source
and the real marked-piste extent. Then download selected official
IGN source rasters, validate actual TIFF source SHA and seams and
generate **small lazy-loaded assets per authorized sector**.

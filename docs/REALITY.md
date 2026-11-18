# Reality Mode · Alpe d’Huez

La Balme is bundled with this release. See the [source record](../data/reality/SOURCES.md) for the IGN and OpenStreetMap inputs.

Cold Smoke starts on the procedural mountain by default. When a validated Alpe d’Huez data asset is bundled, the title links to Reality Mode. The direct entry point is `?reality=alpe-dhuez`. A missing or invalid asset produces a startup error and a link back to Cold Smoke.

## Source data and import

1. Obtain an IGN RGE ALTI elevation raster covering longitude 6.025–6.150° E and latitude 45.050–45.145° N, with extra margin for reprojection. IGN publishes RGE ALTI through [Géoservices](https://geoservices.ign.fr/rgealti). A mosaic of the relevant IGN tiles can be supplied as a VRT or GeoTIFF. If IGN is unavailable, use [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/). The importer verifies full coverage. The fallback uses [Copernicus tile N45 E006](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N45_00_E006_00_DEM/Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif).
2. Export downhill ways with their geometries from OpenStreetMap. The Overpass query is in [alpe-dhuez.overpass](../tools/reality/alpe-dhuez.overpass). Prefer a known named way from Alpe d’Huez when choosing the first test run.
3. Install Python 3 with GDAL and NumPy (on Debian or Ubuntu, `python3-gdal` and `python3-numpy`). From the repository root:

```sh
curl --fail --silent --show-error --get \
  --data-urlencode data@tools/reality/alpe-dhuez.overpass \
  https://overpass-api.de/api/interpreter -o /tmp/alpe-osm.json
/usr/bin/python3 tools/reality/import.py --source ign --dem /path/to/rge-alti.tif --osm /tmp/alpe-osm.json
npm start
```

Supply `--source copernicus` for Copernicus DEM and `--way <OSM ID>` to select a specific piste. Without `--way`, the importer selects the named way with the largest descent among eligible candidates. It projects into Lambert-93 (EPSG:2154), samples at 15 m, orders the way downhill by DEM height, and rejects unsupported folds, missing DEM coverage, and invalid starts. Record the actual product/version, download date and OSM way ID alongside any published asset. Preserve the elevation provider's license terms and [OSM attribution and ODbL terms](https://www.openstreetmap.org/copyright) when distributing the asset.

The import writes `data/reality/alpe-dhuez.json`. The build validates it and copies it into `dist/reality/`. Supply real source data before publishing a playable Reality Mode. Tests generate fixtures in memory or in temporary directories.

## Engine integration and first-cut limits

- `03_course.js` provides one terrain query to the clipmaps in `04_terrain.js`, skier collision and pose in `07_game.js`, and camera clearance in `07b_views.js`. Reality Mode samples the same bilinear DEM for each consumer. The original rendering backends, snow shaders and synthesized sound remain in use.
- The DEM is reframed in game metres with the selected piste's average downhill direction along negative Z. Its OSM centreline supplies the spawn and the approximate groomed corridor. The half-width is estimated at 18 m. There is one downhill way, with no lift network or piste junction routing.
- The playable area ends at the piste finish or 20 m inside the DEM edge. Reaching either restarts the run at the spawn. Terrain samples beyond the raster clamp to its edge for rendering. The procedural distant ranges and city overlays are disabled in Reality Mode.
- `99_main.js` handles startup and mode selection. `build.js` and `tools/serve.js` expose the same relative asset URL locally and on project Pages.

## Check and deploy

```sh
npm run check
npm test
/usr/bin/python3 -B test/reality-import.py
npm run test:browser -- --release
```

The browser checks use Chromium and SwiftShader. Set `BROWSER` to override the executable. The CI workflow uploads a static site artifact on branches and pull requests. For public deployment, set **Settings → Pages → Source** to **GitHub Actions**. The deploy job publishes and checks the site on `main` after validation.

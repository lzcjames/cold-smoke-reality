# Alpe d’Huez release data

The release covers La Balme (OpenStreetMap way 23257919). The projected downhill span is 1,776 m and the elevation difference is 522 m. The runtime grid is 628 × 728 at 15 m in Lambert-93.

- Elevation © IGN, RGE ALTI®, under the [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/). The 900 × 900 Float32 GeoTIFF came from the [IGN WMS GetMap request](https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:4326&BBOX=45.043,6.015,45.152,6.161&WIDTH=900&HEIGHT=900&FORMAT=image%2Fgeotiff) on 2026-11-18. Source SHA-256 `20de1ea81a8f0a67d5e7f6409cb4168210f517d860048532570720481b3c8f4c`.
- Piste geometry © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The [La Balme way](https://www.openstreetmap.org/way/23257919) was extracted from Overpass at OSM snapshot timestamp `2026-11-18T18:17:25Z`. The selected [source geometry](la-balme.osm.json) is retained here with its attribution and tags. The piste geometry in the runtime JSON is reprojected and ordered downhill.

Save the linked IGN WMS response locally as `ign-alpe.tif`, then run from the repository root:

```sh
/usr/bin/python3 tools/reality/import.py --source ign --dem ign-alpe.tif \
  --osm data/reality/la-balme.osm.json --way 23257919
```

The live WMS may change after this release. The generated runtime asset is versioned in Git.

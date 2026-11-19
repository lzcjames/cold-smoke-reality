# Les Deux Alpes — official IGN LiDAR HD WFS index evidence

**Date checked:** 2026-11-19. **Scope:** source discovery only, no playable terrain published.

The live read-only GitHub Actions [WFS discovery](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44541721513) queried the official `https://data.geopf.fr/wfs/ows` source layer `IGNF_LIDAR-HD_METADONNEE:metadata`, using CRS:84 and bounding box **W 6.115, S 44.982, E 6.165, N 45.020**.

The original returned GeoJSON (archived as `p4-ign-lidar-tile-index` on the run) contains **25 returned features, 25 total matched features**, and **25 nonempty `url_mnt` properties**. These are **official ground-elevation MNT links** using `https://data.geopf.fr/wms-r?...REQUEST=GetMap&FORMAT=image/geotiff...` rather than paths ending directly in `.tif`. The first version of the URL checker incorrectly rejected that valid WMS format; the checker was corrected to accept strictly scoped IGN MNT layer and GeoTIFF query parameters while rejecting MNS/MNH URLs.

An observed entry has tile identifier `0945-6437`, mission `21LHD6QM`, edition `2025-02-20Z`, survey end `2021-10-15Z`, Lambert-93 CRS and IGN69 altitude datum. The original response should be consulted for exact per-tile metadata; dates vary and must not be inferred from this one example.

## Key OSM node tile locations (EPSG:2154)

Using the original archived OSM node coordinates, converted WGS84 → Lambert-93:

| OSM shared node | Approx. Lambert-93 X / Y (m) | Observed MNT tile ID |
| --- | --- | --- |
| 6057592113 | 946767 / 6438489 | `0946-6439` |
| 6057592057 | 947924 / 6438135 | `0947-6439` |

The returned tile index also contains the tiles spanned by the **surveyed vertices** of the three shortlisted pistes:

- Diable 1 (219409078): `0946-6439`, `0947-6439`, `0948-6439`.
- Petites Crêtes (643745486): `0947-6438`, `0947-6439`, `0948-6438`, `0948-6439`.
- Vallons du Diable (643786947): `0946-6438`, `0946-6439`, `0947-6438`.

Those lists describe vertex positions only, *not* verified coverage of all intervening segments, the terrain crop, guard margins or actual raster data. Validate all of those separately.

**Not yet established:** that all 25 WMS links successfully download valid GeoTIFF rasters, that they are each free of nodata at every sampled track point, that the 25 tile footprints fully cover each selected piste and DEM guard margin, or that this measured ground surface passes the game downhill junction gates. No tile SHA-256 has been computed, and no source raster or game pack has been published.

Next: rerun the corrected WFS parser, check individual GeoTIFF headers/provenance/hashes and raster nodata, then recalculate the directionality at nodes **6057592057** and **6057592113**. Never alter original Alpe d'Huez assets for this resort.

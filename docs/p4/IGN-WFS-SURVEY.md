# Les Deux Alpes — official IGN LiDAR HD WFS index evidence

**Date checked:** 2026-11-19. **Scope:** source discovery only, no playable terrain published.

The live read-only GitHub Actions [WFS discovery](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44541721513) queried the official `https://data.geopf.fr/wfs/ows` source layer `IGNF_LIDAR-HD_METADONNEE:metadata`, using CRS:84 and bounding box **W 6.115, S 44.982, E 6.165, N 45.020**.

The original returned GeoJSON (archived as `p4-ign-lidar-tile-index` on the run) contains **25 returned features, 25 total matched features**, and **25 nonempty `url_mnt` properties**. These are **official ground-elevation MNT links** using `https://data.geopf.fr/wms-r?...REQUEST=GetMap&FORMAT=image/geotiff...` rather than paths ending directly in `.tif`. The first version of the URL checker incorrectly rejected that valid WMS format; the checker was corrected to accept strictly scoped IGN MNT layer and GeoTIFF query parameters while rejecting MNS/MNH URLs.

An observed entry has tile identifier `0945-6437`, mission `21LHD6QM`, edition `2025-02-20Z`, survey end `2021-10-15Z`, Lambert-93 CRS and IGN69 altitude datum. The original response should be consulted for exact per-tile metadata; dates vary and must not be inferred from this one example.

**Not yet established:** that all 25 WMS links successfully download valid GeoTIFF rasters, that they are each free of nodata at every sampled track point, that the 25 tile footprints fully cover each selected piste and DEM guard margin, or that this measured ground surface passes the game downhill junction gates. No tile SHA-256 has been computed, and no source raster or game pack has been published.

Next: rerun the corrected WFS parser, check individual GeoTIFF headers/provenance/hashes and raster nodata, then recalculate the directionality at nodes **6057592057** and **6057592113**. Never alter original Alpe d'Huez assets for this resort.

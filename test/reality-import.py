"""Verify the GIS import with temporary, explicitly synthetic inputs."""

import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from osgeo import gdal

path = Path(__file__).resolve().parents[1] / "tools/reality/import.py"
spec = importlib.util.spec_from_file_location("reality_import", path)
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

gdal.UseExceptions()
with TemporaryDirectory() as directory:
    root = Path(directory)
    dem = root / "test.tif"
    raster = gdal.GetDriverByName("GTiff").Create(str(dem), 300, 260, 1, gdal.GDT_Float32)
    raster.SetGeoTransform((6.0, 0.0006, 0, 45.16, 0, -0.0005))
    raster.SetProjection(importer.spatial_reference(4326).ExportToWkt())
    raster.GetRasterBand(1).WriteArray(np.repeat(3000 - np.arange(260)[:, None] * 4, 300, axis=1))
    raster = None
    osm = root / "test.json"
    osm.write_text(json.dumps({"elements": [{
        "type": "way", "id": 1, "tags": {"piste:type": "downhill", "piste:name": "Synthetic test"},
        "geometry": [{"lat": 45.085, "lon": 6.09}, {"lat": 45.105, "lon": 6.095},
                     {"lat": 45.12, "lon": 6.10}],
    }]}))
    asset = importer.build(dem, osm, "ign", 1)
    grid, piste = asset["grid"], asset["piste"]
    assert grid["step"] == 15
    assert 2 < grid["cols"] <= 1200 and 2 < grid["rows"] <= 1200
    assert len(grid["heights"]) == grid["rows"] * grid["cols"]
    assert piste["osmWay"] == 1
    assert piste["points"][0][1] > piste["points"][-1][1], "reverse uphill OSM order"
    try:
        importer.build(dem, osm, "ign", 99)
    except ValueError as error:
        assert "No named downhill OSM way" in str(error)
    else:
        raise AssertionError("Missing way unexpectedly accepted")
    print("GIS import passed: reprojection, sampled grid, downhill ordering and missing way rejection")

"""Offline tests for IGN real tile index discovery; no fake production DEM."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "p4_ign_tiles", ROOT / "tools/reality/p4_ign_tiles.py")
tiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tiles)


class TestIgnTileIndex(unittest.TestCase):
    def test_query_uses_bounded_crs84_geo_bbox(self):
        args = tiles.params((6.115, 44.982, 6.165, 45.020))
        self.assertEqual(args["TYPENAMES"], "IGNF_LIDAR-HD_METADONNEE:metadata")
        self.assertEqual(args["BBOX"], "6.115,44.982,6.165,45.02,CRS:84")
        for bbox in ((6, 45, 6, 46), (6, 45, 6.5, 45.1),
                     (6, 46, 5, 47), (-190, 44, 6, 45)):
            with self.assertRaises(ValueError):
                tiles.params(bbox)

    def test_only_actual_mnt_urls_pass(self):
        good = "https://data.geopf.fr/telechargement/download/test/MNT_tile.tif"
        self.assertEqual(tiles.approved_tile_url(good), good)
        for value in (None, "http://data.geopf.fr/file.tif",
                      "https://example.org/MNT.tif",
                      "https://data.geopf.fr/MNS.tif.exe",
                      "https://user:pass@data.geopf.fr/MNT.tif",
                      "file:///tmp/dem.tif"):
            self.assertIsNone(tiles.approved_tile_url(value))

    def test_metadata_is_not_published_as_dem(self):
        doc = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "id": "valid", "properties": {
                "url_mnt": "https://data.geopf.fr/download/A.tif",
                "url_mns": "https://data.geopf.fr/download/B.tif",
                "date_edition": "2026-10-10"}},
            {"type": "Feature", "id": "no-ground", "properties": {
                "url_mns": "https://data.geopf.fr/download/B.tif"}}]}
        result = tiles.summarize(doc, tiles.DEFAULT_BBOX)
        self.assertEqual(result["stage"], "index_only_not_dem_verified")
        self.assertEqual(result["featuresWithApprovedMntUrl"], 1)
        self.assertEqual(result["returnedFeatures"], 2)
        self.assertIsNone(result["tiles"][0]["mntUrl"] if result["tiles"][0]["featureId"] == "no-ground" else result["tiles"][1]["mntUrl"])
        with self.assertRaises(ValueError):
            tiles.summarize({"error": "rate limited"}, tiles.DEFAULT_BBOX)


if __name__ == "__main__":
    unittest.main()

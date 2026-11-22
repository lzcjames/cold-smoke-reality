import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "staging_dem", Path("tools/reality/export_measured_resort_grid.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def ways():
    return [{"id": 71, "type": "way", "drawable": True,
             "names": ["Jandri 2"], "nodes": [101, 102, 103],
             "coordinates": [[80, 100], [125, 100], [170, 100]],
             "tags": {"piste:type": "downhill"}}]


class MeasuredGridStagingTest(unittest.TestCase):
    def test_real_measured_grid_staging_metadata_and_size(self):
        result = mod.measured_grid(ways(), lambda lon, lat: (lon, lat),
                                   lambda x, y: 2200 + (y - x) / 100,
                                   step_m=15, margin_m=45)
        g = result["grid"]
        self.assertEqual(len(g["heights"]), g["cols"] * g["rows"])
        self.assertEqual(g["cols"], 13)
        self.assertEqual(g["rows"], 7)
        self.assertEqual(result["originalSourceWays"], [71])
        self.assertEqual(g["east"], 30)
        self.assertEqual(g["north"], 150)
        self.assertGreater(result["verifiedSourceLineSamples"], 15)
        self.assertLess(result["approxUncompressedHeightBytes"], 1024)

    def test_reject_source_ground_holes_on_line(self):
        def height(x, y):
            return float("nan") if 108 < x < 115 and y == 100 else 2200.
        with self.assertRaisesRegex(ValueError, "Unmeasured original line interior"):
            mod.measured_grid(ways(), lambda x, y: (x, y), height)

    def test_reject_source_ground_holes_on_grid(self):
        with self.assertRaisesRegex(ValueError, "Unmeasured source terrain"):
            mod.measured_grid(ways(), lambda x, y: (x, y),
                              lambda x, y: None if x == 75 and y == 150 else 2200)

    def test_refuses_unbounded_large_single_pack(self):
        huge = [{"id": 88, "coordinates": [[0, 0], [100000, 0]]}]
        with self.assertRaisesRegex(ValueError, "too large"):
            mod.measured_grid(huge, lambda x, y: (x, y),
                              lambda x, y: 2000)

    def test_only_genuine_downhill_osm_ways_selected(self):
        data = {"source": "OpenStreetMap / Overpass",
                "originalResponseSHA256": "a" * 64,
                "features": ways()}
        self.assertEqual(len(mod.source_ways(data, "Jandri 2")), 1)
        data["features"][0]["tags"]["piste:type"] = "nordic"
        with self.assertRaises(ValueError):
            mod.source_ways(data, "Jandri 2")

    def test_original_tile_hashes_are_rechecked(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "0945-6440.tif"
            p.write_bytes(b"real source fixture")
            good_sha = hashlib.sha256(p.read_bytes()).hexdigest()
            report = {"status": "complete_real_mosaic_and_profiles_not_published",
                      "sourceTiles": [{"tile": "0945-6440", "sha256": good_sha}],
                      "osmWayProfiles": [{"osmWay": 71}],
                      "crossTileEdges": [{}]}
            self.assertEqual(mod.validate_sources(report, folder,
                expected_tiles=1), ["0945-6440"])
            p.write_bytes(b"altered")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                mod.validate_sources(report, folder, expected_tiles=1)


if __name__ == "__main__":
    unittest.main()

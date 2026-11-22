import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "shipdem", Path("tools/reality/audit_shipped_osm_dem.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def grid(cols=9):
    return {"east": 0, "north": 80, "step": 10,
            "cols": cols, "rows": cols,
            "heights": [200.0] * (cols * cols)}


def index(points):
    return {
        "source": "OpenStreetMap / Overpass",
        "originalResponseSHA256": "a" * 64,
        "features": [{
            "type": "way", "drawable": True, "id": 333,
            "names": ["Jandri 2"],
            "nodes": list(range(100, 100 + len(points))),
            "coordinates": points,
        }],
    }


def asset(g):
    return {"id": "les-deux-alpes", "grid": g,
            "provenance": {"demSha256": "b" * 64}}


class ShippedDemCoverageTest(unittest.TestCase):
    def test_real_grid_within_margin(self):
        a = mod.inspect(index([(20, 40), (60, 40)]),
                        asset(grid()), lambda x, y: (x, y))
        self.assertEqual(a["sourceWayCount"], 1)
        self.assertEqual(a["fullyDetailedWayCount"], 1)
        self.assertTrue(a["noGameplayAuthorization"])
        self.assertFalse(a["ways"][0]["approvedForGameplay"])

    def test_missing_between_covered_endpoints(self):
        g = grid()
        g["heights"][4 * 9 + 4] = float("nan")
        r = mod.inspect(index([(20, 40), (60, 40)]),
                        asset(g), lambda x, y: (x, y))
        self.assertEqual(r["fullyDetailedWayCount"], 0)
        self.assertEqual(r["ways"][0]["coveredVertices"], 2)
        self.assertEqual(r["ways"][0]["uncoveredSegmentIndices"], [1])

    def test_outside_real_grid_is_not_backdrop_filled(self):
        r = mod.inspect(index([(20, 40), (100, 40)]),
                        asset(grid()), lambda x, y: (x, y))
        self.assertFalse(r["ways"][0]["fullCentrelineDetailAndMargin"])

    def test_margin_rejects_edge(self):
        r = mod.inspect(index([(0, 40), (60, 40)]),
                        asset(grid()), lambda x, y: (x, y))
        self.assertEqual(r["fullyDetailedWayCount"], 0)

    def test_invalid_source_node_count(self):
        raw = index([(20, 40), (60, 40)])
        raw["features"][0]["nodes"] = [100]
        with self.assertRaises(ValueError):
            mod.inspect(raw, asset(grid()), lambda x, y: (x, y))


if __name__ == "__main__":
    unittest.main()

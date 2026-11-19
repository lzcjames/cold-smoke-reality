"""Unit tests for real OSM node-ID topology audit (only synthetic fixtures)."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "tools/reality/p4_audit.py"
spec = importlib.util.spec_from_file_location("p4audit", path)
p4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p4)


def way(ident, name, nodes, coords):
    return {
        "type": "way", "id": ident,
        "tags": {"piste:type": "downhill", "piste:name": name,
                 "piste:difficulty": "intermediate"},
        "nodes": nodes,
        "geometry": [{"lat": lat, "lon": lon} for lat, lon in coords],
    }


A = (45.019, 6.137)
B = (45.017, 6.138)
C = (45.015, 6.139)
D = (45.013, 6.140)
E = (45.011, 6.141)
F = (45.009, 6.142)


class AuditTests(unittest.TestCase):
    def test_exact_shared_node_creates_component(self):
        elements = [
            way(11, "TEST-only A", [1, 2, 3], [A, B, C]),
            way(12, "TEST-only B", [2, 4, 5], [B, D, E]),
            way(13, "TEST-only C", [5, 6], [E, F]),
        ]
        result = p4.audit({"osm3s": {"timestamp_osm_base": "2026-11-19T00:00:00Z"},
                           "elements": elements})
        self.assertEqual(result["eligibleNamedWays"], 3)
        self.assertEqual(result["largestComponentWayCount"], 3)
        self.assertEqual(result["exactSharedNodeJunctionCandidates"], 2)
        self.assertEqual({x["osmNode"] for x in result["sharedNodes"]}, {2, 5})

    def test_nearby_or_identical_coordinates_not_enough_without_shared_id(self):
        elements = [
            way(11, "TEST-only A", [1, 2], [A, B]),
            way(12, "TEST-only B", [99, 4], [B, D]),
        ]
        result = p4.audit({"elements": elements})
        self.assertEqual(result["largestComponentWayCount"], 1)
        self.assertEqual(result["exactSharedNodeJunctionCandidates"], 0)

    def test_conflicting_shared_coordinates_are_rejected(self):
        elements = [
            way(11, "TEST-only A", [1, 2], [A, B]),
            way(12, "TEST-only B", [2, 4], [C, D]),
        ]
        with self.assertRaisesRegex(ValueError, "conflicting"):
            p4.audit({"elements": elements})

    def test_discard_lifts_unnamed_short_and_areas(self):
        elements = [
            way(11, "Short", [1, 2], [A, (45.01899, 6.137)]),
            {**way(12, "Lift", [3, 4], [A, C]),
             "tags": {"aerialway": "gondola"}},
            {**way(13, "Unnamed", [5, 6], [C, D]),
             "tags": {"piste:type": "downhill"}},
            {**way(14, "Area", [7, 8], [D, E]),
             "tags": {"piste:type": "downhill", "piste:name": "Area", "area": "yes"}},
        ]
        self.assertEqual(p4.audit({"elements": elements})["eligibleNamedWays"], 0)


if __name__ == "__main__":
    unittest.main()

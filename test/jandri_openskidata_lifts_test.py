import json
import tempfile
import unittest
from pathlib import Path
from tools.reality.jandri_openskidata_lifts import (
    bbox_intersects_geometry, classify_feature, validate_metadata,
    report_for_snapshot,
)


def lift(osm_id="way/9911"):
    return {"type": "Feature", "geometry": {
        "type": "LineString", "coordinates": [[6.18, 44.99, 2300], [6.19, 45.00, 2600]]
    }, "properties": {
        "id": "daily-lift-1", "name": "Observed demo source",
        "liftType": "gondola", "status": "operating",
        "sources": [{"type": "openstreetmap", "id": osm_id}],
        "stations": [], "duration": 450, "capacity": 1800
    }}


def station():
    return {"type": "Feature", "geometry": {
        "type": "Point", "coordinates": [6.19, 45.00, 2600]},
        "properties": {"id": "daily-station-1", "spotType": "lift_station",
                       "liftId": "daily-lift-1", "position": "top",
                       "entry": False, "exit": True,
                       "sources": [{"type": "openstreetmap", "id": "node/22"}]}}


def metadata():
    return {"version": 1, "formatVersion": "16.0.0",
            "source": {"openStreetMap": {"dataTimestamp": "2026-11-19T01:00:00Z"}},
            "run": {"finishedAt": "2026-11-20T01:41:30Z"},
            "counts": {"lifts": 1, "spots": 1}}


class TestOpenSkiDataJandri(unittest.TestCase):
    def test_spatially_relevant_lift_and_station_remain_unapproved(self):
        item = classify_feature(lift(), "lifts")
        self.assertEqual(item["upstreamOSMIds"], ["way/9911"])
        self.assertFalse(item["approvedForGameplay"])
        self.assertFalse(item["approvedForBoarding"])
        spot = classify_feature(station(), "spots")
        self.assertEqual(spot["liftDailyFeatureId"], "daily-lift-1")
        self.assertFalse(spot["approvedForBoarding"])

    def test_reject_spatially_distant_and_malformed(self):
        far = lift()
        far["geometry"]["coordinates"] = [[-120, 43], [-121, 43]]
        self.assertIsNone(classify_feature(far, "lifts"))
        with self.assertRaisesRegex(ValueError, "Malformed"):
            bbox_intersects_geometry({"type": "LineString", "coordinates": [[6.2, "bogus"]]})

    def test_validate_daily_metadata_and_reject_missing_counts(self):
        validate_metadata(metadata())
        bad = metadata()
        del bad["counts"]["spots"]
        with self.assertRaisesRegex(ValueError, "record counts"):
            validate_metadata(bad)

    def test_read_actual_geojson_structure_and_check_totals(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for kind, feature in (("lifts", lift()), ("spots", station())):
                (root / (kind + ".geojson")).write_text(json.dumps({
                    "type": "FeatureCollection", "features": [feature]}))
            try:
                report = report_for_snapshot(
                    metadata(), root / "lifts.geojson", root / "spots.geojson")
            except ImportError:
                self.skipTest("ijson only required in CI/production")
            self.assertEqual(report["nearbyCounts"], {"lifts": 1, "spots": 1})
            self.assertTrue(report["candidates"]["spots"][0]["linkedLocalLiftRecord"])
            self.assertEqual(report["approvedSkiLiftRideLinks"], 0)
            self.assertFalse(report["readyForGameplay"])
            changed = metadata()
            changed["counts"]["lifts"] = 2
            with self.assertRaisesRegex(ValueError, "record count mismatch"):
                report_for_snapshot(changed, root / "lifts.geojson",
                                    root / "spots.geojson")


if __name__ == "__main__":
    unittest.main()

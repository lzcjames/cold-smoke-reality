import unittest
from tools.reality.jandri_lift_station_crosswalk import distance_to_segment, nearest_way, inspect

def fixture():
    osm={"originalResponseSHA256":"40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26","wayCount":37,
         "features":[{"type":"way","drawable":True,"id":i,"names":["Jandri"],"coordinates":[[6.15,45.0],[6.16,45.0]]}
                     for i in range(37)]}
    def lift(name,osm_id,daily):
        return {"name":name,"upstreamOSMIds":[osm_id],"dailyFeatureId":daily,"status":"operating",
                "geometryType":"LineString","geometryCoordinates":[[6.15,45.0],[6.2,45.0]]}
    lifts=[lift("Jandri I","way/1229057878","lift-1"),
           lift("Jandri II","way/1361005452","lift-2")]
    lifts += [lift("other",f"way/{2000+i}",f"other-{i}") for i in range(43)]
    def station(daily, lift_id):
        return {"dailyFeatureId":daily,"liftDailyFeatureId":lift_id,
                "geometryCoordinates":[6.155,45.0,2000],
                "upstreamOSMIds":["node/45"],"position":"top","entry":False,"exit":True}
    stations=[station("station-1","lift-1"),station("station-2","lift-2")]
    stations += [station(f"otherstation-{i}",f"other-{i}") for i in range(72)]
    report={"stage":"openskidata_Jandri_lifts_station_discovery_only",
            "readyForGameplay":False,"nearbyCounts":{"lifts":45,"spots":74},
            "publishedBuildUTC":"2026-11-20T11:59:00Z",
            "sha256":{"lifts":"a"*64,"spots":"b"*64},
            "candidates":{"lifts":lifts,"spots":stations}}
    return report,osm

class StationCrosswalkTests(unittest.TestCase):
    def test_segment_projection_uses_interiors_not_just_endpoints(self):
        self.assertAlmostEqual(distance_to_segment((5,3),(0,0),(10,0)),3)
        self.assertAlmostEqual(distance_to_segment((15,3),(0,0),(10,0)),(34)**0.5)
    def test_two_lifts_and_station_proximity_no_auto_approval(self):
        report,osm=fixture()
        out=inspect(report,osm)
        self.assertEqual(len(out["lifts"]),2)
        self.assertFalse(out["readyForGame"])
        for lift in out["lifts"]:
            self.assertEqual(lift["sourceStationCount"],1)
            self.assertFalse(lift["expressToTopEnabled"])
            self.assertFalse(lift["stations"][0]["boardingVerified"])
            self.assertFalse(lift["stations"][0]["nearestPinnedPiste"]["approvedPhysicalAccess"])
    def test_duplicate_or_missing_real_lift_is_blocked(self):
        report,osm=fixture()
        report["candidates"]["lifts"][1]["upstreamOSMIds"]=[]
        with self.assertRaisesRegex(ValueError,"Missing or ambiguous"):
            inspect(report,osm)
        report,osm=fixture()
        report["candidates"]["lifts"][2]["upstreamOSMIds"]=["way/1229057878"]
        with self.assertRaisesRegex(ValueError,"Missing or ambiguous"):
            inspect(report,osm)
    def test_unknown_inventory_and_modified_osm_blocks(self):
        report,osm=fixture()
        report["nearbyCounts"]["spots"]=73
        with self.assertRaisesRegex(ValueError,"inventory"):
            inspect(report,osm)
        report,osm=fixture()
        osm["originalResponseSHA256"]="0"*64
        with self.assertRaisesRegex(ValueError,"provenance"):
            inspect(report,osm)

if __name__=="__main__":
    unittest.main()

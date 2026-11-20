import math
import unittest
from tools.reality.jandri_lift_station_ground import (
    tile_at, station_inventory, ground_sample, PINNED_OSM,
)

class FakeBand:
    def ReadAsArray(self,x,y,w,h):
        import numpy as np
        return np.full((h,w), 2150.0)
    def GetNoDataValue(self):
        return -9999

class FakeDataset:
    RasterXSize=2000
    RasterYSize=2000
    def GetGeoTransform(self):
        return (945000-.25,.5,0,6438000+.25,0,-.5)
    def GetRasterBand(self,n):
        return FakeBand()

def fixture():
    lift_keys=["way/1229057878","way/1361005452"]
    stations=[]
    lifts=[]
    for i,key in enumerate(lift_keys):
        count=4 if i==0 else 2
        group=[]
        for j in range(count):
            group.append({"dailyStationId":f"{i}-{j}",
                          "coordinatesWGS84":[6.15+j*.001,45.0],
                          "positionTag":"top" if j else "bottom",
                          "upstreamOSMIds":[f"node/{i*10+j}"]})
        lifts.append({"upstreamOSMId":key,"lift":"Jandri I" if i==0 else "Jandri II",
                      "stations":group,"sourceStationCount":count})
    return {"stage":"Jandri_I_II_OpenSkiData_station_piste_proximity_only",
            "pinnedOSMSourceSHA256":PINNED_OSM,"readyForGame":False,"lifts":lifts}

class JandriGroundTests(unittest.TestCase):
    def test_lambert_tile_grid_north_edge(self):
        self.assertEqual(tile_at(945500,6437750),"0945-6438")
        self.assertEqual(tile_at(945500,6438250),"0945-6439")
        self.assertEqual(tile_at(946000,6438000),"0946-6438")
        with self.assertRaisesRegex(ValueError,"Non-finite"):
            tile_at(math.nan,6438000)
    def test_coverage_is_explicit_and_never_authorizes_teleport(self):
        report=fixture()
        def project(lon,lat):return 945000+(lon-6.15)*100000,6437750
        rows=station_inventory(report,project,{"0945-6438","0946-6438"})
        self.assertEqual(len(rows),6)
        self.assertTrue(rows[0]["insideVerifiedJandri24TileInventory"])
        self.assertTrue(all(not s["expressToTopEnabled"] for s in rows))
        self.assertTrue(all(s["ignGroundHeightM"] is None for s in rows))
        empty=station_inventory(report,project,set())
        self.assertTrue(all(not s["insideVerifiedJandri24TileInventory"] for s in empty))
    def test_fake_ground_pixel_sampling(self):
        try:
            import numpy
        except ImportError:
            self.skipTest("NumPy only required for the real GDAL audit")
        self.assertAlmostEqual(ground_sample(FakeDataset(),945500,6437750),2150)
        self.assertIsNone(ground_sample(FakeDataset(),944999.5,6437750))
    def test_missing_station_identity_is_blocking(self):
        r=fixture();r["lifts"][0]["stations"][1]["dailyStationId"]="0-0"
        with self.assertRaisesRegex(ValueError,"Duplicate"):
            station_inventory(r,lambda x,y:(945500,6437750),set())
        r=fixture();r["lifts"][0]["sourceStationCount"]=3
        with self.assertRaisesRegex(ValueError,"inconsistent"):
            station_inventory(r,lambda x,y:(945500,6437750),set())
    def test_modified_source_or_bad_coords_fail(self):
        r=fixture();r["pinnedOSMSourceSHA256"]="0"*64
        with self.assertRaisesRegex(ValueError,"provenance"):
            station_inventory(r,lambda x,y:(945500,6437750),set())
        r=fixture();r["lifts"][0]["stations"][0]["coordinatesWGS84"]=[1000,45]
        with self.assertRaisesRegex(ValueError,"invalid WGS84"):
            station_inventory(r,lambda x,y:(945500,6437750),set())

if __name__=="__main__":
    unittest.main()

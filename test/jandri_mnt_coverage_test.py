import copy
import unittest
from tools.reality.jandri_mnt_coverage import plan, evaluate, PINNED_SHA, PINNED_STAMP

def way(i, nodes, points):
    return {"type":"way", "drawable":True, "id":i, "nodes":nodes,
            "coordinates":points}

def snapshot():
    return {"originalResponseSHA256":PINNED_SHA,
            "snapshotTimestampUTC":PINNED_STAMP,"wayCount":37,
            "features":[way(i,[i*10,i*10+1],[[6.12,45.0],[6.121,45.001]])
                        for i in range(37)]}

class JandriMntCoverageTest(unittest.TestCase):
    def plan(self):
        return plan(snapshot(),lambda lon, lat:(946000+(lon-6.12)*1000,
                                                6439000+(lat-45)*1000),margin=250)

    def test_tile_range_includes_projected_margin(self):
        result=self.plan()
        self.assertEqual(result["requiredTileIds"],["0945-6439","0945-6440",
                                                     "0946-6439","0946-6440"])
        self.assertEqual(result["marginM"],250)
        self.assertIn("Jandri 5",result["missingRouteGeometry"])

    def test_reject_unpinned_or_incomplete_osm(self):
        sample=snapshot()
        sample["originalResponseSHA256"]="wrong"
        with self.assertRaisesRegex(ValueError,"pinned"):plan(sample,lambda a,b:(a,b))
        sample=snapshot()
        sample["features"].pop()
        with self.assertRaisesRegex(ValueError,"Incomplete"):plan(sample,lambda a,b:(a,b))

    def test_metadata_gap_is_not_success(self):
        p=self.plan()
        response={"type":"FeatureCollection","features":[
            {"properties":{"coordonnees_nw":"0945-6439","url_mnt":"https://invalid.test/MNT.tif"}}]}
        report=evaluate(p,response)
        self.assertFalse(report["coverageMetadataComplete"])
        self.assertFalse(report["safeToPublish3D"])
        self.assertEqual(len(report["missingTiles"]),3)
        self.assertEqual(report["unapprovedMntUrls"],["0945-6439"])

    def test_truncated_response_rejected(self):
        with self.assertRaisesRegex(ValueError,"truncated"):
            evaluate(self.plan(),{"type":"FeatureCollection",
                                  "numberMatched":500,"features":[]})

    def test_duplicate_tile_rejected(self):
        f={"properties":{"coordonnees_nw":"0945-6439","url_mnt":None}}
        with self.assertRaisesRegex(ValueError,"Duplicate"):
            evaluate(self.plan(),{"type":"FeatureCollection","features":[f,f]})

if __name__=="__main__":
    unittest.main()

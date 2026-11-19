import hashlib
import json
import unittest
from tools.reality.jandri_osm_survey import build_index, query

class JandriSurveyTest(unittest.TestCase):
    def setUp(self):
        self.doc={"osm3s":{"timestamp_osm_base":"2026-11-19T08:00:00Z"},"elements":[
            {"type":"way","id":123,"tags":{"name":"Jandri 1","piste:type":"downhill","piste:difficulty":"easy"},
             "nodes":[3,4,5],"geometry":[
               {"lat":45.0,"lon":6.10},{"lat":44.999,"lon":6.101},{"lat":44.998,"lon":6.102}]},
            {"type":"way","id":124,"tags":{"name":"Jandri Tronçon 1","piste:type":"downhill","aerialway":"gondola"},
             "nodes":[7,8],"geometry":[{"lat":45.0,"lon":6.10},{"lat":45.001,"lon":6.11}]},
            {"type":"relation","id":234,"tags":{"name":"Balade du Jandri","route":"piste","piste:type":"downhill"},
             "members":[{"type":"way","ref":123}]},
            {"type":"way","id":125,"tags":{"name":"Demoiselles","piste:type":"downhill"},
             "nodes":[9,10],"geometry":[{"lat":45.0,"lon":6.12},{"lat":45.001,"lon":6.13}]}]}
    def report(self):
        raw=json.dumps(self.doc,sort_keys=True).encode()
        return build_index(self.doc,raw,"offline")
    def test_only_real_downhill(self):
        r=self.report()
        self.assertEqual([x["id"] for x in r["features"]],[234,123])
        self.assertEqual(r["wayCount"],1)
        self.assertEqual(r["relationCount"],1)
        self.assertEqual(r["features"][1]["nodes"],[3,4,5])
        self.assertGreater(r["features"][1]["approxPlanarLengthM"],200)
        self.assertFalse(r["features"][0]["drawable"])
    def test_fail_missing_geometry(self):
        self.doc["elements"][0]["geometry"]=[]
        with self.assertRaisesRegex(ValueError,"geometry"):
            self.report()
    def test_immutable_source_hash(self):
        r=self.report()
        raw=json.dumps(self.doc,sort_keys=True).encode()
        self.assertEqual(r["originalResponseSHA256"],hashlib.sha256(raw).hexdigest())
    def test_overpass_scoped_to_named_downhill(self):
        q=query()
        self.assertIn('["name"~"Jandri",i]',q)
        self.assertIn('["piste:type"="downhill"]',q)
        self.assertNotIn("aerialway",q)
    def test_empty_not_fake(self):
        self.doc["elements"]=[]
        with self.assertRaisesRegex(ValueError,"No real"):
            self.report()

if __name__=="__main__":
    unittest.main()

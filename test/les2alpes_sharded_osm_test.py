import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location(
    "shards",Path("tools/reality/les2alpes_sharded_osm.py"))
import sys
sys.path.insert(0,"tools/reality")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fixture(i=0):
    return json.dumps({"osm3s":{"timestamp_osm_base":"2026-11-22T17:00:00Z"},
      "elements":[{"id":101+i,"type":"way","nodes":[11+i*2,12+i*2],
        "tags":{"piste:type":"downhill","name":"Demo piste"},
        "geometry":[{"lon":6.11,"lat":45.0},{"lon":6.12,"lat":45.01}]}]}).encode()

class ShardSurvey(unittest.TestCase):
    def test_quadrants_exactly_partition_bbox(self):
        boxes=mod.shards()
        self.assertEqual(len(boxes),4)
        self.assertEqual(boxes[0],(44.97,6.05,45.03,6.14))
        self.assertEqual(boxes[-1],(45.03,6.14,45.09,6.23))

    def test_independent_raw_sources_preserved_without_fabricated_combining(self):
        sources=iter([fixture(i) for i in range(4)])
        with tempfile.TemporaryDirectory() as temp:
            result=mod.survey(temp,fetch_fn=lambda _: next(sources))
            self.assertTrue(result["allShardsDownloaded"])
            self.assertFalse(result["combinedAtomicSnapshot"])
            self.assertFalse(result["approvedForGameplay"])
            self.assertEqual(len(result["shards"]),4)
            for i in range(4):
                src=Path(temp)/f"quadrant-{i+1}-overpass-raw.json"
                self.assertEqual(src.read_bytes(),fixture(i))
                self.assertEqual(result["shards"][i]["namedDownhillWays"],1)

    def test_missing_quadrant_remains_missing_not_made_up(self):
        calls=[0]
        def fetch(_):
            calls[0]+=1
            if calls[0]==2: raise TimeoutError("source timeout")
            return fixture(calls[0])
        with tempfile.TemporaryDirectory() as temp:
            result=mod.survey(temp,fetch_fn=fetch)
            self.assertEqual(result["numberOfIndependentResponses"],3)
            self.assertFalse(result["allShardsDownloaded"])
            self.assertEqual(result["shards"][1]["status"],"blocked_no_usable_source")
            self.assertFalse((Path(temp)/"quadrant-2-overpass-raw.json").exists())
            self.assertFalse(result["wholeResortCoverageApproved"])

if __name__=="__main__":
    unittest.main()

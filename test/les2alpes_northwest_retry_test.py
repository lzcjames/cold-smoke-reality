import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0,'tools/reality')
spec=importlib.util.spec_from_file_location('shard',Path('tools/reality/les2alpes_sharded_osm.py'))
shard=importlib.util.module_from_spec(spec)
spec.loader.exec_module(shard)

NW=(45.03,6.05,45.09,6.14)

def empty_response():
    return json.dumps({'osm3s':{'timestamp_osm_base':'2026-11-22T17:00:00Z'},
      'elements':[]}).encode()

class NorthwestSourceRetry(unittest.TestCase):
    def test_only_original_missing_quadrant_is_split(self):
        small=shard.shards(NW)
        self.assertEqual(len(small),4)
        self.assertEqual(small[0][0],NW[0])
        self.assertEqual(small[0][1],NW[1])
        self.assertAlmostEqual(small[-1][2],NW[2])
        self.assertAlmostEqual(small[-1][3],NW[3])
        self.assertAlmostEqual(sum((b[2]-b[0])*(b[3]-b[1]) for b in small),
          (NW[2]-NW[0])*(NW[3]-NW[1]))

    def test_partial_missing_source_never_declares_resort_complete(self):
        calls=[0]
        def fetch(_):
            calls[0]+=1
            if calls[0]==2: raise TimeoutError('Overpass unavailable')
            return empty_response()
        with tempfile.TemporaryDirectory() as folder:
            result=shard.survey(folder,bbox=NW,fetch_fn=fetch)
            self.assertEqual(result['numberOfIndependentResponses'],3)
            self.assertFalse(result['allShardsDownloaded'])
            self.assertEqual(result['shards'][1]['status'],'blocked_no_usable_source')
            self.assertFalse(result['approvedForGameplay'])
            self.assertFalse(result['wholeResortCoverageApproved'])
            self.assertEqual(json.loads((Path(folder)/'status.json').read_text())
             ['requestedBBoxWGS84'],list(NW))

if __name__=='__main__':
    unittest.main()

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location(
    "regional_dem",Path("tools/reality/plan_regional_dem_tiles.py"))
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fixture(folder, *, conflict=False, tamper=False):
    folder=Path(folder)
    shards=[]
    for i in range(1,5):
        name=f"quadrant-{i}"
        if i in (3,4):
            shards.append({"id":name,"status":"blocked_no_usable_source"})
            continue
        coords=[[6.1,45.0],[6.15+(0.001 if conflict and i==2 else 0),45.0]]
        geometry=[{"lon":lon,"lat":lat} for lon,lat in coords]
        raw_doc={"osm3s":{"timestamp_osm_base":"2026-11-22T17:00:00Z"},
                 "elements":[{"type":"way","id":701,
                   "tags":{"piste:type":"downhill","name":"Original source"},
                   "nodes":[100,101],"geometry":geometry}]}
        raw=json.dumps(raw_doc,separators=(",",":")).encode()
        digest=hashlib.sha256(raw).hexdigest()
        filename=name+"-overpass-raw.json"
        (folder/filename).write_bytes(raw if not (tamper and i==2) else b"{}")
        index={"source":"OpenStreetMap / Overpass",
               "originalResponseSHA256":digest,
               "snapshotTimestampUTC":"2026-11-22T17:00:00Z",
               "features":[{"id":701,"coordinates":coords,
                            "nodes":[100,101],"type":"way","drawable":True,
                            "names":["Original source"]}]}
        (folder/(name+"-source-index.json")).write_text(json.dumps(index))
        shards.append({"id":name,"status":"source_candidates_unreviewed",
                       "file":filename,"rawResponseSHA256":digest,
                       "timestampUTC":"2026-11-22T17:00:00Z"})
    (folder/"status.json").write_text(json.dumps({
        "schema":"cold-smoke-regional-shard-survey/v1",
        "resortId":"les-deux-alpes",
        "approvedForGameplay":False,
        "wholeResortCoverageApproved":False,
        "combinedAtomicSnapshot":False,
        "shards":shards
    }))


def project(lon,lat):
    return (950900+(lon-6.1)*20000,6440500+(lat-45)*20000)


class RealSourceRegionalTerrainPlan(unittest.TestCase):
    def test_plan_follows_original_line_not_only_endpoints(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture(folder)
            result=mod.build_plan(folder,project,sampling_m=10,margin_m=90)
            self.assertEqual(result["candidateOriginalWayCount"],1)
            self.assertEqual(result["includedUnconflictedWays"],1)
            self.assertEqual(result["missingRegionalShards"],["quadrant-3","quadrant-4"])
            self.assertTrue(result["candidateSourceTileCount"]>=2)
            self.assertTrue(result["candidateTilesOutsideOriginal24"]>=1)
            self.assertFalse(result["approvedForGameplay"])
            self.assertFalse(result["allOsmWaysConfirmedInsideLesDeuxAlpes"])
            self.assertTrue(all(r["sourceWayIds"]==[701] for r in result["tiles"]))

    def test_mismatched_versions_are_not_silently_promoted(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture(folder,conflict=True)
            result=mod.build_plan(folder,project)
            self.assertEqual(result["conflictingOriginalWayIds"],[701])
            self.assertEqual(result["candidateSourceTileCount"],0)
            self.assertEqual(result["includedUnconflictedWays"],0)

    def test_tampered_original_http_bytes_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture(folder,tamper=True)
            with self.assertRaisesRegex(ValueError,"hash mismatch"):
                mod.build_plan(folder,project)

    def test_unapproved_neighbouring_way_never_claimed_as_resort(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture(folder)
            result=mod.build_plan(folder,project)
            self.assertTrue(all(not r["resortMembershipVerified"] for r in result["tiles"]))
            self.assertFalse(result["newRegionalDEMDownloaded"])

    def test_small_tile_budget_cannot_be_bypassed(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture(folder)
            with self.assertRaisesRegex(ValueError,"budget exceeded"):
                mod.build_plan(folder,project,max_tiles=1)


if __name__=="__main__":
    unittest.main()

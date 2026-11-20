import math
import unittest
from tools.reality.jandri_local_node_probe import measure_shared_nodes

class SharedJandriNodeTests(unittest.TestCase):
    def setUp(self):
        self.index = {"features":[
            {"type":"way","drawable":True,"id":1,"names":["A"],
             "nodes":[10,11,12],"coordinates":[[0,0],[10,0],[20,0]]},
            {"type":"way","drawable":True,"id":2,"names":["B"],
             "nodes":[20,11,21],"coordinates":[[10,-10],[10,0],[10,10]]}
        ]}

    def test_shared_node_local_arms_are_measured_but_not_approved(self):
        result = measure_shared_nodes(self.index,lambda x,y:(x,y),
                                      lambda x,y:2000-y, sample_distance_m=5)
        self.assertEqual(len(result),1)
        node = result[0]
        self.assertEqual(node["osmNode"],11)
        self.assertEqual(node["measuredGroundHeightM"],2000)
        self.assertEqual(len(node["arms"]),4)
        self.assertTrue(node["allArmsMeasured"])
        self.assertFalse(node["approvedPlayableConnection"])
        self.assertFalse(node["approvedDirectionalSign"])
        self.assertEqual(sorted(a["gradeAwayFromNodePct"] for a in node["arms"]),
                         [-100.,0.,0.,100.])

    def test_identical_coordinates_not_shared_identity(self):
        self.index["features"][1]["nodes"][1] = 99
        self.assertEqual(measure_shared_nodes(self.index,
                         lambda x,y:(x,y),lambda x,y:1500),[])

    def test_conflicting_coordinates_block_not_join(self):
        self.index["features"][1]["coordinates"][1] = [10.1,0]
        with self.assertRaisesRegex(ValueError,"Conflicting"):
            measure_shared_nodes(self.index,lambda x,y:(x,y),lambda x,y:1500)

    def test_missing_height_or_invalid_step_blocks(self):
        with self.assertRaisesRegex(ValueError,"No real MNT"):
            measure_shared_nodes(self.index,lambda x,y:(x,y),lambda x,y:math.nan)
        with self.assertRaisesRegex(ValueError,"Invalid"):
            measure_shared_nodes(self.index,lambda x,y:(x,y),lambda x,y:1500,0)

if __name__=="__main__":
    unittest.main()

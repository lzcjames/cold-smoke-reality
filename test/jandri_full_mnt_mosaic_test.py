import math
import unittest

from tools.reality.jandri_full_mnt_mosaic import sampled_polyline, score_profile


class FullJandriMntAuditTests(unittest.TestCase):
    def test_grade_measures_source_height_not_osm_difficulty(self):
        measured = sampled_polyline([(0., 0.), (60., 0.), (120., 0.)],
                                    lambda e, n: 2500.0-e/10, step_m=30)
        self.assertEqual(measured["sampleCount"], 5)
        self.assertAlmostEqual(measured["lengthM"],120.0)
        self.assertAlmostEqual(measured["netElevationChangeM"],-12.0)
        self.assertAlmostEqual(measured["cumulativeDescentM"],12.0)
        self.assertAlmostEqual(measured["maxAbsoluteSampleGradePct"],10.0)
        self.assertIn("unconfirmed", measured["direction"])

    def test_geometry_preserves_corners_and_true_length(self):
        profile=sampled_polyline([(0,0),(30,0),(30,40)],
                                 lambda x,y:1000-y)
        self.assertAlmostEqual(profile["lengthM"],70)
        self.assertEqual(profile["sampleCount"],5)
        self.assertEqual(profile["cumulativeDescentM"],40)

    def test_reject_fake_zero_length_and_missing_elevation(self):
        with self.assertRaisesRegex(ValueError,"Repeated"):
            sampled_polyline([(0,0),(0,0)],lambda x,y:1000)
        with self.assertRaisesRegex(ValueError,"Non-finite"):
            sampled_polyline([(0,0),(30,0)],lambda x,y:math.nan)

    def test_osm_node_order_is_not_downhill_certification(self):
        stats=score_profile([(0,1400),(25,1410),(50,1400)])
        self.assertAlmostEqual(stats["cumulativeAscentM"],10)
        self.assertAlmostEqual(stats["cumulativeDescentM"],10)
        self.assertEqual(stats["netElevationChangeM"],0)
        self.assertIn("unconfirmed",stats["direction"])

if __name__=="__main__":
    unittest.main()

import unittest
from tools.reality.jandri_mnt_batch_three import VERIFIED_BEFORE, select_next

class JandriThirdBatchTests(unittest.TestCase):
    def setUp(self):
        self.keys = ["0945-6438", "0945-6439", "0945-6440",
                     "0946-6438", "0946-6439", "0946-6440",
                     "0947-6438", "0947-6439", "0947-6440",
                     "0948-6438", "0948-6439", "0948-6440",
                     "0949-6439"]
    def test_six_new_distinct_ids(self):
        selected = select_next(self.keys)
        self.assertEqual(selected, ["0947-6438", "0947-6439", "0947-6440",
                                    "0948-6438", "0948-6439", "0948-6440"])
        self.assertEqual(len(set(selected)), 6)
        self.assertFalse(set(selected) & VERIFIED_BEFORE)
    def test_reject_duplicate_source_ids(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            select_next(self.keys + ["0949-6439"])
    def test_reject_missing_prior_verified_ids(self):
        with self.assertRaisesRegex(ValueError, "missing previously"):
            select_next([x for x in self.keys if x != "0946-6440"])
    def test_strict_download_limit(self):
        with self.assertRaisesRegex(ValueError, "bounded"):
            select_next(self.keys, count=7)

if __name__ == "__main__":
    unittest.main()

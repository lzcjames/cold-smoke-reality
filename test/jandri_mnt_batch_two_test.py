import unittest
from tools.reality.jandri_mnt_batch_two import PILOT_TILES, batch_keys

class BatchTwoTest(unittest.TestCase):
    def test_exclude_actual_first_pilot_pair_not_just_first_sorted_two(self):
        keys = ["0945-6438", "0945-6439", "0945-6440",
                "0946-6438", "0946-6439", "0946-6440", "0947-6439"]
        self.assertEqual(PILOT_TILES, {"0945-6438", "0946-6438"})
        self.assertEqual(batch_keys(keys),
                         ["0945-6439", "0945-6440", "0946-6439", "0946-6440"])
        self.assertFalse(PILOT_TILES.intersection(batch_keys(keys)))

    def test_reject_missing_history_duplicate_or_overlarge_batch(self):
        with self.assertRaisesRegex(ValueError, "Invalid"):
            batch_keys(["0945-6439", "0946-6439"])
        with self.assertRaisesRegex(ValueError, "Invalid"):
            batch_keys(["0945-6438", "0945-6438", "0946-6438"])
        with self.assertRaisesRegex(ValueError, "exceeds"):
            batch_keys(["0945-6438", "0946-6438", "0945-6439"], count=4)

if __name__ == "__main__":
    unittest.main()

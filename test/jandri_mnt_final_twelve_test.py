import unittest
from tools.reality.jandri_mnt_final_twelve import PREVIOUSLY_VERIFIED, partition_final_twelve

class FinalTwelveTests(unittest.TestCase):
    def setUp(self):
        self.required = sorted(PREVIOUSLY_VERIFIED | {
            f"095{x}-64{y}" for x in range(0, 4) for y in ("38", "39", "40")
        })

    def test_exact_disjoint_inventory(self):
        self.assertEqual(len(self.required), 24)
        first, second = partition_final_twelve(self.required)
        self.assertEqual(len(first), 6)
        self.assertEqual(len(second), 6)
        self.assertFalse(set(first) & set(second))
        self.assertFalse((set(first) | set(second)) & PREVIOUSLY_VERIFIED)
        self.assertEqual(set(first) | set(second) | PREVIOUSLY_VERIFIED, set(self.required))

    def test_missing_real_tile_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "24"):
            partition_final_twelve(self.required[:-1])

    def test_duplicate_source_tile_fails_closed(self):
        keys = list(self.required)
        keys[-1] = keys[-2]
        with self.assertRaisesRegex(ValueError, "distinct"):
            partition_final_twelve(keys)

    def test_missing_previously_verified_id_fails_closed(self):
        keys = list(self.required)
        keys[0] = "0999-6999"
        with self.assertRaisesRegex(ValueError, "provenance"):
            partition_final_twelve(keys)

if __name__ == "__main__":
    unittest.main()

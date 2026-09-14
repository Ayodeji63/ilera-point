import math
import unittest

from vitals_bridge.signal import estimate_heart_rate, mlx_celsius


class SensorMathTests(unittest.TestCase):
    def test_mlx_conversion_matches_sensor_datasheet_formula(self):
        raw = round((36.6 + 273.15) / 0.02)
        self.assertAlmostEqual(mlx_celsius(raw), 36.6, places=1)

    def test_estimates_bpm_from_a_clean_ir_waveform(self):
        sample_rate = 50
        frequency_hz = 1.2  # 72 bpm
        samples = [
            (index / sample_rate, round(95_000 + 1_200 * math.sin(2 * math.pi * frequency_hz * index / sample_rate)))
            for index in range(sample_rate * 10)
        ]
        result = estimate_heart_rate(samples)
        self.assertTrue(70 <= result["heart_rate_bpm"] <= 74)
        self.assertIn(result["sample_quality"], {"fair", "good"})

    def test_rejects_a_no_finger_baseline(self):
        samples = [(index / 50, 2_000) for index in range(500)]
        with self.assertRaisesRegex(ValueError, "No finger"):
            estimate_heart_rate(samples)


if __name__ == "__main__":
    unittest.main()

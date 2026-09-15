import math
import unittest
from unittest.mock import patch

from vitals_bridge.signal import estimate_heart_rate, mlx_celsius

try:
    from vitals_bridge.app import CaptureStore, temperature_result
except ModuleNotFoundError:  # Pure signal tests still run outside the Pi venv.
    CaptureStore = None
    temperature_result = None


def pulse_samples(bpm=72, seconds=10, baseline=95_000, amplitude=1_200):
    sample_rate = 50
    frequency_hz = bpm / 60
    return [
        (
            index / sample_rate,
            round(baseline + amplitude * 0.82 * math.sin(2 * math.pi * frequency_hz * index / sample_rate + 0.08)),
            round(baseline + amplitude * math.sin(2 * math.pi * frequency_hz * index / sample_rate)),
        )
        for index in range(sample_rate * seconds)
    ]


class SensorMathTests(unittest.TestCase):
    def test_mlx_conversion_matches_sensor_datasheet_formula(self):
        raw = round((36.6 + 273.15) / 0.02)
        self.assertAlmostEqual(mlx_celsius(raw), 36.6, places=1)

    def test_estimates_bpm_from_a_clean_timestamped_waveform(self):
        result = estimate_heart_rate(pulse_samples())
        self.assertTrue(70 <= result["heart_rate_bpm"] <= 74)
        self.assertEqual(result["reason"], None)
        self.assertEqual(result["confidence_label"], "good")
        self.assertGreater(result["diagnostics"]["spo2_ratio"], 0)

    def test_trims_the_contact_ramp_before_peak_detection(self):
        samples = pulse_samples()
        ramped = [
            (timestamp, red, infrared + round(35_000 * (1 - timestamp / 1.5))) if timestamp < 1.5 else (timestamp, red, infrared)
            for timestamp, red, infrared in samples
        ]
        result = estimate_heart_rate(ramped)
        self.assertTrue(70 <= result["heart_rate_bpm"] <= 74)

    def test_rejects_a_no_finger_baseline_without_fabricating_bpm(self):
        samples = [(index / 50, 1_800, 2_000) for index in range(500)]
        result = estimate_heart_rate(samples)
        self.assertIsNone(result["heart_rate_bpm"])
        self.assertEqual(result["confidence_label"], "none")
        self.assertEqual(result["reason"], "no_finger")

    def test_rejects_finger_removed_mid_capture(self):
        samples = pulse_samples()
        samples[300:] = [(timestamp, 2_000, 2_000) for timestamp, _, _ in samples[300:]]
        result = estimate_heart_rate(samples)
        self.assertIsNone(result["heart_rate_bpm"])
        self.assertEqual(result["reason"], "finger_removed")

    def test_rejects_large_pressure_motion(self):
        samples = pulse_samples()
        moved = [
            (timestamp, red, infrared + (18_000 if 4.0 <= timestamp < 5.0 else 0))
            for timestamp, red, infrared in samples
        ]
        result = estimate_heart_rate(moved)
        self.assertIsNone(result["heart_rate_bpm"])
        self.assertEqual(result["reason"], "motion_detected")


class FakeHardware:
    ready = True
    initialization_error = None

    def __init__(self):
        self.calls = []

    def read_pulse(self):
        self.calls.append("pulse")
        return 94_000, 95_000

    def read_temperature(self):
        self.calls.append("temperature")
        return {"object_c": 36.6, "ambient_c": 27.0, "timestamp": "now"}


class FakeTemperatureOnly(FakeHardware):
    pulse_ready = False
    temperature_ready = True
    pulse_error = "MAX30102 not found on bus 4"
    temperature_error = None


class FakeFlakyTemperature(FakeHardware):
    def read_temperature(self):
        self.calls.append("temperature")
        if len(self.calls) <= 2:
            raise RuntimeError("[Errno 121] Remote I/O error")
        return {"object_c": 36.6, "ambient_c": 27.0, "timestamp": "now"}


@unittest.skipIf(CaptureStore is None, "Flask bridge dependencies are not installed")
class CaptureSequenceTests(unittest.TestCase):
    def test_temperature_is_read_only_after_pulse_capture_finishes(self):
        hardware = FakeHardware()
        store = CaptureStore(hardware)
        store.sessions["test-session"] = {}
        accepted = {
            "heart_rate_bpm": 72,
            "confidence": 0.9,
            "confidence_label": "good",
            "sample_quality": "good",
            "reason": None,
            "diagnostics": {},
        }
        with (
            patch("vitals_bridge.app.FINGER_STABLE_SECONDS", 0),
            patch("vitals_bridge.app.PULSE_CAPTURE_SECONDS", 0.03),
            patch("vitals_bridge.app.TEMPERATURE_POSITION_SECONDS", 0),
            patch("vitals_bridge.app.TEMPERATURE_SAMPLE_COUNT", 3),
            patch("vitals_bridge.app.SAMPLE_INTERVAL_SECONDS", 0.001),
            patch("vitals_bridge.app.estimate_heart_rate", return_value=accepted),
            patch("vitals_bridge.app.time.sleep", return_value=None),
        ):
            store._capture("test-session")

        first_temperature = hardware.calls.index("temperature")
        self.assertTrue(all(call == "pulse" for call in hardware.calls[:first_temperature]))
        self.assertEqual(store.sessions["test-session"]["status"], "complete")
        self.assertEqual(store.sessions["test-session"]["result"]["temperature_surface_c"], 36.6)
        self.assertIsNone(store.sessions["test-session"]["result"]["temperature_c"])

    def test_a_failed_pulse_sensor_keeps_a_valid_temperature_result(self):
        hardware = FakeTemperatureOnly()
        store = CaptureStore(hardware)
        store.sessions["test-session"] = {}
        with (
            patch("vitals_bridge.app.TEMPERATURE_POSITION_SECONDS", 0),
            patch("vitals_bridge.app.TEMPERATURE_SAMPLE_COUNT", 3),
            patch("vitals_bridge.app.time.sleep", return_value=None),
        ):
            store._capture("test-session")

        state = store.sessions["test-session"]
        self.assertEqual(state["status"], "partial")
        self.assertEqual(state["result"]["temperature_surface_c"], 36.6)
        self.assertIsNone(state["result"]["heart_rate_bpm"])
        self.assertIn("MAX30102", state["warnings"][0])

    def test_temperature_only_stage_never_reads_the_pulse_sensor(self):
        hardware = FakeHardware()
        store = CaptureStore(hardware)
        store.sessions["temperature-session"] = {}
        with (
            patch("vitals_bridge.app.TEMPERATURE_POSITION_SECONDS", 0),
            patch("vitals_bridge.app.TEMPERATURE_SAMPLE_COUNT", 3),
            patch("vitals_bridge.app.time.sleep", return_value=None),
        ):
            store._capture("temperature-session", "temperature")

        self.assertTrue(all(call == "temperature" for call in hardware.calls))
        self.assertEqual(store.sessions["temperature-session"]["status"], "complete")

    def test_temperature_keeps_raw_and_corrected_values_separate(self):
        readings = [
            {"object_c": value, "ambient_c": 27.0, "timestamp": "now"}
            for value in (32.7, 32.8, 32.9, 32.8, 32.7, 32.9)
        ]
        with (
            patch("vitals_bridge.app.TEMPERATURE_CALIBRATION_A", 1.0),
            patch("vitals_bridge.app.TEMPERATURE_CALIBRATION_B", 3.7),
        ):
            result, error = temperature_result(readings)

        self.assertIsNone(error)
        self.assertEqual(result["temperature_surface_c"], 32.8)
        self.assertEqual(result["temperature_c"], 36.5)
        self.assertTrue(result["temperature_calibrated"])

    def test_warm_sensor_enclosure_does_not_reject_valid_forehead_surface(self):
        readings = [
            {"object_c": object_c, "ambient_c": ambient_c, "timestamp": "now"}
            for object_c, ambient_c in (
                (32.6, 35.3),
                (32.8, 35.3),
                (32.9, 35.4),
                (33.0, 35.4),
                (32.9, 35.4),
                (32.8, 35.3),
            )
        ]

        result, error = temperature_result(readings)

        self.assertIsNone(error)
        self.assertEqual(result["temperature_surface_c"], 32.8)
        self.assertEqual(result["ambient_temperature_c"], 35.3)
        self.assertEqual(result["temperature_confidence"], "low")
        self.assertIn("sensor enclosure temperature", result["ambient_warning"])

    def test_implausibly_low_surface_still_fails_skin_detection(self):
        readings = [
            {"object_c": value, "ambient_c": 24.0, "timestamp": "now"}
            for value in (24.8, 24.9, 25.0, 24.9, 24.8, 25.0)
        ]

        result, error = temperature_result(readings)

        self.assertIsNone(result)
        self.assertIn("not aimed closely enough", error)

    def test_temperature_capture_logs_each_failure_and_summary(self):
        hardware = FakeFlakyTemperature()
        store = CaptureStore(hardware)
        store.sessions["temperature-session"] = {}
        with (
            patch("vitals_bridge.app.TEMPERATURE_POSITION_SECONDS", 0),
            patch("vitals_bridge.app.TEMPERATURE_SAMPLE_COUNT", 3),
            patch("vitals_bridge.app.time.sleep", return_value=None),
            patch("builtins.print") as print_mock,
        ):
            result, error = store._capture_temperature("temperature-session")

        logs = "\n".join(str(call.args[0]) for call in print_mock.call_args_list)
        self.assertIsNone(result)
        self.assertIn("enough valid readings", error)
        self.assertIn("temperature sample 1/3", logs)
        self.assertIn("Remote I/O error", logs)
        self.assertIn('"reason":"insufficient_samples"', logs)
        self.assertIn('"failed_samples":2', logs)
        state = store.sessions["temperature-session"]
        self.assertEqual(state["temperature_samples"], 1)
        self.assertEqual(state["temperature_samples_failed"], 2)
        self.assertEqual(state["temperature_failure_reason"], "insufficient_samples")


if __name__ == "__main__":
    unittest.main()

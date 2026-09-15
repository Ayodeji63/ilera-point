"""Local sensor bridge for an IleraPoint Raspberry Pi kiosk.

The process owns both I2C devices for its lifetime. It intentionally binds only
to loopback; the public web app reaches it through the Express API proxy.
"""

from __future__ import annotations

import os
import csv
import json
from pathlib import Path
import statistics
import threading
import time
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify
from vitals_bridge.signal import FINGER_IR_THRESHOLD, estimate_heart_rate, mlx_celsius, waveform


PULSE_BUS = 4
TEMPERATURE_BUS = 3
MLX90614_ADDRESS = 0x5A
MLX90614_AMBIENT = 0x06
MLX90614_OBJECT = 0x07
PULSE_CAPTURE_SECONDS = float(os.environ.get("VITALS_PULSE_CAPTURE_SECONDS", "10"))
PULSE_MAX_ATTEMPTS = max(1, int(os.environ.get("VITALS_PULSE_MAX_ATTEMPTS", "2")))
FINGER_WAIT_SECONDS = float(os.environ.get("VITALS_FINGER_WAIT_SECONDS", "6"))
FINGER_STABLE_SECONDS = 0.5
TEMPERATURE_POSITION_SECONDS = float(os.environ.get("VITALS_TEMPERATURE_POSITION_SECONDS", "3"))
TEMPERATURE_SAMPLE_COUNT = max(3, int(os.environ.get("VITALS_TEMPERATURE_SAMPLE_COUNT", "6")))
RAW_LOG_DIR = os.environ.get("VITALS_RAW_LOG_DIR", "").strip()
RAW_LOG_LIMIT = max(1, int(os.environ.get("VITALS_RAW_LOG_LIMIT", "20")))
SAMPLE_INTERVAL_SECONDS = 0.02

PULSE_ERROR_MESSAGES = {
    "no_finger": "No finger was detected. Cover the red light completely and keep your finger relaxed.",
    "finger_removed": "Your finger moved away from the sensor. Keep it covering the red light for the whole check.",
    "weak_signal": "The pulse signal was too weak. Reposition your finger without pressing hard.",
    "motion_detected": "The pulse signal changed too much. Rest your hand and keep your finger still.",
    "insufficient_peaks": "Not enough consistent heart beats were detected. Keep your finger still and try again.",
    "insufficient_samples": "The pulse sensor did not provide enough usable samples.",
    "implausible_rate": "The pulse pattern was outside the supported measurement range.",
    "low_confidence": "The pulse pattern was not clear enough to report safely. Rest your hand and try again.",
}


def optional_env_float(name: str) -> float | None:
    value = os.environ.get(name, "").strip()
    return float(value) if value else None


SPO2_CALIBRATION_A = optional_env_float("VITALS_SPO2_CALIBRATION_A")
SPO2_CALIBRATION_B = optional_env_float("VITALS_SPO2_CALIBRATION_B")
TEMPERATURE_CALIBRATION_A = optional_env_float("VITALS_TEMPERATURE_CALIBRATION_A")
TEMPERATURE_CALIBRATION_B = optional_env_float("VITALS_TEMPERATURE_CALIBRATION_B")
AMBIENT_MIN_C = float(os.environ.get("VITALS_AMBIENT_MIN_C", "18"))
AMBIENT_MAX_C = float(os.environ.get("VITALS_AMBIENT_MAX_C", "32"))


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def pulse_result(outcome: dict) -> dict:
    ratio = outcome.get("diagnostics", {}).get("spo2_ratio")
    spo2 = None
    if ratio is not None and SPO2_CALIBRATION_A is not None and SPO2_CALIBRATION_B is not None:
        candidate = SPO2_CALIBRATION_A - SPO2_CALIBRATION_B * ratio
        if 70 <= candidate <= 100:
            spo2 = round(candidate)
    return {
        "heart_rate_bpm": outcome["heart_rate_bpm"],
        "spo2_percent": spo2,
        "spo2_ratio": ratio,
        "spo2_calibrated": spo2 is not None,
        "confidence": outcome["confidence"],
        "sample_quality": outcome["sample_quality"],
        "captured_at": utc_timestamp(),
    }


def temperature_result(readings: list[dict]) -> tuple[dict | None, str | None]:
    result, error, _, _ = evaluate_temperature(readings)
    return result, error


def evaluate_temperature(readings: list[dict]) -> tuple[dict | None, str | None, str | None, dict]:
    """Evaluate a temperature burst and retain enough detail to diagnose rejection."""
    object_values = [reading["object_c"] for reading in readings]
    ambient_values = [reading["ambient_c"] for reading in readings]
    diagnostics = {
        "valid_samples": len(readings),
        "minimum_required": 3,
        "object_c_min": round(min(object_values), 2) if object_values else None,
        "object_c_median": round(statistics.median(object_values), 2) if object_values else None,
        "object_c_max": round(max(object_values), 2) if object_values else None,
        "object_c_span": round(max(object_values) - min(object_values), 2) if object_values else None,
        "ambient_c_min": round(min(ambient_values), 2) if ambient_values else None,
        "ambient_c_median": round(statistics.median(ambient_values), 2) if ambient_values else None,
        "ambient_c_max": round(max(ambient_values), 2) if ambient_values else None,
        "surface_minus_ambient_c": (
            round(statistics.median(object_values) - statistics.median(ambient_values), 2)
            if object_values and ambient_values
            else None
        ),
    }

    if len(readings) < 3:
        return (
            None,
            "The temperature sensor did not return enough valid readings. Face the sensor directly and try again.",
            "insufficient_samples",
            diagnostics,
        )

    if max(object_values) - min(object_values) > 0.8:
        return (
            None,
            "The surface reading changed too much. Hold your forehead still, 2-3 cm from the sensor, and retry.",
            "unstable_surface",
            diagnostics,
        )

    surface = round(statistics.median(object_values), 1)
    ambient = round(statistics.median(ambient_values), 1)
    # The ambient channel is the MLX90614 sensor/package temperature, not a
    # reliable skin-presence reference. It can read above forehead surface in
    # a warm enclosure. Validate skin from the surface burst itself and use
    # ambient only to lower confidence below.
    if not 27 <= surface <= 40:
        return (
            None,
            "The sensor was not aimed closely enough at skin. Face it directly, 2-3 cm from your forehead, and retry.",
            "skin_not_detected",
            diagnostics,
        )

    corrected = None
    if TEMPERATURE_CALIBRATION_A is not None and TEMPERATURE_CALIBRATION_B is not None:
        candidate = TEMPERATURE_CALIBRATION_A * surface + TEMPERATURE_CALIBRATION_B
        if 32 <= candidate <= 43:
            corrected = round(candidate, 1)

    ambient_ok = AMBIENT_MIN_C <= ambient <= AMBIENT_MAX_C
    ambient_warning = None
    if not ambient_ok:
        ambient_warning = (
            f"The sensor enclosure temperature was {ambient:.1f}°C, outside the "
            f"supported {AMBIENT_MIN_C:.0f}-{AMBIENT_MAX_C:.0f}°C range. "
            "The surface reading was saved with low confidence; improve ventilation and verify it clinically."
        )
    return (
        {
            "temperature_surface_c": surface,
            "ambient_temperature_c": ambient,
            "temperature_c": corrected,
            "temperature_calibrated": corrected is not None,
            "temperature_confidence": "good" if ambient_ok else "low",
            "ambient_warning": ambient_warning,
            "captured_at": utc_timestamp(),
        },
        None,
        None,
        diagnostics,
    )


def log_raw_capture(session_id: str, attempt: int, samples: list[tuple[float, int, int]], outcome: dict) -> None:
    """Keep a bounded, opt-in calibration buffer with no patient identity."""
    if not RAW_LOG_DIR:
        return
    try:
        directory = Path(RAW_LOG_DIR)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{session_id}-attempt-{attempt}.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["outcome", json.dumps(outcome, separators=(",", ":"))])
            writer.writerow(["elapsed_seconds", "red", "ir"])
            first_timestamp = samples[0][0] if samples else 0
            for timestamp, red, infrared in samples:
                writer.writerow([f"{timestamp - first_timestamp:.6f}", red, infrared])
        stored = sorted(directory.glob("*.csv"), key=lambda item: item.stat().st_mtime, reverse=True)
        for stale in stored[RAW_LOG_LIMIT:]:
            stale.unlink(missing_ok=True)
    except OSError as error:
        print(f"[vitals] raw capture log failed: {error}", flush=True)


class SensorHardware:
    def __init__(self) -> None:
        self.temperature_bus = None
        self.pulse_sensor = None
        self.temperature_error = None
        self.pulse_error = None
        self.temperature_lock = threading.Lock()
        self.pulse_lock = threading.Lock()
        try:
            import smbus2

            self.temperature_bus = smbus2.SMBus(TEMPERATURE_BUS)
            self.temperature_bus.pec = 1
        except Exception as error:
            self.temperature_error = str(error)

        try:
            import smbus2
            import qwiic_i2c.linux_i2c as linux_i2c
            import qwiic_max3010x

            driver = linux_i2c.LinuxI2C()
            driver._i2cbus = smbus2.SMBus(PULSE_BUS)
            driver._iBus = PULSE_BUS
            self.pulse_sensor = qwiic_max3010x.QwiicMax3010x(i2c_driver=driver)
            if not self.pulse_sensor.begin():
                raise RuntimeError("MAX30102 not found on bus 4")
            self.pulse_sensor.setup()
        except Exception as error:  # Service stays alive and reports a recoverable hardware error.
            self.pulse_error = str(error)

    @property
    def temperature_ready(self) -> bool:
        return self.temperature_bus is not None and not self.temperature_error

    @property
    def pulse_ready(self) -> bool:
        return self.pulse_sensor is not None and not self.pulse_error

    @property
    def ready(self) -> bool:
        return self.temperature_ready or self.pulse_ready

    @property
    def initialization_error(self) -> str | None:
        errors = [message for message in (self.pulse_error, self.temperature_error) if message]
        return "; ".join(errors) or None

    def read_temperature(self) -> dict:
        if not self.temperature_ready:
            raise RuntimeError(self.temperature_error or "The temperature sensor is unavailable.")
        last_error = None
        for attempt in range(1, 5):
            try:
                with self.temperature_lock:
                    ambient_raw = self.temperature_bus.read_word_data(MLX90614_ADDRESS, MLX90614_AMBIENT)
                    object_raw = self.temperature_bus.read_word_data(MLX90614_ADDRESS, MLX90614_OBJECT)
                ambient = mlx_celsius(ambient_raw)
                object_temperature = mlx_celsius(object_raw)
                if not -10 <= ambient <= 60 or not 20 <= object_temperature <= 45:
                    raise ValueError("Temperature reading was outside the sensor quality range.")
                if attempt > 1:
                    print(
                        f"[vitals] temperature I2C read recovered: "
                        f"{json.dumps({'attempt': attempt}, separators=(',', ':'))}",
                        flush=True,
                    )
                return {
                    "object_c": round(object_temperature, 1),
                    "ambient_c": round(ambient, 1),
                    "timestamp": utc_timestamp(),
                }
            except (OSError, ValueError) as error:
                last_error = error
                print(
                    f"[vitals] temperature I2C read retry {attempt}/4: "
                    f"{json.dumps({'error_type': type(error).__name__, 'message': str(error)}, separators=(',', ':'))}",
                    flush=True,
                )
                time.sleep(0.08)
        raise RuntimeError(str(last_error or "Temperature sensor did not return a valid reading."))

    def read_pulse(self) -> tuple[int, int]:
        if not self.pulse_ready:
            raise RuntimeError(self.pulse_error or "The pulse sensor is unavailable.")
        with self.pulse_lock:
            return int(self.pulse_sensor.getRed()), int(self.pulse_sensor.getIR())


class CaptureStore:
    def __init__(self, hardware: SensorHardware) -> None:
        self.hardware = hardware
        self.sessions: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.capture_lock = threading.Lock()

    def start(self, stage: str = "all") -> dict:
        if stage not in {"all", "pulse", "temperature"}:
            raise ValueError("Unknown vitals capture stage.")
        session_id = str(uuid.uuid4())
        state = {
            "session_id": session_id,
            "status": "capturing",
            "stage": "pulse" if stage == "all" else stage,
            "phase": "waiting_for_finger" if stage in {"all", "pulse"} else "position_forehead",
            "progress": 0,
            "stage_progress": 0,
            "pulse_attempt": 1,
            "pulse_attempts": PULSE_MAX_ATTEMPTS,
            "finger_present": False,
            "signal_level": 0,
            "waveform": [],
            "started_at": utc_timestamp(),
        }
        with self.lock:
            self.sessions[session_id] = state
        threading.Thread(target=self._capture, args=(session_id, stage), daemon=True).start()
        return state.copy()

    def get(self, session_id: str) -> dict | None:
        with self.lock:
            state = self.sessions.get(session_id)
            return state.copy() if state else None

    def update(self, session_id: str, **values) -> None:
        with self.lock:
            if session_id in self.sessions:
                self.sessions[session_id].update(values)

    def _capture(self, session_id: str, stage: str = "all") -> None:
        if not self.hardware.ready:
            self.update(session_id, status="error", error=self.hardware.initialization_error or "Vitals sensors are unavailable.")
            return
        if not self.capture_lock.acquire(blocking=False):
            self.update(session_id, status="error", error="Another vitals capture is already running. Please wait and retry.")
            return
        try:
            pulse_ready = getattr(self.hardware, "pulse_ready", self.hardware.ready)
            temperature_ready = getattr(self.hardware, "temperature_ready", self.hardware.ready)

            if stage == "pulse":
                if not pulse_ready:
                    self.update(session_id, status="error", error=getattr(self.hardware, "pulse_error", None) or "The pulse sensor is unavailable.")
                    return
                pulse, error = self._capture_pulse(session_id)
                if not pulse:
                    self.update(session_id, status="error", progress=1, error=error)
                    return
                self.update(session_id, status="complete", stage="complete", phase="complete", progress=1, stage_progress=1, result=pulse_result(pulse))
                return

            if stage == "temperature":
                if not temperature_ready:
                    self.update(session_id, status="error", error=getattr(self.hardware, "temperature_error", None) or "The temperature sensor is unavailable.")
                    return
                temperature, error = self._capture_temperature(session_id)
                if not temperature:
                    self.update(session_id, status="error", progress=1, error=error)
                    return
                self.update(session_id, status="complete", stage="complete", phase="complete", progress=1, stage_progress=1, result=temperature)
                return

            pulse, pulse_error = (
                self._capture_pulse(session_id)
                if pulse_ready
                else (None, getattr(self.hardware, "pulse_error", None) or "The pulse sensor is unavailable.")
            )
            temperature, temperature_error = (
                self._capture_temperature(session_id)
                if temperature_ready
                else (None, getattr(self.hardware, "temperature_error", None) or "The temperature sensor is unavailable.")
            )
            warnings = [message for message in (pulse_error, temperature_error) if message]
            if not pulse and not temperature:
                self.update(session_id, status="error", progress=1, warnings=warnings, error=" ".join(warnings))
                return

            result = {
                "heart_rate_bpm": None,
                "spo2_percent": None,
                "temperature_c": None,
                "temperature_surface_c": None,
                **(pulse_result(pulse) if pulse else {}),
                **(temperature if temperature else {}),
                "captured_at": utc_timestamp(),
            }
            self.update(
                session_id,
                status="complete" if not warnings else "partial",
                stage="complete",
                phase="complete",
                progress=1,
                stage_progress=1,
                warnings=warnings,
                result=result,
            )
        except (OSError, RuntimeError, ValueError) as error:
            self.update(session_id, status="error", error=str(error))
        finally:
            self.capture_lock.release()

    def _wait_for_finger(self, session_id: str, attempt: int) -> bool:
        started = time.monotonic()
        stable_since = None
        recent_ir: list[int] = []
        while time.monotonic() - started < FINGER_WAIT_SECONDS:
            now = time.monotonic()
            red, infrared = self.hardware.read_pulse()
            recent_ir.append(infrared)
            present = infrared >= FINGER_IR_THRESHOLD
            if present:
                stable_since = stable_since or now
                if now - stable_since >= FINGER_STABLE_SECONDS:
                    return True
            else:
                stable_since = None
            self.update(
                session_id,
                stage="pulse",
                phase="waiting_for_finger",
                pulse_attempt=attempt,
                finger_present=present,
                signal_level=infrared,
                waveform=waveform(recent_ir),
                stage_progress=0,
            )
            time.sleep(max(0, SAMPLE_INTERVAL_SECONDS - (time.monotonic() - now)))
        return False

    def _capture_pulse(self, session_id: str) -> tuple[dict | None, str | None]:
        last_reason = "no_finger"
        for attempt in range(1, PULSE_MAX_ATTEMPTS + 1):
            self.update(
                session_id,
                stage="pulse",
                phase="waiting_for_finger",
                pulse_attempt=attempt,
                pulse_attempts=PULSE_MAX_ATTEMPTS,
                stage_progress=0,
                waveform=[],
            )
            if not self._wait_for_finger(session_id, attempt):
                last_reason = "no_finger"
                if attempt < PULSE_MAX_ATTEMPTS:
                    self.update(session_id, phase="retrying", retry_reason=last_reason)
                    time.sleep(1)
                    continue
                break

            samples: list[tuple[float, int, int]] = []
            recent_ir: list[int] = []
            started = time.monotonic()
            while time.monotonic() - started < PULSE_CAPTURE_SECONDS:
                now = time.monotonic()
                red, infrared = self.hardware.read_pulse()
                samples.append((now, red, infrared))
                recent_ir.append(infrared)
                elapsed = now - started
                stage_progress = min(0.99, elapsed / PULSE_CAPTURE_SECONDS)
                self.update(
                    session_id,
                    stage="pulse",
                    phase="measuring",
                    pulse_attempt=attempt,
                    finger_present=infrared >= FINGER_IR_THRESHOLD,
                    signal_level=infrared,
                    waveform=waveform(recent_ir),
                    stage_progress=stage_progress,
                    progress=(attempt - 1 + stage_progress) / PULSE_MAX_ATTEMPTS,
                )
                time.sleep(max(0, SAMPLE_INTERVAL_SECONDS - (time.monotonic() - now)))

            outcome = estimate_heart_rate(samples)
            print(f"[vitals] pulse attempt {attempt}: {json.dumps(outcome, separators=(',', ':'))}", flush=True)
            log_raw_capture(session_id, attempt, samples, outcome)
            if outcome["reason"] is None:
                self.update(session_id, pulse_result={key: value for key, value in outcome.items() if key != "diagnostics"})
                return outcome, None

            last_reason = outcome["reason"]
            if attempt < PULSE_MAX_ATTEMPTS:
                self.update(session_id, phase="retrying", retry_reason=last_reason, stage_progress=0)
                time.sleep(1.25)

        return None, PULSE_ERROR_MESSAGES.get(last_reason, "A trustworthy pulse reading could not be captured.")

    def _capture_temperature(self, session_id: str) -> tuple[dict | None, str | None]:
        self.update(
            session_id,
            stage="temperature",
            phase="position_forehead",
            finger_present=False,
            waveform=[],
            stage_progress=0,
            progress=0,
        )
        positioned_at = time.monotonic()
        while time.monotonic() - positioned_at < TEMPERATURE_POSITION_SECONDS:
            elapsed = time.monotonic() - positioned_at
            stage_progress = min(0.35, 0.35 * elapsed / TEMPERATURE_POSITION_SECONDS)
            self.update(session_id, stage_progress=stage_progress, progress=stage_progress)
            time.sleep(0.1)

        readings: list[dict] = []
        failures: list[dict] = []
        for index in range(TEMPERATURE_SAMPLE_COUNT):
            try:
                reading = self.hardware.read_temperature()
                readings.append(reading)
                sample_outcome = {
                    "session_id": session_id,
                    "sample": index + 1,
                    "requested_samples": TEMPERATURE_SAMPLE_COUNT,
                    "ok": True,
                    **reading,
                }
            except RuntimeError as error:
                sample_outcome = {
                    "session_id": session_id,
                    "sample": index + 1,
                    "requested_samples": TEMPERATURE_SAMPLE_COUNT,
                    "ok": False,
                    "error_type": type(error).__name__,
                    "message": str(error),
                }
                failures.append(sample_outcome)
            print(
                f"[vitals] temperature sample {index + 1}/{TEMPERATURE_SAMPLE_COUNT}: "
                f"{json.dumps(sample_outcome, separators=(',', ':'))}",
                flush=True,
            )
            stage_progress = 0.35 + 0.65 * ((index + 1) / TEMPERATURE_SAMPLE_COUNT)
            self.update(
                session_id,
                phase="measuring",
                stage_progress=stage_progress,
                progress=stage_progress,
                temperature_samples=len(readings),
            )
            time.sleep(0.4)

        result, error, reason, diagnostics = evaluate_temperature(readings)
        outcome = {
            "session_id": session_id,
            "success": result is not None,
            "reason": reason,
            "requested_samples": TEMPERATURE_SAMPLE_COUNT,
            "valid_samples": len(readings),
            "failed_samples": len(failures),
            "diagnostics": diagnostics,
        }
        if failures:
            outcome["failures"] = failures
        print(f"[vitals] temperature outcome: {json.dumps(outcome, separators=(',', ':'))}", flush=True)
        self.update(
            session_id,
            temperature_samples_requested=TEMPERATURE_SAMPLE_COUNT,
            temperature_samples=len(readings),
            temperature_samples_failed=len(failures),
            temperature_failure_reason=reason,
        )
        return result, error


app = Flask(__name__)
hardware = SensorHardware()
captures = CaptureStore(hardware)


@app.get("/health")
def health():
    return jsonify({
        "ok": hardware.ready,
        "error": hardware.initialization_error,
        "sensors": {
            "pulse": {"ok": hardware.pulse_ready, "error": hardware.pulse_error},
            "temperature": {"ok": hardware.temperature_ready, "error": hardware.temperature_error},
        },
    })


@app.get("/vitals/temperature")
def temperature():
    try:
        return jsonify(hardware.read_temperature())
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503


@app.post("/vitals/session")
def start_session():
    if not hardware.ready:
        return jsonify({"error": hardware.initialization_error or "Vitals sensors are unavailable."}), 503
    return jsonify(captures.start()), 202


@app.post("/vitals/pulse/session")
def start_pulse_session():
    if not hardware.pulse_ready:
        return jsonify({"error": hardware.pulse_error or "The pulse sensor is unavailable."}), 503
    return jsonify(captures.start("pulse")), 202


@app.post("/vitals/temperature/session")
def start_temperature_session():
    if not hardware.temperature_ready:
        return jsonify({"error": hardware.temperature_error or "The temperature sensor is unavailable."}), 503
    return jsonify(captures.start("temperature")), 202


@app.get("/vitals/session/<session_id>")
def session_status(session_id: str):
    state = captures.get(session_id)
    if not state:
        return jsonify({"error": "Vitals capture session was not found."}), 404
    return jsonify(state)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("VITALS_BRIDGE_PORT", "8765")), threaded=True)

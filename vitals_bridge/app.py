"""Local sensor bridge for an IleraPoint Raspberry Pi kiosk.

The process owns both I2C devices for its lifetime. It intentionally binds only
to loopback; the public web app reaches it through the Express API proxy.
"""

from __future__ import annotations

import os
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
CAPTURE_SECONDS = float(os.environ.get("VITALS_CAPTURE_SECONDS", "10"))
SAMPLE_INTERVAL_SECONDS = 0.02


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SensorHardware:
    def __init__(self) -> None:
        self.temperature_bus = None
        self.pulse_sensor = None
        self.initialization_error = None
        self.temperature_lock = threading.Lock()
        self.pulse_lock = threading.Lock()
        try:
            import smbus2
            import qwiic_i2c.linux_i2c as linux_i2c
            import qwiic_max3010x

            self.temperature_bus = smbus2.SMBus(TEMPERATURE_BUS)
            self.temperature_bus.pec = 1

            driver = linux_i2c.LinuxI2C()
            driver._i2cbus = smbus2.SMBus(PULSE_BUS)
            driver._iBus = PULSE_BUS
            self.pulse_sensor = qwiic_max3010x.QwiicMax3010x(i2c_driver=driver)
            if not self.pulse_sensor.begin():
                raise RuntimeError("MAX30102 not found on bus 4")
            self.pulse_sensor.setup()
        except Exception as error:  # Service stays alive and reports a recoverable hardware error.
            self.initialization_error = str(error)

    @property
    def ready(self) -> bool:
        return self.temperature_bus is not None and self.pulse_sensor is not None and not self.initialization_error

    def read_temperature(self) -> dict:
        if not self.ready:
            raise RuntimeError(self.initialization_error or "Vitals sensors are unavailable.")
        last_error = None
        for _ in range(4):
            try:
                with self.temperature_lock:
                    ambient_raw = self.temperature_bus.read_word_data(MLX90614_ADDRESS, MLX90614_AMBIENT)
                    object_raw = self.temperature_bus.read_word_data(MLX90614_ADDRESS, MLX90614_OBJECT)
                ambient = mlx_celsius(ambient_raw)
                object_temperature = mlx_celsius(object_raw)
                if not -10 <= ambient <= 60 or not 20 <= object_temperature <= 45:
                    raise ValueError("Temperature reading was outside the sensor quality range.")
                return {
                    "object_c": round(object_temperature, 1),
                    "ambient_c": round(ambient, 1),
                    "timestamp": utc_timestamp(),
                }
            except (OSError, ValueError) as error:
                last_error = error
                time.sleep(0.08)
        raise RuntimeError(str(last_error or "Temperature sensor did not return a valid reading."))

    def read_pulse(self) -> tuple[int, int]:
        if not self.ready:
            raise RuntimeError(self.initialization_error or "Vitals sensors are unavailable.")
        with self.pulse_lock:
            return int(self.pulse_sensor.getRed()), int(self.pulse_sensor.getIR())


class CaptureStore:
    def __init__(self, hardware: SensorHardware) -> None:
        self.hardware = hardware
        self.sessions: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.capture_lock = threading.Lock()

    def start(self) -> dict:
        session_id = str(uuid.uuid4())
        state = {
            "session_id": session_id,
            "status": "capturing",
            "progress": 0,
            "finger_present": False,
            "signal_level": 0,
            "waveform": [],
            "started_at": utc_timestamp(),
        }
        with self.lock:
            self.sessions[session_id] = state
        threading.Thread(target=self._capture, args=(session_id,), daemon=True).start()
        return state.copy()

    def get(self, session_id: str) -> dict | None:
        with self.lock:
            state = self.sessions.get(session_id)
            return state.copy() if state else None

    def update(self, session_id: str, **values) -> None:
        with self.lock:
            if session_id in self.sessions:
                self.sessions[session_id].update(values)

    def _capture(self, session_id: str) -> None:
        if not self.hardware.ready:
            self.update(session_id, status="error", error=self.hardware.initialization_error or "Vitals sensors are unavailable.")
            return
        if not self.capture_lock.acquire(blocking=False):
            self.update(session_id, status="error", error="Another vitals capture is already running. Please wait and retry.")
            return
        try:
            started = time.monotonic()
            samples: list[tuple[float, int]] = []
            recent_ir: list[int] = []
            temperatures: list[dict] = []
            temperature_stop = threading.Event()

            def sample_temperature() -> None:
                while not temperature_stop.is_set():
                    try:
                        temperatures.append(self.hardware.read_temperature())
                    except RuntimeError:
                        pass
                    temperature_stop.wait(0.5)

            temperature_thread = threading.Thread(target=sample_temperature, daemon=True)
            temperature_thread.start()
            while time.monotonic() - started < CAPTURE_SECONDS:
                now = time.monotonic()
                _, infrared = self.hardware.read_pulse()
                samples.append((now, infrared))
                recent_ir.append(infrared)
                elapsed = now - started
                self.update(
                    session_id,
                    progress=min(0.99, elapsed / CAPTURE_SECONDS),
                    finger_present=infrared >= FINGER_IR_THRESHOLD,
                    signal_level=infrared,
                    waveform=waveform(recent_ir),
                )
                time.sleep(max(0, SAMPLE_INTERVAL_SECONDS - (time.monotonic() - now)))

            temperature_stop.set()
            temperature_thread.join(timeout=1)
            pulse = estimate_heart_rate(samples)
            if not temperatures:
                raise ValueError("No valid temperature was captured. Hold your forehead 2–5 cm from the sensor and retry.")
            recent_temperatures = [reading["object_c"] for reading in temperatures[-6:]]
            if max(recent_temperatures) - min(recent_temperatures) > 1.2:
                raise ValueError("The temperature changed too much. Hold close to the sensor and keep still.")
            result = {
                "temperature_c": round(statistics.median(recent_temperatures), 1),
                **pulse,
                "captured_at": utc_timestamp(),
            }
            self.update(session_id, status="complete", progress=1, result=result)
        except (OSError, RuntimeError, ValueError) as error:
            self.update(session_id, status="error", error=str(error))
        finally:
            if "temperature_stop" in locals():
                temperature_stop.set()
            if "temperature_thread" in locals():
                temperature_thread.join(timeout=1)
            self.capture_lock.release()


app = Flask(__name__)
hardware = SensorHardware()
captures = CaptureStore(hardware)


@app.get("/health")
def health():
    return jsonify({"ok": hardware.ready, "error": hardware.initialization_error})


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


@app.get("/vitals/session/<session_id>")
def session_status(session_id: str):
    state = captures.get(session_id)
    if not state:
        return jsonify({"error": "Vitals capture session was not found."}), 404
    return jsonify(state)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("VITALS_BRIDGE_PORT", "8765")), threaded=True)

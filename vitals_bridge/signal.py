"""Pure sensor conversion and calibrated pulse-waveform processing."""

from __future__ import annotations

import math
import statistics


# This hardware sits around 90k-105k with a settled finger and in the low
# thousands without one. Keep presence separate from the stricter analysis
# plateau so borderline contact is never promoted into a clinical-looking BPM.
FINGER_IR_THRESHOLD = 40_000
ANALYSIS_IR_THRESHOLD = 50_000
STARTUP_TRIM_SECONDS = 1.5
MIN_CAPTURE_SECONDS = 6.0
MIN_INTERVALS = 4


def mlx_celsius(raw_word: int) -> float:
    return raw_word * 0.02 - 273.15


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def moving_average(values: list[float], width: int) -> list[float]:
    """Centered moving average without NumPy/SciPy on the kiosk Pi."""
    if not values:
        return []
    width = max(1, width)
    half = width // 2
    prefix = [0.0]
    for value in values:
        prefix.append(prefix[-1] + value)
    result: list[float] = []
    for index in range(len(values)):
        left = max(0, index - half)
        right = min(len(values), index + half + 1)
        result.append((prefix[right] - prefix[left]) / (right - left))
    return result


def _failure(reason: str, diagnostics: dict) -> dict:
    return {
        "heart_rate_bpm": None,
        "confidence": 0.0,
        "confidence_label": "none",
        "sample_quality": "none",
        "reason": reason,
        "diagnostics": diagnostics,
    }


def estimate_heart_rate(samples: list[tuple[float, int] | tuple[float, int, int]]) -> dict:
    """Return a defensible BPM result or an explicit no-signal reason.

    Samples are ``(timestamp, red, ir)``. The older ``(timestamp, ir)`` form is
    accepted for stored development fixtures, but production always records
    both channels. SpO2 is intentionally not calculated here.
    """
    if len(samples) < 150:
        return _failure("insufficient_samples", {"sample_count": len(samples)})

    parsed = [
        (float(sample[0]), float(sample[1]), float(sample[2] if len(sample) > 2 else sample[1]))
        for sample in samples
    ]
    parsed.sort(key=lambda sample: sample[0])
    capture_seconds = parsed[-1][0] - parsed[0][0]
    diagnostics = {"sample_count": len(parsed), "capture_seconds": round(capture_seconds, 2)}
    if capture_seconds < MIN_CAPTURE_SECONDS:
        return _failure("insufficient_samples", diagnostics)

    # Contact produces a large one-off rise. Remove it by elapsed time rather
    # than sample count because software I2C polling is jittery.
    analysis_start = parsed[0][0] + STARTUP_TRIM_SECONDS
    settled = [sample for sample in parsed if sample[0] >= analysis_start]
    if len(settled) < 120:
        return _failure("insufficient_samples", diagnostics)

    timestamps = [sample[0] for sample in settled]
    red = [sample[1] for sample in settled]
    infrared = [sample[2] for sample in settled]
    dc_level = statistics.median(infrared)
    contact_ratio = sum(value >= FINGER_IR_THRESHOLD for value in infrared) / len(infrared)
    diagnostics.update({"ir_median": round(dc_level), "contact_ratio": round(contact_ratio, 3)})
    if dc_level < ANALYSIS_IR_THRESHOLD or contact_ratio < 0.90:
        reason = "finger_removed" if contact_ratio >= 0.25 else "no_finger"
        return _failure(reason, diagnostics)

    sample_intervals = [right - left for left, right in zip(timestamps, timestamps[1:]) if 0 < right - left < 0.2]
    if len(sample_intervals) < 100:
        return _failure("insufficient_samples", diagnostics)
    sample_rate = 1 / statistics.median(sample_intervals)
    diagnostics["sample_rate_hz"] = round(sample_rate, 1)

    baseline = moving_average(infrared, max(5, round(sample_rate * 0.75)))
    ac = [value - mean for value, mean in zip(infrared, baseline)]
    red_baseline = moving_average(red, max(5, round(sample_rate * 0.75)))
    red_ac = [value - mean for value, mean in zip(red, red_baseline)]
    robust_span = _percentile(ac, 0.95) - _percentile(ac, 0.05)
    red_robust_span = _percentile(red_ac, 0.95) - _percentile(red_ac, 0.05)
    ripple_ratio = robust_span / max(dc_level, 1)
    baseline_span_ratio = (_percentile(baseline, 0.95) - _percentile(baseline, 0.05)) / max(dc_level, 1)
    ac_rms = math.sqrt(sum(value * value for value in ac) / len(ac))
    diagnostics.update({
        "ac_span": round(robust_span, 1),
        "red_ac_span": round(red_robust_span, 1),
        "ripple_ratio": round(ripple_ratio, 5),
        "baseline_drift_ratio": round(baseline_span_ratio, 5),
    })
    red_dc_level = statistics.median(red)
    if robust_span > 0 and red_dc_level > 0:
        diagnostics["spo2_ratio"] = round(
            (red_robust_span / red_dc_level) / (robust_span / dc_level),
            5,
        )
    if robust_span < 80 or ripple_ratio < 0.0015 or ac_rms < 20:
        return _failure("weak_signal", diagnostics)
    if ripple_ratio > 0.10 or baseline_span_ratio > 0.12:
        return _failure("motion_detected", diagnostics)

    minimum_spacing = 60 / 220
    local_radius = max(2, round(sample_rate * 0.10))
    prominence_radius = max(local_radius + 1, round(sample_rate * 0.18))
    height_threshold = statistics.median(ac) + max(ac_rms * 0.30, robust_span * 0.08)
    prominence_threshold = max(25.0, robust_span * 0.10)
    candidates: list[int] = []
    for index in range(prominence_radius, len(ac) - prominence_radius):
        value = ac[index]
        if value <= height_threshold or value < max(ac[index - local_radius:index]):
            continue
        if value <= max(ac[index + 1:index + local_radius + 1]):
            continue
        left_floor = min(ac[index - prominence_radius:index])
        right_floor = min(ac[index + 1:index + prominence_radius + 1])
        if value - max(left_floor, right_floor) < prominence_threshold:
            continue
        candidates.append(index)

    peaks: list[int] = []
    for index in candidates:
        if not peaks or timestamps[index] - timestamps[peaks[-1]] >= minimum_spacing:
            peaks.append(index)
        elif ac[index] > ac[peaks[-1]]:
            peaks[-1] = index

    beat_intervals = [timestamps[right] - timestamps[left] for left, right in zip(peaks, peaks[1:])]
    beat_intervals = [interval for interval in beat_intervals if 60 / 220 <= interval <= 60 / 35]
    diagnostics["accepted_peaks"] = len(beat_intervals) + (1 if beat_intervals else 0)
    if len(beat_intervals) < MIN_INTERVALS:
        return _failure("insufficient_peaks", diagnostics)

    median_interval = statistics.median(beat_intervals)
    consistent_intervals = [interval for interval in beat_intervals if abs(interval - median_interval) / median_interval <= 0.25]
    if len(consistent_intervals) < MIN_INTERVALS:
        return _failure("motion_detected", diagnostics)

    variability = statistics.pstdev(consistent_intervals) / statistics.mean(consistent_intervals)
    bpm = 60 / statistics.median(consistent_intervals)
    diagnostics.update({"interval_cv": round(variability, 4), "consistent_intervals": len(consistent_intervals)})
    if not 35 <= bpm <= 220:
        return _failure("implausible_rate", diagnostics)
    if variability > 0.22:
        return _failure("motion_detected", diagnostics)

    peak_score = min(1.0, len(consistent_intervals) / 8)
    rhythm_score = max(0.0, 1 - variability / 0.22)
    signal_score = min(1.0, ripple_ratio / 0.006)
    confidence = round(0.35 * peak_score + 0.45 * rhythm_score + 0.20 * signal_score, 2)
    diagnostics["confidence"] = confidence
    if confidence < 0.60:
        return _failure("low_confidence", diagnostics)
    quality = "good" if confidence >= 0.75 and variability <= 0.12 else "fair"
    return {
        "heart_rate_bpm": round(bpm),
        "confidence": confidence,
        "confidence_label": quality,
        "sample_quality": quality,
        "reason": None,
        "diagnostics": diagnostics,
    }


def waveform(values: list[int], limit: int = 80) -> list[float]:
    values = values[-limit:]
    if not values:
        return []
    center = statistics.mean(values)
    deviations = [value - center for value in values]
    extent = max(_percentile([abs(value) for value in deviations], 0.92), 1)
    return [round(max(0.04, min(0.96, 0.5 + 0.42 * value / extent)), 3) for value in deviations]

"""Pure sensor conversion and pulse-waveform processing."""

import math
import statistics


FINGER_IR_THRESHOLD = 20_000


def mlx_celsius(raw_word: int) -> float:
    return raw_word * 0.02 - 273.15


def moving_average(values: list[float], width: int) -> list[float]:
    if not values:
        return []
    width = max(1, width)
    total = 0.0
    result: list[float] = []
    for index, value in enumerate(values):
        total += value
        if index >= width:
            total -= values[index - width]
        result.append(total / min(index + 1, width))
    return result


def estimate_heart_rate(samples: list[tuple[float, int]]) -> dict:
    if len(samples) < 150:
        raise ValueError("Not enough pulse samples were captured.")
    timestamps = [sample[0] for sample in samples]
    infrared = [float(sample[1]) for sample in samples]
    dc_level = statistics.median(infrared)
    if dc_level < FINGER_IR_THRESHOLD:
        raise ValueError("No finger was detected on the pulse sensor.")

    sample_intervals = [right - left for left, right in zip(timestamps, timestamps[1:]) if right > left]
    sample_rate = 1 / statistics.median(sample_intervals)
    baseline = moving_average(infrared, max(5, round(sample_rate * 0.75)))
    ac = [value - mean for value, mean in zip(infrared, baseline)]
    warmup = min(len(ac) // 4, round(sample_rate))
    ac[:warmup] = [0.0] * warmup
    ac_rms = math.sqrt(sum(value * value for value in ac[warmup:]) / max(1, len(ac) - warmup))
    if ac_rms < 15:
        raise ValueError("A stable pulse waveform was not detected. Keep your finger still and try again.")

    threshold = ac_rms * 0.45
    peaks: list[int] = []
    for index in range(max(1, warmup), len(ac) - 1):
        if ac[index] <= threshold or ac[index] < ac[index - 1] or ac[index] <= ac[index + 1]:
            continue
        if not peaks or timestamps[index] - timestamps[peaks[-1]] >= 0.30:
            peaks.append(index)
        elif ac[index] > ac[peaks[-1]]:
            peaks[-1] = index

    intervals = [timestamps[right] - timestamps[left] for left, right in zip(peaks, peaks[1:])]
    intervals = [interval for interval in intervals if 0.30 <= interval <= 1.50]
    if len(intervals) < 2:
        raise ValueError("A stable pulse waveform was not detected. Keep your finger still and try again.")

    bpm = 60 / statistics.median(intervals)
    if not 40 <= bpm <= 200:
        raise ValueError("The pulse reading was outside the supported measurement range.")
    variability = statistics.pstdev(intervals) / statistics.mean(intervals) if len(intervals) > 1 else 1.0
    if variability > 0.28:
        raise ValueError("The pulse signal changed too much. Keep your finger still and try again.")

    peak_score = min(1.0, len(intervals) / 7)
    rhythm_score = max(0.0, 1 - variability / 0.28)
    confidence = round(0.45 * peak_score + 0.55 * rhythm_score, 2)
    return {
        "heart_rate_bpm": round(bpm),
        "confidence": confidence,
        "sample_quality": "good" if confidence >= 0.72 else "fair",
    }


def waveform(values: list[int], limit: int = 48) -> list[float]:
    values = values[-limit:]
    if not values:
        return []
    center = statistics.mean(values)
    deviations = [value - center for value in values]
    extent = max(max(abs(value) for value in deviations), 1)
    return [round(0.5 + 0.44 * value / extent, 3) for value in deviations]

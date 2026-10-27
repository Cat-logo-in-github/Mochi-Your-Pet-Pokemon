"""Create Mochi's original demo loops. No recordings or third-party compositions.

Pure sine partials with soft exponential envelopes, an original note sequence,
quiet tonic chords, and deterministic stereo-free 16 kHz PCM output.
Run from the repository root: python scripts/generate-demo-audio.py
"""
from pathlib import Path
import math
import struct
import wave

RATE = 16000
DURATION = 12
OUT = Path(__file__).resolve().parents[1] / 'apps' / 'extension' / 'public' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)

def frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)

def create(name, notes, chord):
    samples = []
    for i in range(RATE * DURATION):
        t = i / RATE
        beat = int(t / 0.75)
        elapsed = t % 0.75
        note = frequency(notes[beat % len(notes)])
        envelope = min(1, elapsed / 0.035) * math.exp(-elapsed * 5)
        tone = (math.sin(2 * math.pi * note * t) + 0.22 * math.sin(4 * math.pi * note * t)) * 0.11 * envelope
        for pitch in chord:
            tone += math.sin(2 * math.pi * frequency(pitch) * t) * 0.009
        fade = min(1, t / 0.3, (DURATION - t) / 0.5)
        samples.append(struct.pack('<h', int(max(-1, min(1, tone * fade)) * 32767)))
    with wave.open(str(OUT / name), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(b''.join(samples))

create('cloud-garden.wav', [72, 76, 79, 83, 79, 76, 74, 79, 76, 72, 74, 76, 79, 76, 74, 72], [48, 55, 64])
create('little-afternoon.wav', [69, 72, 76, 79, 76, 72, 67, 71, 74, 77, 74, 71, 69, 72, 76, 72], [45, 52, 60])
print('Created two original 12-second PCM demo loops (384044 bytes each).')

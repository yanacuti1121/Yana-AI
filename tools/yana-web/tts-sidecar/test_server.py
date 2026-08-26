import io
import unittest
import wave

import numpy as np
from fastapi import HTTPException

import server


class FakeTts:
    sample_rate = 48_000

    def __init__(self):
        self.calls = []

    def infer_stream(self, text, voice):
        self.calls.append((text, voice))
        # An awkward boundary exercises one stateful resampler across chunks.
        audio = np.linspace(-0.5, 0.5, self.sample_rate, dtype=np.float32)
        yield audio[:12_345]
        yield audio[12_345:]


class SidecarTests(unittest.TestCase):
    def test_validates_text(self):
        with self.assertRaises(HTTPException) as empty:
            server._validated_text(server.TtsRequest(text="   "))
        self.assertEqual(empty.exception.status_code, 400)

        with self.assertRaises(HTTPException) as long:
            server._validated_text(server.TtsRequest(text="x" * 2001))
        self.assertEqual(long.exception.status_code, 400)

    def test_stream_resamples_to_24k_pcm16(self):
        fake = FakeTts()
        pcm = b"".join(server.iter_pcm24k(fake, "Xin chào", "Phạm Tuyên"))
        self.assertEqual(fake.calls, [("Xin chào", "Phạm Tuyên")])
        self.assertEqual(len(pcm), 24_000 * 2)

    def test_wav_wrapper_describes_robot_format(self):
        wav_bytes = server.pcm_to_wav(b"\x00\x00" * 240)
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
            self.assertEqual(wav.getframerate(), 24_000)
            self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(wav.getsampwidth(), 2)
            self.assertEqual(wav.getnframes(), 240)


if __name__ == "__main__":
    unittest.main()

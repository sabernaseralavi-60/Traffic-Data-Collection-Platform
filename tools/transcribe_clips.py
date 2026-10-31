#!/usr/bin/env python3
"""Offline extraction of the 3-digit suffix from the voice clips of TrafficLab passages. No cloud service, no API key.

How it works
  1. signs in to your TrafficLab server (administrator or supervisor account) and lists the passages that have a voice clip;
  2. downloads each clip, decodes it to 16 kHz mono (PyAV);
  3. runs the free, offline Vosk speech recogniser (Kaldi) with its Persian model, CONSTRAINED to the ten digit words, so it can only hear digits;
  4. turns the words into digits with backend/spoken_digits.py (no guessing: exactly three digits or nothing);
  5. stores the result on the server as a SUGGESTION. Nothing is changed in the data until a supervisor accepts it on the "Recorded passages" page.

  --verify compares the suggestion with the digits that were typed/recognised in the field and prints the agreement rate: this is how you measure
  on YOUR recordings how far the tool can be trusted before relying on it.

Install (once, on any computer; it is not needed on the server):
  pip install vosk av
  download https://alphacephei.com/vosk/models/vosk-model-small-fa-0.42.zip (about 50 MB) and unzip it

Run:
  python tools/transcribe_clips.py --url https://trafficlab-ten.vercel.app --user ad --password ... --model path/to/vosk-model-small-fa-0.42
  add  --verify  to measure agreement,  --dry-run  to store nothing,  --all  to also redo passages that already have a suggestion
"""
from __future__ import annotations

import argparse
import http.cookiejar
import io
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from backend.spoken_digits import DIGIT_WORDS, parse_digits  # noqa: E402

SOURCE = "vosk-small-fa-0.42 + digit grammar"
GRAMMAR = [w for w in DIGIT_WORDS if not w.isascii()] + ["[unk]"]  # the Persian digit words only; everything else is "unknown"


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method: str, path: str, body=None, raw=False):
        req = urllib.request.Request(self.base + "/api/v1" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"content-type": "application/json", "x-tl-csrf": "1"})
        data = self.op.open(req, timeout=120).read()
        return data if raw else json.loads(data or b"{}")


def decode_pcm16k(data: bytes) -> bytes:
    """Any container PyAV can read (webm/opus, ogg, mp4, wav) -> raw 16 kHz mono signed 16-bit samples."""
    import av  # imported late so --help and the unit tests work without it

    out = bytearray()
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    with av.open(io.BytesIO(data)) as container:
        for frame in container.decode(audio=0):
            for f in resampler.resample(frame):
                out += bytes(f.planes[0])[: f.samples * 2]
        for f in resampler.resample(None):
            out += bytes(f.planes[0])[: f.samples * 2]
    return bytes(out)


class Listener:
    def __init__(self, model_path: str):
        from vosk import KaldiRecognizer, Model, SetLogLevel  # noqa: PLC0415

        SetLogLevel(-1)
        self.model = Model(model_path)
        self._rec_cls = KaldiRecognizer

    def hear(self, pcm: bytes) -> tuple[list[str], float]:
        rec = self._rec_cls(self.model, 16000, json.dumps(GRAMMAR, ensure_ascii=False))
        rec.SetWords(True)
        for i in range(0, len(pcm), 8000):
            rec.AcceptWaveform(pcm[i:i + 8000])
        res = json.loads(rec.FinalResult())
        words = res.get("result", [])
        conf = sum(float(w.get("conf", 0)) for w in words) / len(words) if words else 0.0
        return [w["word"] for w in words], conf


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--password", default=os.environ.get("TL_PASSWORD"))
    ap.add_argument("--model", required=True, help="folder of the unzipped Vosk Persian model")
    ap.add_argument("--study", help="study id (default: all studies)")
    ap.add_argument("--verify", action="store_true", help="also process passages that already have digits and report the agreement")
    ap.add_argument("--all", action="store_true", help="redo passages that already have a suggestion")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not a.password:
        print("give --password or set TL_PASSWORD", file=sys.stderr)
        return 2

    api = Api(a.url)
    api.call("POST", "/auth/login", {"username": a.user, "password": a.password})
    listener = Listener(a.model)
    studies = [s for s in api.call("GET", "/studies") if not a.study or s["id"] == a.study]
    seen = same = diff = nodigits = stored = 0
    for s in studies:
        for o in api.call("GET", f"/studies/{s['id']}/observations?limit=5000"):
            if not o.get("has_audio"):
                continue
            typed = o.get("plate_suffix")
            if typed and not a.verify:
                continue
            if o.get("suggested_suffix") and not a.all:
                continue
            seen += 1
            try:
                words, conf = listener.hear(decode_pcm16k(api.call("GET", f"/observations/{o['id']}/audio", raw=True)))
            except Exception as e:  # noqa: BLE001 - one bad clip must not stop the batch
                print(f"{o['id'][:8]} cannot be decoded: {e}")
                continue
            digits = parse_digits(words)
            tag = f"{o['id'][:8]} heard {' '.join(words) or '-'!r} conf {conf:.2f}"
            if not digits:
                nodigits += 1
                print(f"{tag} -> no 3 digits (left for a human)")
                continue
            if typed:
                same, diff = same + (digits == typed), diff + (digits != typed)
                print(f"{tag} -> {digits}  typed {typed}  {'OK' if digits == typed else 'DIFFERENT'}")
            else:
                print(f"{tag} -> {digits}")
            if not a.dry_run:
                api.call("POST", f"/observations/{o['id']}/suggestion", {"suffix": digits, "source": SOURCE, "confidence": round(conf, 3)})
                stored += 1
    print(f"\nclips examined {seen}; digits found {seen - nodigits}; suggestions stored {stored}; no digits {nodigits}")
    if a.verify and same + diff:
        print(f"agreement with the digits entered in the field: {same}/{same + diff} = {100 * same / (same + diff):.0f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())

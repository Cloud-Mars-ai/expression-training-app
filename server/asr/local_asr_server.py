from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

APP_ROOT = Path(__file__).resolve().parents[2]
MODEL_NAME = os.getenv("ASR_MODEL", "small")
MODEL_ROOT = Path(os.getenv("ASR_MODEL_ROOT", str(APP_ROOT / ".runtime" / "asr-models")))
MODEL_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Local Faster-Whisper ASR", docs_url=None, redoc_url=None)
model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global model
    if model is None:
        model = WhisperModel(
            MODEL_NAME,
            device="cpu",
            compute_type="int8",
            download_root=str(MODEL_ROOT),
            local_files_only=False,
        )
    return model


@app.on_event("startup")
def warm_model() -> None:
    get_model()


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": model is not None, "model": MODEL_NAME, "device": "cpu", "compute_type": "int8"}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model_name: str = Form("small", alias="model"),
    language: str = Form("zh"),
    response_format: str = Form("verbose_json"),
) -> dict[str, object]:
    del model_name, response_format
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="audio file is empty")
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            temporary.write(data)
            temporary_path = temporary.name
        segments_iter, info = get_model().transcribe(
            temporary_path,
            language=language or "zh",
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
            temperature=0,
        )
        raw_segments = list(segments_iter)
        segments = []
        text_parts = []
        confidences = []
        for index, segment in enumerate(raw_segments):
            text = segment.text.strip()
            if not text:
                continue
            confidence = max(0.0, min(1.0, math.exp(segment.avg_logprob)))
            text_parts.append(text)
            confidences.append(confidence)
            segments.append({
                "id": index,
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
                "avg_logprob": float(segment.avg_logprob),
                "confidence": confidence,
            })
        full_text = "".join(text_parts).strip()
        if not full_text:
            raise HTTPException(status_code=422, detail="no speech detected")
        confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return {
            "text": full_text,
            "language": info.language,
            "duration": info.duration,
            "confidence": confidence,
            "segments": segments,
        }
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)

import os
from pathlib import Path
import traceback
from faster_whisper import WhisperModel

app_root = Path(__file__).resolve().parents[2]
model_name = os.getenv("ASR_MODEL", "small")
root = Path(os.getenv("ASR_MODEL_ROOT", str(app_root / ".runtime" / "asr-models")))
root.mkdir(parents=True, exist_ok=True)
print(f"Loading {model_name} model in {root}", flush=True)
try:
    WhisperModel(model_name, device="cpu", compute_type="int8", download_root=str(root))
except Exception:
    traceback.print_exc()
    raise
print("MODEL_READY", flush=True)

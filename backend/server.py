"""
PipeGuard AI — FastAPI Prediction Server
Serves the corrosion/leakage classification model over HTTP.
"""

import os
import io
import base64
import time
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# ── TensorFlow import (suppress info logs) ──────────────────────────
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import tensorflow as tf

# ── Config ──────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "corrosion_leakage_model.keras")
LABELS = ["CORROSION", "LEAKAGE", "NORMAL"]
IMG_SIZE = (224, 224)

# ── Load model at startup ──────────────────────────────────────────
print(f"[PipeGuard] Loading model from {MODEL_PATH} ...")
model = tf.keras.models.load_model(MODEL_PATH, compile=False)
print(f"[PipeGuard] Model loaded successfully. Input shape: {model.input_shape}")

# ── FastAPI app ─────────────────────────────────────────────────────
app = FastAPI(title="PipeGuard AI Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response schemas ──────────────────────────────────────
class PredictRequest(BaseModel):
    image: str  # base64-encoded JPEG (may include data URI prefix)

class PredictResponse(BaseModel):
    label: str
    confidence: float
    scores: dict  # { "CORROSION": 0.1, "LEAKAGE": 0.05, "NORMAL": 0.85 }
    inference_ms: float

# ── Stats tracking ──────────────────────────────────────────────────
stats = {"total_predictions": 0, "start_time": time.time()}

# ── Endpoints ───────────────────────────────────────────────────────
@app.get("/health")
def health():
    uptime = time.time() - stats["start_time"]
    return {
        "status": "ok",
        "model": os.path.basename(MODEL_PATH),
        "labels": LABELS,
        "total_predictions": stats["total_predictions"],
        "uptime_seconds": round(uptime, 1),
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    try:
        # Strip data URI prefix if present
        img_data = req.image
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]

        # Decode base64 → PIL Image → numpy
        raw = base64.b64decode(img_data)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img = img.resize(IMG_SIZE)
        arr = np.array(img, dtype=np.float32) / 255.0
        arr = np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)

        # Inference
        t0 = time.perf_counter()
        preds = model.predict(arr, verbose=0)[0]  # (3,)
        inference_ms = (time.perf_counter() - t0) * 1000

        class_id = int(np.argmax(preds))
        label = LABELS[class_id]
        confidence = float(preds[class_id])
        scores = {LABELS[i]: round(float(preds[i]), 4) for i in range(len(LABELS))}

        stats["total_predictions"] += 1

        return PredictResponse(
            label=label,
            confidence=round(confidence, 4),
            scores=scores,
            inference_ms=round(inference_ms, 1),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Run ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)

import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MODEL_DIR = Path(__file__).parent.parent

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

print("Loading models...", flush=True)
viability_model = tf.keras.models.load_model(str(MODEL_DIR / "viability_model.keras"))
regret_model = tf.keras.models.load_model(str(MODEL_DIR / "regret_model.keras"))
print("Models loaded.", flush=True)


class PredictRequest(BaseModel):
    text: str


@app.post("/predict")
def predict(req: PredictRequest):
    arr = np.array([req.text], dtype=object)
    viability = float(viability_model.predict(arr, verbose=0)[0][0])
    regret = float(regret_model.predict(arr, verbose=0)[0][0])
    return {"viability_score": viability, "regret_score": regret}


@app.get("/health")
def health():
    return {"status": "ok"}

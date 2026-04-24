import argparse

import tensorflow as tf
import pandas as pd
from tensorflow.keras import layers


MAX_TOKENS = 20000
SEQ_LEN = 200
EMBED_DIM = 128


def build_model(vectorizer):
    model = tf.keras.Sequential([
        vectorizer,
        layers.Embedding(MAX_TOKENS, EMBED_DIM),
        layers.GlobalAveragePooling1D(),
        layers.Dense(64, activation="relu"),
        layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(
        loss="binary_crossentropy",
        optimizer="adam",
        metrics=["accuracy"],
    )
    return model


def make_vectorizer(text):
    vectorizer = layers.TextVectorization(
        max_tokens=MAX_TOKENS,
        output_sequence_length=SEQ_LEN,
    )
    vectorizer.adapt(text)
    return vectorizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument(
        "--max-rows",
        type=int,
        default=200000,
        help="Cap training rows for faster local training.",
    )
    args = parser.parse_args()

    df = pd.read_csv("train.csv", header=None)
    df.columns = ["label", "title", "review"]
    df["viability_label"] = df["label"].map({1: 0, 2: 1})
    df["regret_label"] = 1 - df["viability_label"]
    df["text"] = df["title"].astype(str) + " " + df["review"].astype(str)

    if args.max_rows > 0 and len(df) > args.max_rows:
        df = df.sample(n=args.max_rows, random_state=42).reset_index(drop=True)

    x_train = tf.constant(df["text"].astype(str).tolist(), dtype=tf.string)
    y_viability = tf.constant(df["viability_label"].tolist(), dtype=tf.float32)
    y_regret = tf.constant(df["regret_label"].tolist(), dtype=tf.float32)

    viability_vectorizer = make_vectorizer(x_train)
    regret_vectorizer = make_vectorizer(x_train)

    viability_model = build_model(viability_vectorizer)
    regret_model = build_model(regret_vectorizer)

    viability_model.fit(x_train, y_viability, epochs=args.epochs, batch_size=256)
    regret_model.fit(x_train, y_regret, epochs=args.epochs, batch_size=256)

    viability_model.save("viability_model.keras")
    regret_model.save("regret_model.keras")

    print("Saved viability_model.keras and regret_model.keras")


if __name__ == "__main__":
    main()

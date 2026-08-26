#!/usr/bin/env python3
from flask import Flask, request, jsonify
import os

app = Flask(__name__)
TOKEN = os.environ.get("PRINT_SERVER_TOKEN", "")


@app.route("/print", methods=["POST"])
def mock_print():
    if TOKEN and request.headers.get("X-Printer-Token") != TOKEN:
        return jsonify({"error": "No autorizado"}), 401

    data = request.get_json(force=True)
    text = data.get("text", "")
    printer = data.get("printer_name") or data.get("ip") or "—"

    sep = "=" * 44
    print(f"\n{sep}", flush=True)
    print(f"[MOCK] printer={printer}  cut={data.get('cut')}  size={data.get('text_size')}", flush=True)
    print(sep, flush=True)
    print(text, flush=True)
    print(f"{sep}\n", flush=True)

    return jsonify({"ok": True, "status": "mock"}), 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "mock": True}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"[MOCK] Print server mock escuchando en :{port}", flush=True)
    app.run(host="0.0.0.0", port=port)

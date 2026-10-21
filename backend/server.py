"""Jetson-side HTTP server."""

import os
import sys
import time

import cv2
from dotenv import load_dotenv
from flask import Flask, Response, jsonify
from flask_cors import CORS

from pipeline import get_pipeline
from sessions import SessionWatcher

load_dotenv()

app = Flask(__name__, static_folder=None)
CORS(app)


def _status():
    pipe = get_pipeline()
    return {
        "running": pipe.running,
        "project_id": pipe.project_id,
        "stats": pipe.stats,
        "last_commit_id": pipe.last_commit_id,
    }


@app.route("/")
def index():
    return jsonify({"service": "CommitBench Jetson", **_status()})


@app.route("/api/stats")
def api_stats():
    return jsonify(_status())


def _jpeg(frame, quality=60):
    ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else None


@app.route("/api/preview.jpg")
def api_preview():
    """Live JPEG snapshot from the camera, with change boxes from the latest change."""
    frame = get_pipeline().preview_frame()
    if frame is None:
        return jsonify({"error": "camera is not recording"}), 503
    data = _jpeg(frame)
    if data is None:
        return jsonify({"error": "encode failed"}), 500
    return Response(data, mimetype='image/jpeg', headers={'Cache-Control': 'no-store'})


@app.route("/stream.mjpg")
def stream():
    """MJPEG stream for the website's Live camera dialog (an <img> tag)."""
    pipe = get_pipeline()
    if pipe.preview_frame() is None:
        return jsonify({"error": "camera is not recording"}), 503

    def frames():
        while True:
            frame = pipe.preview_frame()
            if frame is None:
                break
            data = _jpeg(frame)
            if data:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + data + b"\r\n"
            time.sleep(0.1)

    return Response(frames(), mimetype='multipart/x-mixed-replace; boundary=frame',
                    headers={'Cache-Control': 'no-store'})


def _preflight():
    """Fail fast with a clear message instead of a confusing error mid-demo."""
    missing = [k for k in ("PERCEPTRON_API_KEY", "SUPABASE_SECRET_KEY") if not os.environ.get(k)]
    if not (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")):
        missing.append("SUPABASE_URL")
    if missing:
        sys.exit(f"[Server] Missing {', '.join(missing)} in .env (see .env.example).")


if __name__ == "__main__":
    _preflight()
    SessionWatcher(get_pipeline()).start()
    print("[Server] Press Start recording on a project in the website to begin.")
    app.run(host="0.0.0.0", port=8000, debug=False, threaded=True)

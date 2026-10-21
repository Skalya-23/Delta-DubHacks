"""Camera capture and motion detection."""

import os
import threading
import time

import cv2
import numpy as np

from regions import find_changes, ignore_border


class CameraCapture:
    RECONNECT_AFTER_FAILURES = 30

    def __init__(self, device_index=None, resolution=(1280, 720)):
        """device_index: usually 0 for the first USB camera (env CAMERA_INDEX overrides)."""
        self.device_index = int(os.environ.get("CAMERA_INDEX", 0)) if device_index is None else device_index
        self.resolution = resolution
        self.cap = None
        self._open()
        self._latest = None
        self._lock = threading.Lock()
        self._running = True
        self._thread = threading.Thread(target=self._reader, daemon=True)
        self._thread.start()

    def _open(self):
        cap = cv2.VideoCapture(self.device_index, cv2.CAP_V4L2)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
        if not cap.isOpened() or not cap.read()[0]:
            cap.release()
            raise RuntimeError(f"Could not open camera {self.device_index}. Check USB connection.")
        self.cap = cap

    def _reader(self):
        failures = 0
        while self._running:
            ret, frame = self.cap.read() if self.cap is not None else (False, None)
            if ret:
                failures = 0
                with self._lock:
                    self._latest = frame
                continue
            failures += 1
            time.sleep(0.05)
            if failures >= self.RECONNECT_AFTER_FAILURES and self._running:
                print("[Camera] No frames; reconnecting...")
                with self._lock:
                    self._latest = None
                if self.cap is not None:
                    self.cap.release()
                    self.cap = None
                try:
                    self._open()
                    print("[Camera] Reconnected.")
                except RuntimeError as e:
                    print(f"[Camera] {e}")
                    time.sleep(1)
                failures = 0

    def read_frame(self):
        """Newest frame, or None if the camera isn't delivering."""
        with self._lock:
            frame, self._latest = self._latest, None
        return frame

    def release(self):
        self._running = False
        self._thread.join(timeout=2)
        if self.cap is not None:
            self.cap.release()
            self.cap = None


class MotionDetector:
    def __init__(self, change_threshold=None, stability_frames=15):
        """change_threshold: minimum pixel-count difference to count as a change (env MOTION_THRESHOLD)."""
        self.change_threshold = int(os.environ.get("MOTION_THRESHOLD", 400)) if change_threshold is None else change_threshold
        self.stability_frames = stability_frames
        self.reset()

    def reset(self):
        """Forget the baseline; the next frame becomes the new 'before' state."""
        self.last_stable_frame = None
        self.previous_stable_frame = None
        self.last_frame = None
        self.stable_count = 0
        self.motion_active = False

    def _frame_diff(self, frame_a, frame_b):
        """Returns the number of significantly different pixels between two frames."""
        gray_a = cv2.cvtColor(frame_a, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(frame_b, cv2.COLOR_BGR2GRAY)
        gray_a = cv2.GaussianBlur(gray_a, (21, 21), 0)
        gray_b = cv2.GaussianBlur(gray_b, (21, 21), 0)
        diff = cv2.absdiff(gray_a, gray_b)
        thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)[1]
        return int(np.sum(ignore_border(thresh) > 0))

    def process(self, frame):
        """Feed every frame here."""
        if self.last_stable_frame is None:
            self.last_stable_frame = frame.copy()
            self.last_frame = frame.copy()
            return None

        frame_motion = self._frame_diff(self.last_frame, frame)

        if frame_motion > self.change_threshold:
            self.motion_active = True
            self.stable_count = 0
        else:
            if self.motion_active:
                self.stable_count += 1
                if self.stable_count >= self.stability_frames:
                    if find_changes(self.last_stable_frame, frame).significant:
                        self.previous_stable_frame = self.last_stable_frame
                        self.last_stable_frame = frame.copy()
                        self.motion_active = False
                        self.stable_count = 0
                        self.last_frame = frame.copy()
                        return frame.copy()
                    else:
                        self.motion_active = False
                        self.stable_count = 0

        self.last_frame = frame.copy()
        return None


if __name__ == "__main__":
    print("Starting camera test. Place or move components on the workbench.")
    print("Press Ctrl+C to stop.")

    cam = CameraCapture()
    motion = MotionDetector()

    try:
        count = 0
        while True:
            frame = cam.read_frame()
            if frame is None:
                time.sleep(0.1)
                continue

            change = motion.process(frame)
            if change is not None:
                count += 1
                filename = f"/tmp/change_{count:03d}.jpg"
                cv2.imwrite(filename, change)
                print(f"[{time.strftime('%H:%M:%S')}] Change detected -> {filename}")

            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        cam.release()

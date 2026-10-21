"""Main orchestration pipeline."""

import queue
import threading
import time
import traceback

import cv2

from camera import CameraCapture, MotionDetector
from vlm import VLMRouter
from push_commit import push_change
from regions import border_px
import supabase_store as store

CHANGE_BOX_SECONDS = 5.0
WARMUP_SECONDS = 1.5


class CommitBenchPipeline:
    def __init__(self):
        self.camera = None
        self.motion = MotionDetector()
        self.vlm = VLMRouter()
        self.project_id = None
        self.running = False
        self.thread = None
        self.jobs = queue.Queue()
        self._pending = 0
        self._pending_lock = threading.Lock()
        self.started_at = 0
        self.worker = threading.Thread(target=self._work, daemon=True)
        self.worker.start()
        self.last_objects = None
        self.last_commit_id = None
        self.last_frame = None
        self.last_changes = []
        self.last_change_time = 0
        self.stats = {
            'frames_seen': 0,
            'motion_events': 0,
            'vlm_calls': 0,
            'commits': 0,
            'failures': 0,
        }

    def start(self, project_id):
        """Open the camera and start recording changes into `project_id`."""
        if self.running:
            if self.project_id == project_id:
                return
            self.stop()
        last_objects = store.last_objects(project_id)
        self.camera = CameraCapture()
        self.project_id = project_id
        self.motion.reset()
        self.last_objects = last_objects
        self.started_at = time.time()
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        print(f"[Pipeline] Recording project {project_id}.")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=3)
            self.thread = None
        if self.camera:
            self.camera.release()
            self.camera = None
        self.last_frame = None
        print("[Pipeline] Stopped.")

    def _loop(self):
        while self.running:
            try:
                self._tick()
            except Exception as e:
                print(f"[Pipeline] Error in tick: {e}")
                traceback.print_exc()
                time.sleep(1)
            time.sleep(0.1)

    def _tick(self):
        frame = self.camera.read_frame()
        if frame is None:
            return
        self.last_frame = frame.copy()
        self.stats['frames_seen'] += 1
        if time.time() - self.started_at < WARMUP_SECONDS:
            return

        after = self.motion.process(frame)
        if after is None:
            return
        before = self.motion.previous_stable_frame

        self.stats['motion_events'] += 1
        print("[Pipeline] Motion-stable frame captured.")
        with self._pending_lock:
            self._pending += 1
        self.jobs.put((self.project_id, before, after, time.time()))

    def wait_idle(self, timeout):
        """Block until every queued change has been processed (or timeout)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._pending_lock:
                if self._pending <= 0:
                    return True
            time.sleep(0.25)
        return False

    def _work(self):
        while True:
            jobs = [self.jobs.get()]
            while not self.jobs.empty():
                jobs.append(self.jobs.get_nowait())
            merged = []
            for project_id, before, after, seen_at in jobs:
                if merged and merged[-1][0] == project_id:
                    merged[-1] = (project_id, merged[-1][1], after, seen_at)
                else:
                    merged.append((project_id, before, after, seen_at))
            if len(merged) < len(jobs):
                print(f"[Pipeline] Merged {len(jobs)} queued changes into {len(merged)}.")
            for job in merged:
                try:
                    self._describe(*job)
                except Exception:
                    traceback.print_exc()
            with self._pending_lock:
                self._pending -= len(jobs)

    def _describe(self, project_id, before, after, seen_at=None):
        previous = self.last_objects if project_id == self.project_id else None
        self.stats['vlm_calls'] += 1
        try:
            commit_id, current, changes = push_change(project_id, before, after, self.vlm,
                                                      previous=previous, captured_at=seen_at)
        except Exception as e:
            self.stats['failures'] += 1
            print(f"[Pipeline] Failed to process change: {e}")
            return
        if project_id == self.project_id:
            self.last_objects = current
        if commit_id:
            self.last_commit_id = commit_id
            self.last_changes = changes
            self.last_change_time = time.time()
            self.stats['commits'] += 1

    def preview_frame(self):
        """Latest camera frame with the newest change's boxes drawn for a few seconds, or None."""
        frame = self.last_frame
        if frame is None:
            return None
        if self.last_changes and time.time() - self.last_change_time < CHANGE_BOX_SECONDS:
            frame = draw_change_boxes(frame, self.last_changes)
        else:
            frame = frame.copy()
        b = border_px(frame.shape)
        if b > 0:
            cv2.rectangle(frame, (b, b), (frame.shape[1] - b, frame.shape[0] - b), (200, 200, 200), 1)
        return frame


_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = CommitBenchPipeline()
    return _pipeline


COLORS = {"added": (80, 200, 80), "removed": (60, 60, 230), "moved": (230, 160, 40)}


def draw_change_boxes(frame, changes):
    """Draw normalized change boxes (website format) on a copy of the frame."""
    out = frame.copy()
    h, w = out.shape[:2]
    for c in changes:
        box = c.get("to") or c.get("from")
        if not box:
            continue
        x1, y1 = int(box["x"] * w), int(box["y"] * h)
        x2, y2 = int((box["x"] + box["w"]) * w), int((box["y"] + box["h"]) * h)
        color = COLORS.get(c["type"], (0, 255, 0))
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 3)
        cv2.putText(out, f"{c['type']}: {c['name']}", (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    return out


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python backend/pipeline.py <project_id>")
        sys.exit(1)
    pipe = get_pipeline()
    pipe.start(sys.argv[1])
    try:
        while True:
            time.sleep(5)
            print(f"[Pipeline] Stats: {pipe.stats}")
    except KeyboardInterrupt:
        pipe.stop()

"""Backend integration tests against an in-memory fake Supabase and a fake Mk1."""

import queue
from datetime import datetime, timezone
import threading
import time
import unittest
import uuid

import cv2
import numpy as np

import supabase_store as store
import push_commit
import sessions


class Flaky(Exception):
    pass


def _iso():
    return datetime.now(timezone.utc).isoformat()


class FakeQuery:
    def __init__(self, sb, table):
        self.sb, self.table, self.op, self.payload, self.filters = sb, table, "select", None, []
        self._order, self._limit = None, None

    def select(self, *_):
        self.op = "select"
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def update(self, row):
        self.op, self.payload = "update", row
        return self

    def delete(self):
        self.op = "delete"
        return self

    def _filter(self, test):
        self.filters.append(test)
        return self

    def eq(self, k, v):
        return self._filter(lambda r: r.get(k) == v)

    def in_(self, k, vs):
        return self._filter(lambda r: r.get(k) in vs)

    def gte(self, k, v):
        return self._filter(lambda r: r.get(k) is not None and r[k] >= v)

    def lte(self, k, v):
        return self._filter(lambda r: r.get(k) is not None and r[k] <= v)

    def order(self, k, desc=False):
        self._order = (k, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        self.sb.maybe_fail(f"{self.op} {self.table}")
        with self.sb.lock:
            rows = self.sb.db.setdefault(self.table, [])
            match = [r for r in rows if all(f(r) for f in self.filters)]
            if self.op == "update" and self.sb.columns.get(self.table):
                unknown = set(self.payload) - self.sb.columns[self.table]
                if unknown:
                    raise Flaky(f"PGRST204 Could not find the '{unknown.pop()}' column")
            if self.op == "insert":
                row = {"id": str(uuid.uuid4()), "created_at": _iso(), **self.payload}
                if self.table == "commits":
                    row.setdefault("captured_at", _iso())
                    row.setdefault("is_hidden", False)
                    row.setdefault("status", "untested")
                if self.table == "commits":
                    row["seq"] = max([r["seq"] for r in rows if r["project_id"] == row["project_id"]], default=0) + 1
                if self.table == "capture_sessions":
                    active = ("requested", "recording", "stop_requested")
                    if any(r["project_id"] == row["project_id"] and r["status"] in active for r in rows):
                        raise Flaky("23505 duplicate active session")
                rows.append(row)
                data = [row]
            elif self.op == "update":
                for r in match:
                    r.update(self.payload)
                data = match
            elif self.op == "delete":
                for r in match:
                    rows.remove(r)
                ids = {r["id"] for r in match}
                self.sb.db["frames"] = [f for f in self.sb.db.get("frames", []) if f["commit_id"] not in ids]
                data = match
            else:
                data = match
                if self._order:
                    data = sorted(data, key=lambda r: r[self._order[0]], reverse=self._order[1])
                if self._limit:
                    data = data[:self._limit]
            return type("Res", (), {"data": [dict(d) for d in data]})()


class FakeBucket:
    def __init__(self, sb): self.sb = sb

    def upload(self, path, data, opts):
        self.sb.maybe_fail("upload")
        assert opts["content-type"] == "image/jpeg" and isinstance(data, bytes) and data[:2] == b"\xff\xd8"
        with self.sb.lock:
            self.sb.files[path] = data

    def list(self, folder):
        with self.sb.lock:
            return [{"name": p.rsplit("/", 1)[1]} for p in self.sb.files if p.startswith(folder + "/")]

    def remove(self, paths):
        with self.sb.lock:
            for p in paths:
                self.sb.files.pop(p, None)


class FakeStorage:
    def __init__(self, sb):
        self.sb = sb

    def from_(self, bucket):
        return FakeBucket(self.sb)


class FakeSupabase:
    def __init__(self):
        self.db, self.files, self.lock = {}, {}, threading.RLock()
        self.fail_on = {}
        self.columns = {}

    def maybe_fail(self, op):
        with self.lock:
            if self.fail_on.get(op, 0) > 0:
                self.fail_on[op] -= 1
                raise Flaky(f"Server disconnected during {op}")

    def table(self, t):
        return FakeQuery(self, t)

    @property
    def storage(self):
        return FakeStorage(self)

    def commits(self, project_id):
        return sorted((c for c in self.db.get("commits", []) if c["project_id"] == project_id), key=lambda c: c["seq"])


def comp(label, x, y, w=0.1, h=0.1):
    return {"type": "other", "label": label, "position": "", "x": x, "y": y, "w": w, "h": h}


PAINTS = {"DC motor": (30, 200, 230), "Servo": (200, 60, 40), "red LED": (40, 40, 220)}


def scene_frame(*boxes):
    """Synthetic frame with each (x, y, w, h) box painted as its part: pixels match the scene."""
    img = np.full((240, 320, 3), 90, np.uint8)
    for box in boxes:
        x, y, w, h = box
        img[int(y * 240):int((y + h) * 240), int(x * 320):int((x + w) * 320)] = PAINTS[LABELS[box]]
    return img


class FakeVLM:
    """Describes a frame by looking up which painted boxes it contains."""
    def __init__(self, labels, fail_times=0, delay=0.0):
        self.labels, self.fail_times, self.delay, self.calls = labels, fail_times, delay, 0
        self.lock = threading.Lock()

    def text(self, prompt, **_):
        with self.lock:
            self.prompts = getattr(self, "prompts", []) + [prompt]
            if self.fail_times > 0:
                self.fail_times -= 1
                raise RuntimeError("Perceptron failed after 3 attempts: timeout")
        return "AI: " + prompt.splitlines()[-1][:40]

    def compare_spot(self, image):
        """BEFORE | AFTER side by side: a part only on the right was added, only on the left removed."""
        half = (image.shape[1] - 12) // 2
        left, _ = self.analyze_scene(image[:, :half])
        right, _ = self.analyze_scene(image[:, half + 12:])
        names = lambda scene: [c["label"] for c in scene["components"]]
        before, after = names(left), names(right)
        out = []
        for n in set(before) | set(after):
            diff = after.count(n) - before.count(n)
            out += [{"type": "added" if diff > 0 else "removed", "label": n}] * abs(diff)
        return out

    def analyze_scene(self, frame):
        with self.lock:
            self.calls += 1
            if self.fail_times > 0:
                self.fail_times -= 1
                raise RuntimeError("Perceptron failed after 3 attempts: timeout")
        time.sleep(self.delay)
        h, w = frame.shape[:2]
        comps = []
        for label, color in PAINTS.items():
            hit = (np.abs(frame.astype(int) - color).max(axis=2) < 12).astype(np.uint8)
            n, _, stats, _ = cv2.connectedComponentsWithStats(hit)
            for i in range(1, n):
                x, y, bw, bh, area = stats[i]
                if area >= 20:
                    comps.append(comp(label, x / w, y / h, bw / w, bh / h))
        return {"components": comps, "notes": ""}, "perceptron"


MOTOR, SERVO, LED = (0.1, 0.1, 0.1, 0.1), (0.6, 0.6, 0.1, 0.1), (0.4, 0.2, 0.1, 0.1)
MOTOR_RIGHT = (0.45, 0.12, 0.1, 0.1)
LABELS = {MOTOR: "DC motor", SERVO: "Servo", LED: "red LED", MOTOR_RIGHT: "DC motor"}


class Base(unittest.TestCase):
    def setUp(self):
        self.sb = FakeSupabase()
        store._client = self.sb


class ChangeFlowTest(Base):
    def test_full_lifecycle(self):
        vlm = FakeVLM(LABELS)
        f0, f1, f2 = scene_frame(MOTOR), scene_frame(MOTOR, SERVO), scene_frame(MOTOR_RIGHT, SERVO)

        cid, objs, changes = push_commit.push_change("p", f0, f1, vlm)
        c = self.sb.commits("p")[0]
        self.assertEqual((c["processing_state"], c["seq"], c["mk1_summary"]), ("described", 1, "Added Servo."))
        self.assertEqual([o["name"] for o in c["objects_before"]], ["DC motor"])
        self.assertEqual(vlm.calls, 3, "first change: whole 'before' photo + before/after crop of the spot")
        self.assertEqual(sorted(self.sb.files), sorted([f"p/{cid}/after_0.jpg", f"p/{cid}/before_0.jpg"]))
        frames = self.sb.db["frames"]
        self.assertTrue(all(f["width"] == 320 and f["height"] == 240 for f in frames))

        push_commit.push_change("p", f1, f2, vlm)
        c2 = self.sb.commits("p")[1]
        self.assertEqual(vlm.calls, 3 + 2 * 2, "later changes: before/after crops of each changed spot only")
        self.assertEqual([(x["type"], x["detail"]) for x in c2["changes"]], [("moved", "Moved right")])

        cid3, _, _ = push_commit.push_change("p", f2, f2.copy(), vlm)
        self.assertIsNone(cid3)
        self.assertEqual(len(self.sb.commits("p")), 2, "no-change commits are deleted")
        self.assertEqual(len(self.sb.files), 4, "and so are their photos")

    def test_vlm_failure_marks_failed(self):
        with self.assertRaises(RuntimeError):
            push_commit.push_change("p", scene_frame(), scene_frame(SERVO), FakeVLM(LABELS, fail_times=1))
        c = self.sb.commits("p")[0]
        self.assertEqual(c["processing_state"], "failed")
        self.assertIn("timeout", c["mk1_summary"])

    def test_upload_failure_marks_failed(self):
        self.sb.fail_on["upload"] = 99
        with self.assertRaises(Flaky):
            push_commit.push_change("p", scene_frame(), scene_frame(SERVO), FakeVLM(LABELS))
        self.assertEqual(self.sb.commits("p")[0]["processing_state"], "failed")

    def test_single_dropped_connection_is_invisible(self):
        self.sb.fail_on.update({"insert commits": 1, "upload": 1, "insert frames": 1, "update commits": 1})
        cid, _, _ = push_commit.push_change("p", scene_frame(), scene_frame(SERVO), FakeVLM(LABELS))
        c = self.sb.commits("p")
        self.assertEqual([(x["id"], x["processing_state"]) for x in c], [(cid, "described")])
        self.assertEqual(len(self.sb.db["frames"]), 2)

    def test_supabase_down_raises_cleanly(self):
        self.sb.fail_on.update({"select commits": 99})
        with self.assertRaises(Flaky):
            push_commit.push_change("p", scene_frame(), scene_frame(SERVO), FakeVLM(LABELS))
        self.assertEqual(self.sb.commits("p"), [])

    def test_failed_and_mark_failed_also_fails(self):
        self.sb.fail_on.update({"upload": 99, "update commits": 99})
        with self.assertRaises(Flaky):
            push_commit.push_change("p", scene_frame(), scene_frame(SERVO), FakeVLM(LABELS))
        self.assertEqual(self.sb.commits("p")[0]["processing_state"], "pending")

    def test_concurrent_projects(self):
        """50 changes over 5 projects at once: no crossed wires, gapless seqs."""
        vlm = FakeVLM(LABELS, delay=0.01)
        f0, f1 = scene_frame(MOTOR), scene_frame(MOTOR, SERVO)
        errors = []

        def worker(pid):
            try:
                for i in range(10):
                    push_commit.push_change(pid, f0 if i % 2 == 0 else f1, f1 if i % 2 == 0 else f0, vlm)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(f"p{i}",)) for i in range(5)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(errors, [])
        for i in range(5):
            commits = self.sb.commits(f"p{i}")
            self.assertEqual([c["seq"] for c in commits], list(range(1, 11)))
            self.assertTrue(all(c["processing_state"] == "described" for c in commits))
            self.assertEqual([c["mk1_summary"] for c in commits[:2]], ["Added Servo.", "Removed Servo."])


class FakePipeline:
    def __init__(self, fail=False, vlm=None):
        self.fail, self.calls, self.project_id = fail, [], None
        self.vlm = vlm or FakeVLM(LABELS)

    def wait_idle(self, timeout):
        return True

    def start(self, pid):
        self.calls.append(("start", pid))
        if self.fail:
            raise RuntimeError("Could not open camera 0")
        self.project_id = pid

    def stop(self):
        self.calls.append(("stop",))
        self.project_id = None


class SessionTest(Base):
    def add(self, sid, pid, status):
        self.sb.db.setdefault("capture_sessions", []).append(
            {"id": sid, "project_id": pid, "status": status, "created_at": _iso()})

    def status(self, sid):
        return next(s["status"] for s in self.sb.db["capture_sessions"] if s["id"] == sid)

    def poll(self, w):
        for s in store.pending_sessions():
            (w._start if s["status"] == "requested" else w._stop)(s)

    def test_start_stop_and_recovery(self):
        self.add("stale", "p", "recording")
        pipe = FakePipeline()
        w = sessions.SessionWatcher(pipe)
        w._recover()
        self.assertEqual(self.status("stale"), "stopped")
        self.add("s1", "p", "requested")
        self.poll(w)
        self.assertEqual((self.status("s1"), pipe.project_id), ("recording", "p"))
        self.sb.db["capture_sessions"][-1]["status"] = "stop_requested"
        self.poll(w)
        self.assertEqual((self.status("s1"), pipe.project_id), ("stopped", None))

    def test_camera_failure_resets_button(self):
        self.add("s1", "p", "requested")
        self.poll(sessions.SessionWatcher(FakePipeline(fail=True)))
        self.assertEqual(self.status("s1"), "stopped")

    def test_network_blip_during_start_self_heals(self):
        self.add("s1", "p", "requested")
        pipe = FakePipeline()
        w = sessions.SessionWatcher(pipe)
        self.sb.fail_on["update capture_sessions"] = 99
        with self.assertRaises(Flaky):
            self.poll(w)
        self.assertEqual(self.status("s1"), "requested")
        self.sb.fail_on.clear()
        self.poll(w)
        self.assertEqual((self.status("s1"), pipe.project_id), ("recording", "p"))

    def test_switching_projects_stops_previous(self):
        pipe = FakePipeline()
        w = sessions.SessionWatcher(pipe)
        self.add("a", "pa", "requested"); self.poll(w)
        self.add("b", "pb", "requested"); self.poll(w)
        self.assertEqual((self.status("a"), self.status("b"), pipe.project_id), ("stopped", "recording", "pb"))

    def test_stop_for_other_session_does_not_stop_camera(self):
        pipe = FakePipeline()
        w = sessions.SessionWatcher(pipe)
        self.add("a", "pa", "requested"); self.poll(w)
        self.add("old", "px", "stop_requested"); self.poll(w)
        self.assertEqual((self.status("old"), pipe.project_id), ("stopped", "pa"))

    def test_loop_survives_outage(self):
        sessions.POLL_SECONDS = 0.02
        self.add("stale", "p", "recording")
        self.sb.fail_on.update({"select capture_sessions": 5})
        pipe = FakePipeline()
        w = sessions.SessionWatcher(pipe)
        w.start()
        self.addCleanup(w.stop)
        self.add("s1", "p", "requested")
        deadline = time.time() + 3
        while time.time() < deadline and self.status("s1") != "recording":
            time.sleep(0.02)
        self.assertEqual((self.status("stale"), self.status("s1")), ("stopped", "recording"))


class SummaryAndQuestionTest(Base):
    def setUp(self):
        super().setUp()
        sessions.POLL_SECONDS = 0.02

    def wait(self, cond, timeout=3):
        deadline = time.time() + timeout
        while time.time() < deadline and not cond():
            time.sleep(0.02)
        return cond()

    def session(self, sid):
        return next(s for s in self.sb.db["capture_sessions"] if s["id"] == sid)

    def test_stop_writes_summary_of_that_session_only(self):
        vlm = FakeVLM(LABELS)
        push_commit.push_change("p", scene_frame(MOTOR), scene_frame(MOTOR, SERVO), vlm)
        self.sb.db["profiles"] = [{"id": "u1", "username": "alice", "display_name": "Alice"}]
        time.sleep(0.01)
        SessionTest.add(self, "s1", "p", "requested")
        pipe = FakePipeline(vlm=vlm)
        w = sessions.SessionWatcher(pipe)
        SessionTest.poll(self, w)
        push_commit.push_change("p", scene_frame(MOTOR, SERVO), scene_frame(MOTOR_RIGHT, SERVO), vlm)
        self.sb.db["commits"][-1]["author_id"] = "u1"
        self.session("s1")["status"] = "stop_requested"
        SessionTest.poll(self, w)
        self.assertTrue(self.wait(lambda: self.session("s1").get("summary_state") == "ready"))
        s = self.session("s1")
        self.assertEqual((s["status"], s["change_count"]), ("stopped", 1))
        self.assertIsNotNone(s["stopped_at"])
        prompt = vlm.prompts[-1]
        self.assertIn("by Alice", prompt)
        self.assertIn("#2", prompt)
        self.assertNotIn("#1 ", prompt, "changes from before the session are excluded")

    def test_change_still_processing_at_stop_is_in_summary(self):
        vlm = FakeVLM(LABELS)
        SessionTest.add(self, "s1", "p", "requested")
        seen_at = time.time() + 0.05
        time.sleep(0.1)

        class SlowPipeline(FakePipeline):
            def wait_idle(inner, timeout):
                push_commit.push_change("p", scene_frame(MOTOR), scene_frame(MOTOR, SERVO), vlm, captured_at=seen_at)
                return True

        w = sessions.SessionWatcher(SlowPipeline(vlm=vlm))
        SessionTest.poll(self, w)
        self.session("s1")["status"] = "stop_requested"
        SessionTest.poll(self, w)
        self.assertTrue(self.wait(lambda: self.session("s1").get("summary_state") == "ready"))
        self.assertEqual(self.session("s1")["change_count"], 1)
        self.assertLess(self.sb.commits("p")[0]["captured_at"], self.session("s1")["stopped_at"])

    def test_empty_session_summary_needs_no_model(self):
        SessionTest.add(self, "s1", "p", "stop_requested")
        vlm = FakeVLM(LABELS, fail_times=5)
        SessionTest.poll(self, sessions.SessionWatcher(FakePipeline(vlm=vlm)))
        self.assertTrue(self.wait(lambda: self.session("s1").get("summary_state") == "ready"))
        self.assertEqual(self.session("s1")["summary"], "No changes were recorded during this session.")

    def test_summary_failure_is_reported(self):
        push_commit.push_change("p", scene_frame(MOTOR), scene_frame(MOTOR, SERVO), FakeVLM(LABELS))
        self.sb.db.setdefault("capture_sessions", []).append(
            {"id": "s1", "project_id": "p", "status": "stop_requested", "created_at": "0000"})
        SessionTest.poll(self, sessions.SessionWatcher(FakePipeline(vlm=FakeVLM(LABELS, fail_times=1))))
        self.assertTrue(self.wait(lambda: self.session("s1").get("summary_state") == "failed"))
        self.assertIn("timeout", self.session("s1")["summary"])

    def test_recording_works_without_migration_004(self):
        self.sb.columns["capture_sessions"] = {"status"}
        SessionTest.add(self, "s1", "p", "requested")
        pipe = FakePipeline()
        w = sessions.SessionWatcher(pipe)
        SessionTest.poll(self, w)
        self.session("s1")["status"] = "stop_requested"
        SessionTest.poll(self, w)
        self.assertEqual((self.session("s1")["status"], pipe.project_id), ("stopped", None))
        time.sleep(0.2)
        self.assertNotIn("summary_state", self.session("s1"))

    def test_questions_are_answered_once(self):
        vlm = FakeVLM(LABELS)
        push_commit.push_change("p", scene_frame(MOTOR), scene_frame(MOTOR, SERVO), vlm)
        self.sb.db["project_questions"] = [
            {"id": "q1", "project_id": "p", "question": "When was the servo added?", "state": "pending", "created_at": _iso()}]
        w = sessions.SessionWatcher(FakePipeline(vlm=vlm))
        for _ in range(3):
            w._poll_questions()
        q = self.sb.db["project_questions"][0]
        self.assertTrue(self.wait(lambda: q["state"] == "answered"))
        self.assertTrue(q["answer"].startswith("AI:") and q["answered_at"])
        asked = [p for p in vlm.prompts if "When was the servo added?" in p]
        self.assertEqual(len(asked), 1, "answered exactly once despite repeated polls")
        self.assertIn("#1", asked[0])

    def test_question_failure_is_reported(self):
        self.sb.db["project_questions"] = [
            {"id": "q1", "project_id": "p", "question": "?", "state": "pending", "created_at": _iso()}]
        sessions.SessionWatcher(FakePipeline(vlm=FakeVLM(LABELS, fail_times=1)))._poll_questions()
        q = self.sb.db["project_questions"][0]
        self.assertTrue(self.wait(lambda: q["state"] == "failed"))

    def test_missing_questions_table_backs_off(self):
        w = sessions.SessionWatcher(FakePipeline())
        self.sb.fail_on["select project_questions"] = 1
        orig = store.pending_questions
        store.pending_questions = lambda: (_ for _ in ()).throw(Flaky("PGRST205 table not found"))
        try:
            w._poll_questions()
        finally:
            store.pending_questions = orig
        self.assertGreater(w._questions_retry_at, time.time() + 30)


class PipelineTest(Base):
    def make(self, vlm):
        import pipeline
        p = pipeline.CommitBenchPipeline.__new__(pipeline.CommitBenchPipeline)
        p.vlm, p.project_id, p.last_objects, p.jobs = vlm, "p", None, queue.Queue()
        p.last_commit_id, p.last_changes, p.last_change_time, p.last_frame = None, [], 0, None
        p._pending, p._pending_lock, p.started_at = 0, threading.Lock(), 0
        p.stats = {k: 0 for k in ("frames_seen", "motion_events", "vlm_calls", "commits", "failures")}
        return p

    def test_backlog_is_merged_and_worker_survives_failures(self):
        vlm = FakeVLM(LABELS, fail_times=2)
        p = self.make(vlm)
        f0, f1, f2 = scene_frame(MOTOR), scene_frame(MOTOR, SERVO), scene_frame(MOTOR_RIGHT, SERVO, LED)
        p._describe("p", f0, f1)
        self.assertEqual(p.stats["failures"], 1)
        for job in [("p", f0, f1), ("p", f1, f2), ("p", f2, f2)]:
            p._pending += 1
            p.jobs.put((*job, time.time()))
        self.assertFalse(p.wait_idle(0.01))
        threading.Thread(target=p._work, daemon=True).start()
        deadline = time.time() + 3
        while time.time() < deadline and p.stats["commits"] < 1:
            time.sleep(0.02)
        commits = self.sb.commits("p")
        self.assertEqual([c["processing_state"] for c in commits], ["failed", "described"])
        self.assertEqual(sorted(x["type"] for x in commits[1]["changes"]), ["added", "added", "moved"])
        self.assertEqual(len(p.last_objects), 3)
        self.assertTrue(p.wait_idle(2))
        self.assertEqual(p._pending, 0)

    def test_camera_loop_before_after(self):
        from camera import MotionDetector
        p = self.make(FakeVLM(LABELS))
        p.motion = MotionDetector()
        frames = []
        p.camera = type("Cam", (), {"read_frame": lambda _s: frames.pop(0) if frames else None})()
        a, b, c = scene_frame(), scene_frame(SERVO), scene_frame(LED)
        hand = np.full_like(a, 10)

        def show(scene, with_hand=True):
            for f in ([a, hand] if with_hand else []) + [scene] * 20:
                frames.append(f)
                p._tick()

        show(a, with_hand=False)
        show(b)
        _, before, after, seen_at = p.jobs.get_nowait()
        self.assertTrue((before == a).all() and (after == b).all())
        self.assertAlmostEqual(seen_at, time.time(), delta=2)
        show(b)
        self.assertTrue(p.jobs.empty())
        show(c)
        _, before, after, _ = p.jobs.get_nowait()
        self.assertTrue((before == b).all() and (after == c).all(), "each change starts where the last ended")


class ServerTest(Base):
    def test_endpoints(self):
        import pipeline
        import server
        p = pipeline.get_pipeline()
        client = server.app.test_client()
        self.assertEqual(client.get("/").get_json()["running"], False)
        self.assertEqual(client.get("/api/preview.jpg").status_code, 503)
        self.assertEqual(client.get("/stream.mjpg").status_code, 503)
        p.last_frame = scene_frame(SERVO)
        p.last_changes = [{"type": "added", "name": "Servo", "from": None, "to": dict(zip("xywh", SERVO))}]
        p.last_change_time = time.time()
        r = client.get("/api/preview.jpg")
        self.assertEqual((r.status_code, r.data[:2]), (200, b"\xff\xd8"))
        r = client.get("/stream.mjpg")
        chunk = next(r.response)
        self.assertTrue(chunk.startswith(b"--frame") and b"\xff\xd8" in chunk)
        r.close()
        p.last_frame = None


if __name__ == "__main__":
    unittest.main()

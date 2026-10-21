"""Website -> Jetson requests, all through Supabase (the website never calls the Jetson)."""

import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

import ai
import supabase_store as store

POLL_SECONDS = 1.0
SUMMARY_WAIT_SECONDS = 90


class SessionWatcher:
    def __init__(self, pipeline):
        self.pipeline = pipeline
        self.session = None
        self.thread = None
        self.ai_pool = ThreadPoolExecutor(max_workers=3)
        self._in_flight = set()
        self._in_flight_lock = threading.Lock()
        self._questions_retry_at = 0
        self._stopped = threading.Event()

    def start(self):
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        print("[Sessions] Watching for Start/Stop requests and questions.")

    def stop(self):
        self._stopped.set()

    def _recover(self):
        for s in store.sessions_with_status("recording"):
            if store.set_session_status(s["id"], "stopped", "recording"):
                print(f"[Sessions] Reset stale session {s['id']} to stopped.")
                self._summarize_later(s)

    def _loop(self):
        recovered = False
        while not self._stopped.is_set():
            try:
                if not recovered:
                    self._recover()
                    recovered = True
                for s in store.pending_sessions():
                    if s["status"] == "requested":
                        self._start(s)
                    else:
                        self._stop(s)
            except Exception as e:
                print(f"[Sessions] Loop error (will retry): {e}")
            self._poll_questions()
            time.sleep(POLL_SECONDS)


    def _start(self, s):
        if self.session and self.session["id"] != s["id"]:
            print(f"[Sessions] Stopping {self.session['id']} to start {s['id']}.")
            self.pipeline.stop()
            if store.set_session_status(self.session["id"], "stopped", "recording"):
                self._summarize_later(self.session)
            self.session = None
        try:
            self.pipeline.start(s["project_id"])
        except Exception as e:
            traceback.print_exc()
            print(f"[Sessions] Start failed: {e}")
            store.set_session_status(s["id"], "stopped", "requested")
            return
        self.session = s
        store.set_session_status(s["id"], "recording", "requested")

    def _stop(self, s):
        try:
            if self.session is None or self.session["id"] == s["id"]:
                self.pipeline.stop()
                self.session = None
        finally:
            if store.set_session_status(s["id"], "stopped", "stop_requested"):
                self._summarize_later(s)


    def _summarize_later(self, s):
        self.ai_pool.submit(self._summarize, s)

    def _summarize(self, s):
        try:
            store.update_session(s["id"], summary_state="pending")
        except Exception as e:
            print(f"[Summary] Skipped (run migration 004 for session summaries): {e}")
            return
        try:
            self.pipeline.wait_idle(SUMMARY_WAIT_SECONDS)
            row = store.get_session(s["id"]) or s
            stopped_at = row.get("stopped_at")
            commits = store.commits_between(s["project_id"], s["created_at"], stopped_at)
            names = store.usernames([c.get("author_id") for c in commits])
            summary = ai.summarize_session(self.pipeline.vlm, commits, names, s["created_at"], stopped_at)
            store.update_session(s["id"], summary=summary, summary_state="ready", change_count=len(commits))
            print(f"[Summary] Session {s['id']}: {summary}")
        except Exception as e:
            traceback.print_exc()
            try:
                store.update_session(s["id"], summary=f"Couldn't summarize this session: {e}"[:300],
                                     summary_state="failed")
            except Exception:
                pass


    def _poll_questions(self):
        if time.time() < self._questions_retry_at:
            return
        try:
            questions = store.pending_questions()
        except Exception as e:
            if "PGRST205" in str(e):
                print("[Questions] Waiting for supabase/migrations/004 (questions table missing).")
                self._questions_retry_at = time.time() + 60
            else:
                print(f"[Questions] Poll error (will retry): {e}")
            return
        for q in questions:
            with self._in_flight_lock:
                if q["id"] in self._in_flight:
                    continue
                self._in_flight.add(q["id"])
            self.ai_pool.submit(self._answer, q)

    def _answer(self, q):
        try:
            history = store.project_history(q["project_id"])
            names = store.usernames([c.get("author_id") for c in history["commits"]]
                                    + [s.get("started_by") for s in history["sessions"]])
            answer = ai.answer_question(self.pipeline.vlm, q["question"], history, names)
            store.answer_question(q["id"], answer)
            print(f"[Questions] {q['question']!r} -> {answer}")
        except Exception as e:
            traceback.print_exc()
            try:
                store.answer_question(q["id"], f"Couldn't answer right now: {e}"[:300], state="failed")
            except Exception:
                pass
        finally:
            with self._in_flight_lock:
                self._in_flight.discard(q["id"])

"""Pre-demo smoke test against the REAL services."""

import os
import sys
import time
import traceback
from pathlib import Path

import cv2
from dotenv import load_dotenv

load_dotenv()
ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name):
    def wrap(fn):
        t = time.time()
        try:
            detail = fn() or ""
            results.append(True)
            print(f"  PASS  {name} ({time.time() - t:.1f}s) {detail}")
        except Exception as e:
            results.append(False)
            print(f"  FAIL  {name}: {e}")
            if os.environ.get("SMOKE_DEBUG"):
                traceback.print_exc()
    return wrap


def main(project_id, keep):
    import supabase_store as store
    from push_commit import create_pending_commit
    from vlm import PerceptronClient

    print("CommitBench smoke test")

    @check(".env has every key")
    def _():
        missing = [k for k in ("PERCEPTRON_API_KEY", "SUPABASE_SECRET_KEY") if not os.environ.get(k)]
        if not (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")):
            missing.append("SUPABASE_URL")
        if missing:
            raise RuntimeError(f"missing {', '.join(missing)}")

    @check("Supabase tables reachable")
    def _():
        sb = store.get_client()
        for t in ("projects", "commits", "frames", "capture_sessions"):
            try:
                sb.table(t).select("*").limit(1).execute()
            except Exception as e:
                hint = " -> run supabase/migrations/003_capture_sessions.sql" if t == "capture_sessions" else ""
                raise RuntimeError(f"table {t}: {e}{hint}")

    @check("migration 004 (session summaries + questions)")
    def _():
        sb = store.get_client()
        try:
            sb.table("capture_sessions").select("summary,summary_state,stopped_at,change_count").limit(1).execute()
            sb.table("project_questions").select("id").limit(1).execute()
        except Exception as e:
            raise RuntimeError(f"{e} -> run supabase/migrations/004_session_summaries_and_questions.sql")

    @check("project exists")
    def _():
        rows = store.get_client().table("projects").select("name").eq("id", project_id).execute().data
        if not rows:
            raise RuntimeError(f"no project with id {project_id} (copy it from Project settings)")
        return f"'{rows[0]['name']}'"

    @check("capture_sessions allows only one active session per project")
    def _():
        sb = store.get_client()
        active = sb.table("capture_sessions").select("id").eq("project_id", project_id) \
            .in_("status", store.ACTIVE_STATUSES).execute().data
        if active:
            return "skipped: a session is active right now"
        first = sb.table("capture_sessions").insert({"project_id": project_id}).execute().data[0]
        try:
            try:
                second = sb.table("capture_sessions").insert({"project_id": project_id}).execute().data[0]
                sb.table("capture_sessions").delete().eq("id", second["id"]).execute()
                raise RuntimeError("a second active session was allowed -> run migration 003")
            except RuntimeError:
                raise
            except Exception as e:
                if "23505" not in str(e):
                    raise
        finally:
            sb.table("capture_sessions").delete().eq("id", first["id"]).execute()

    @check("Perceptron answers with boxes")
    def _():
        img = cv2.imread(str(ROOT / "frontend/scripts/demo-photos/bench-before.png"))
        comps = PerceptronClient().analyze_scene(img)["components"]
        if not comps or not all("x" in c for c in comps):
            raise RuntimeError(f"unexpected answer: {comps[:2]}")
        return f"{len(comps)} parts"

    @check("Perceptron answers a question about this project")
    def _():
        import ai
        from vlm import VLMRouter
        history = store.project_history(project_id)
        names = store.usernames([c.get("author_id") for c in history["commits"]])
        answer = ai.answer_question(VLMRouter(), "In one sentence, what has happened in this project so far?", history, names)
        return f"({len(history['commits'])} changes) {answer[:100]}"

    @check("camera delivers frames")
    def _():
        from camera import CameraCapture
        cam = CameraCapture()
        try:
            deadline = time.time() + 5
            while time.time() < deadline:
                f = cam.read_frame()
                if f is not None:
                    return f"{f.shape[1]}x{f.shape[0]}"
                time.sleep(0.05)
            raise RuntimeError("no frame within 5s")
        finally:
            cam.release()

    @check("full change: pending -> photos -> described")
    def _():
        demo = ROOT / "frontend/scripts/demo-photos"
        commit_id = create_pending_commit(project_id, demo / "bench-before.png", demo / "bench-after.png")
        if commit_id is None:
            raise RuntimeError("Mk1 found no change between the demo photos")
        sb = store.get_client()
        try:
            c = sb.table("commits").select("*").eq("id", commit_id).execute().data[0]
            frames = sb.table("frames").select("kind,storage_path").eq("commit_id", commit_id).execute().data
            if c["processing_state"] != "described":
                raise RuntimeError(f"state is {c['processing_state']}: {c['mk1_summary']}")
            if sorted(f["kind"] for f in frames) != ["after", "before"]:
                raise RuntimeError(f"frames rows: {frames}")
            signed = sb.storage.from_(store.BUCKET).create_signed_url(frames[0]["storage_path"], 60)
            if not (signed.get("signedURL") or signed.get("signedUrl")):
                raise RuntimeError(f"photo not downloadable: {signed}")
            return f"#{c['seq']}: {c['mk1_summary']}"
        finally:
            if not keep:
                store.delete_commit(project_id, commit_id)

    ok = all(results)
    print(f"\n{'ALL CHECKS PASSED' if ok else 'SOME CHECKS FAILED'} ({sum(results)}/{len(results)})")
    return ok


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        sys.exit(2)
    sys.exit(0 if main(args[0], "--keep" in sys.argv) else 1)

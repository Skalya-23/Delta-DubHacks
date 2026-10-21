"""Supabase storage for changes ("commits") and recording sessions."""

import os
import threading
import time
import uuid
from datetime import datetime, timezone

import cv2
import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

BUCKET = "frames"
ACTIVE_STATUSES = ["requested", "recording", "stop_requested"]
RETRY_ATTEMPTS = 4

_client = None
_client_lock = threading.Lock()


def get_client():
    global _client
    with _client_lock:
        if _client is None:
            url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
            key = os.environ.get("SUPABASE_SECRET_KEY")
            if not url or not key:
                raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.example)")
            _client = create_client(url.rstrip("/"), key)
        return _client


_TRANSIENT_MARKERS = ("Server disconnected", "ConnectionTerminated", "Connection reset", "timed out",
                      "RemoteProtocolError", "EOF occurred", "502 Bad Gateway", "503 Service", "504 Gateway")


def _is_transient(e):
    return isinstance(e, (httpx.TransportError, ConnectionError, TimeoutError)) or any(
        m in f"{type(e).__name__} {e}" for m in _TRANSIENT_MARKERS)


def _is_duplicate(e):
    return "23505" in str(e) or "Duplicate" in str(e) or "already exists" in str(e)


def _run(call, attempts=RETRY_ATTEMPTS):
    """Run a Supabase call, retrying dropped connections with backoff (0.3s, 0.6s, 1.2s)."""
    for attempt in range(attempts):
        try:
            return call()
        except Exception as e:
            if attempt == attempts - 1 or not _is_transient(e):
                raise
            print(f"[Supabase] {type(e).__name__}: {e} (retry {attempt + 1}/{attempts - 1})")
            time.sleep(0.3 * 2 ** attempt)


def _execute(builder):
    return _run(builder.execute)


def _insert_once(table, row):
    """Insert a row with a client-generated id; a retry after a lost response is a no-op, not a duplicate."""
    try:
        return _execute(get_client().table(table).insert(row))
    except Exception as e:
        if not _is_duplicate(e):
            raise


def _now():
    return datetime.now(timezone.utc).isoformat()


def create_pending_commit(project_id, captured_at=None):
    """Insert a 'pending' change; the website shows a Processing card right away."""
    row = {"id": str(uuid.uuid4()), "project_id": project_id, "processing_state": "pending"}
    if captured_at:
        row["captured_at"] = datetime.fromtimestamp(captured_at, timezone.utc).isoformat()
    _insert_once("commits", row)
    return row["id"]


def frame_path(project_id, commit_id, kind, index=0):
    return f"{project_id}/{commit_id}/{kind}_{index}.jpg"


def upload_frame(project_id, commit_id, kind, frame, index=0):
    """Upload one BGR frame as JPEG and add its 'frames' row."""
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    path = frame_path(project_id, commit_id, kind, index)
    data = buf.tobytes()
    _run(lambda: get_client().storage.from_(BUCKET).upload(
        path, data, {"content-type": "image/jpeg", "upsert": "true"}))
    h, w = frame.shape[:2]
    _insert_once("frames", {
        "id": str(uuid.uuid4()),
        "commit_id": commit_id,
        "project_id": project_id,
        "kind": kind,
        "frame_index": index,
        "storage_path": path,
        "width": w,
        "height": h,
    })
    return path


def mark_described(commit_id, summary, objects_before, objects_after, changes):
    _execute(get_client().table("commits").update({
        "mk1_summary": summary,
        "objects_before": objects_before,
        "objects_after": objects_after,
        "changes": changes,
        "processing_state": "described",
    }).eq("id", commit_id))


def mark_failed(commit_id, reason):
    _execute(get_client().table("commits").update({
        "mk1_summary": reason[:300],
        "processing_state": "failed",
    }).eq("id", commit_id))


def delete_commit(project_id, commit_id):
    """Remove a change and its photos (used when nothing actually changed)."""
    bucket = get_client().storage.from_(BUCKET)
    files = _run(lambda: bucket.list(f"{project_id}/{commit_id}"))
    paths = [f"{project_id}/{commit_id}/{f['name']}" for f in files or []]
    if paths:
        _run(lambda: bucket.remove(paths))
    _execute(get_client().table("commits").delete().eq("id", commit_id))


def last_objects(project_id):
    """objects_after of the project's newest described change, or None if there isn't one."""
    res = _execute(get_client().table("commits")
                   .select("objects_after")
                   .eq("project_id", project_id)
                   .eq("processing_state", "described")
                   .order("seq", desc=True)
                   .limit(1))
    return res.data[0]["objects_after"] if res.data else None


def pending_sessions():
    """Sessions waiting on the Jetson: 'requested' (start) or 'stop_requested' (stop), oldest first."""
    return _execute(get_client().table("capture_sessions")
                    .select("*")
                    .in_("status", ["requested", "stop_requested"])
                    .order("created_at")).data


def sessions_with_status(status):
    return _execute(get_client().table("capture_sessions").select("*").eq("status", status)).data


def set_session_status(session_id, new, expected, **fields):
    """Move a session only if it's still in the state we expect, so we never overwrite a newer state."""
    update = {"status": new, **fields}
    if new == "stopped":
        update["stopped_at"] = _now()

    def move(values):
        return _execute(get_client().table("capture_sessions").update(values)
                        .eq("id", session_id).eq("status", expected))

    try:
        res = move(update)
    except Exception as e:
        if "PGRST204" not in str(e) or update.keys() == {"status"}:
            raise
        res = move({"status": new})
    return bool(res.data)


def update_session(session_id, **fields):
    _execute(get_client().table("capture_sessions").update(fields).eq("id", session_id))


def get_session(session_id):
    res = _execute(get_client().table("capture_sessions").select("*").eq("id", session_id))
    return res.data[0] if res.data else None


def commits_between(project_id, since, until=None):
    """Described, visible changes captured in [since, until], oldest first."""
    q = (get_client().table("commits")
         .select("seq,author_id,captured_at,title,mk1_summary,changes,status,user_description")
         .eq("project_id", project_id)
         .eq("processing_state", "described")
         .eq("is_hidden", False)
         .gte("captured_at", since))
    if until:
        q = q.lte("captured_at", until)
    return _execute(q.order("seq")).data


def project_history(project_id, limit=200):
    """Everything the AI needs to answer questions about a project."""
    sb = get_client()
    project = _execute(sb.table("projects").select("name,description").eq("id", project_id)).data
    commits = _execute(sb.table("commits")
                       .select("id,seq,author_id,captured_at,title,mk1_summary,changes,status,user_description")
                       .eq("project_id", project_id)
                       .eq("processing_state", "described")
                       .eq("is_hidden", False)
                       .order("seq", desc=True)
                       .limit(limit)).data[::-1]
    checkpoints = _execute(sb.table("checkpoints").select("name,description,commit_id").eq("project_id", project_id)).data
    sessions = _execute(sb.table("capture_sessions")
                        .select("created_at,stopped_at,started_by,summary")
                        .eq("project_id", project_id)
                        .eq("summary_state", "ready")
                        .order("created_at", desc=True)
                        .limit(20)).data[::-1]
    return {"project": project[0] if project else {}, "commits": commits,
            "checkpoints": checkpoints, "sessions": sessions}


def usernames(user_ids):
    ids = sorted({u for u in user_ids if u})
    if not ids:
        return {}
    rows = _execute(get_client().table("profiles").select("id,username,display_name").in_("id", ids)).data
    return {r["id"]: r.get("display_name") or r["username"] for r in rows}


def pending_questions():
    return _execute(get_client().table("project_questions")
                    .select("*")
                    .eq("state", "pending")
                    .order("created_at")
                    .limit(20)).data


def answer_question(question_id, answer, state="answered"):
    _execute(get_client().table("project_questions").update({
        "answer": answer[:4000],
        "state": state,
        "answered_at": _now(),
    }).eq("id", question_id).eq("state", "pending"))

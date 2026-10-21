# Shared database (Supabase)

This is the contract between the **backend** (Jetson camera + Perceptron Mk1) and the **frontend** (website). The backend writes rows here; the website reads them live. **Don't rename tables, columns or JSON fields without telling the other side.**

- [`schema.sql`](schema.sql): run once in the Supabase SQL Editor on a fresh project. Creates all tables, triggers, Row Level Security, the private `frames` storage bucket, and realtime.
- [`migrations/`](migrations): incremental updates for databases created from an older `schema.sql` (e.g. `002_invites.sql` adds invite links, `003_capture_sessions.sql` adds recording sessions, `004_session_summaries_and_questions.sql` adds session summaries and questions). `schema.sql` already includes them.

> If your project's `capture_sessions` table was created by hand in the dashboard, run [`migrations/003_capture_sessions.sql`](migrations/003_capture_sessions.sql) once anyway: it's idempotent and adds the one-active-session index, RLS policies and realtime the website relies on.

## Recording sessions (`capture_sessions`)

The website never calls the Jetson directly. When someone clicks **Start recording** on a project page, the website inserts a row; the Jetson watches the table and reacts.

Columns: `id`, `project_id`, `status`, `started_by` (defaults to the signed-in user), `created_at`. Realtime is on; RLS limits rows to project members (the Jetson's secret key bypasses RLS).

| Status | Set by | Meaning | Website shows |
| --- | --- | --- | --- |
| `requested` | website (inserts a row with just `project_id`) | please start | "Starting…" (after 10 s: "the Jetson may be offline") |
| `recording` | **Jetson**, *after* the camera has actually started | capturing | ● Recording + **Stop recording** |
| `stop_requested` | website | please stop | "Stopping…" |
| `stopped` | **Jetson**, *after* the camera has actually stopped | done | **Start recording** |

Rules for the Jetson:
- **Only change the status after the camera has actually started or stopped.** The website's button follows the status you set, not the click.
- **If starting fails, set the row to `stopped`** so the button goes back to "Start recording" (otherwise it's stuck on "Starting…").
- **On boot, check for rows still at `recording`.** Either resume capturing for them or set them to `stopped`, so the website doesn't show "Recording" forever.
- Only update a row if it's still in the state you expect (`.eq("status", expected)`), so you never overwrite a newer state.
- **Only one active session** (`requested`, `recording` or `stop_requested`) can exist per project; the database rejects a second one (error `23505`, which the website handles by showing the existing session).
- Use the session's `project_id` for every change you upload while recording.

The backend implements this in [`backend/sessions.py`](../backend/sessions.py). Reference loop (Python, `pip install supabase python-dotenv`; polls once a second):

```python
import os, time
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

def set_status(session_id, new, expected):
    # Only move the row if it's still in the state we expect (never overwrite a newer state).
    sb.table("capture_sessions").update({"status": new}).eq("id", session_id).eq("status", expected).execute()

# On boot: don't leave a session stuck on "Recording".
for s in sb.table("capture_sessions").select("*").eq("status", "recording").execute().data:
    set_status(s["id"], "stopped", "recording")   # or resume capturing for s["project_id"] instead

while True:
    try:
        rows = (sb.table("capture_sessions").select("*")
                .in_("status", ["requested", "stop_requested"])
                .order("created_at").execute().data)
        for s in rows:
            if s["status"] == "requested":
                try:
                    start_capture(s["project_id"])          # camera code
                    set_status(s["id"], "recording", "requested")
                except Exception as e:
                    print("start failed:", e)
                    set_status(s["id"], "stopped", "requested")
            else:  # stop_requested
                try:
                    stop_capture()                          # camera code
                finally:
                    set_status(s["id"], "stopped", "stop_requested")
    except Exception as e:
        print("loop error (will retry):", e)                # e.g. a Wi-Fi blip; keep going
    time.sleep(1)
```

This reacts to Start on *any* project, which is fine with one Jetson. With more than one bench, filter each Jetson's query with `.eq("project_id", MY_PROJECT_ID)`.

**Testing without the website:** in Supabase → Table Editor → `capture_sessions`, add a row with a `project_id` and `status = requested`; the Jetson should start and flip it to `recording`. Edit it to `stop_requested`; it should stop and flip it to `stopped`. With the project page open, the button follows along live.

## Session summaries (migration 004)

When the Jetson sets a session to `stopped` it also sets `stopped_at`, then fills in:

| Column | Meaning |
| --- | --- |
| `summary_state` | `pending` while Perceptron writes it, then `ready` or `failed` |
| `summary` | 2-4 sentence recap of the session's changes and who made them (or the failure reason) |
| `change_count` | number of changes captured during the session |

The website shows the latest ones on the Timeline ("Work sessions").

## Questions (`project_questions`, migration 004)

The website inserts `{ project_id, question }` (`state = 'pending'`, `asked_by` defaults to the signed-in user). The Jetson answers from the project's change history and sets `answer`, `answered_at` and `state = 'answered'` (or `'failed'` with a reason in `answer`). Members can read and ask; only the secret key writes answers. Realtime is on.

## What the backend writes

The backend connects with the **secret key** (`SUPABASE_SECRET_KEY`, bypasses RLS). Never put that key in the frontend. The website calls a `commits` row a "change".

### Steps per change

1. **Insert the commit:** a `commits` row with `project_id` and `processing_state = 'pending'`; keep the returned `id`. The website immediately shows a "Processing" card.
2. **Upload the photos** to the `frames` bucket (paths below, content type `image/jpeg`).
3. **Insert one `frames` row per photo:** `commit_id`, `project_id`, `kind`, `frame_index`, `storage_path`, optionally `width` / `height`.
4. **When Mk1 answers, update the commit** with `mk1_summary` (one sentence), `objects_before`, `objects_after`, `changes`, and `processing_state = 'described'`. The website loads the photos (via signed URLs; the bucket is private) and fills in the card live.
5. **If anything fails,** set `processing_state = 'failed'` with a short reason in `mk1_summary`. The card shows as failed with that reason.

Don't set `seq` or `author_id`: the database numbers the change (1, 2, 3… per project) and, if `author_id` is null, credits whoever is marked "Who's building" on the website.

### Object (one detected part)

Coordinates are normalized **0 to 1** relative to the image; `x, y` is the **top-left** corner. Name parts the same way in the before and after photos ("Red wire" both times), since that's how parts are matched.

```json
{ "id": "obj_1", "name": "DC motor", "x": 0.12, "y": 0.30, "w": 0.10, "h": 0.08 }
```

### Change (one entry in `commits.changes`)

```json
{ "type": "moved", "name": "DC motor",
  "from": { "x": 0.12, "y": 0.30, "w": 0.10, "h": 0.08 },
  "to":   { "x": 0.45, "y": 0.32, "w": 0.10, "h": 0.08 },
  "detail": "Moved right" }
```

`type` is `moved`, `added` or `removed`. For `added`, `from` is `null`; for `removed`, `to` is `null`.

How the website computes changes from two object lists (so the backend can match it): match by name (case-insensitive), then by nearest center within 0.15; a pair counts as *moved* if its center moved more than 0.03 or its width/height changed more than 25%. Reference implementation: [`frontend/src/lib/diff.ts`](../frontend/src/lib/diff.ts) (with tests).

### Photos (storage bucket `frames`, private)

```
{project_id}/{commit_id}/before_0.jpg
{project_id}/{commit_id}/sequence_0.jpg, sequence_1.jpg, …   (optional, for the flipbook)
{project_id}/{commit_id}/after_0.jpg
```

Each photo also needs a `frames` row: `commit_id`, `project_id`, `kind` (`before` | `sequence` | `after`), `frame_index`, `storage_path`, and optionally `width` / `height`.

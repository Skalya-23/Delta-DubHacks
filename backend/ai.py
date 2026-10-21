from datetime import datetime

MAX_CHANGES_IN_CONTEXT = 120
STATUS_WORDS = {"working": "marked Works", "broken": "marked Broken", "untested": "not tested"}


def _when(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%b %d %H:%M")
    except (AttributeError, ValueError):
        return "?"


def _change_line(c, names):
    who = names.get(c.get("author_id"), "someone")
    what = c.get("title") or c.get("mk1_summary") or "; ".join(x.get("detail", "") + " " + x.get("name", "")
                                                              for x in c.get("changes") or []) or "a change"
    line = f"#{c['seq']} ({_when(c.get('captured_at'))}, by {who}, {STATUS_WORDS.get(c.get('status'), 'not tested')}): {what}"
    if c.get("user_description"):
        line += f" Note: {c['user_description'].strip()[:200]}"
    return line


def summarize_session(vlm, commits, names, started_at, stopped_at):
    """Plain-text recap of one recording session."""
    if not commits:
        return "No changes were recorded during this session."
    people = sorted({names.get(c.get("author_id"), "someone") for c in commits})
    log = "\n".join(_change_line(c, names) for c in commits[-MAX_CHANGES_IN_CONTEXT:])
    prompt = f"""You are summarizing one work session on an electronics workbench that a camera tracks
like version control. Each line is one detected change.

Session: {_when(started_at)} to {_when(stopped_at)}, {len(commits)} change(s), by {", ".join(people)}.

Changes:
{log}

Write a summary of this session in 2-4 plain sentences (no headings, no bullet points, no markdown).
Say what was built or changed overall, who made the changes, and how the build was left
(mention anything marked Broken or Works). Refer to changes by number like #12 where useful."""
    return vlm.text(prompt, max_tokens=1200)


def answer_question(vlm, question, history, names):
    """Answer a question about the project from its history; says so when the history doesn't cover it."""
    project = history.get("project") or {}
    commits = history.get("commits") or []
    seq_by_id = {c["id"]: c["seq"] for c in commits}
    log = "\n".join(_change_line(c, names) for c in commits[-MAX_CHANGES_IN_CONTEXT:]) or "(no changes yet)"
    checkpoints = "\n".join(
        f"- \"{cp['name']}\" at change #{seq_by_id.get(cp['commit_id'], '?')}"
        + (f": {cp['description'].strip()[:150]}" if cp.get("description") else "")
        for cp in history.get("checkpoints") or []) or "(none)"
    sessions = "\n".join(
        f"- {_when(s['created_at'])}: {s['summary']}" for s in history.get("sessions") or [] if s.get("summary")) or "(none)"
    prompt = f"""You answer questions about a hardware project tracked like version control: a camera above
the workbench records every change (parts added, removed or moved), and the team marks changes
as Works or Broken.

Project: {project.get("name", "this project")}{f" - {project['description']}" if project.get("description") else ""}

Change history (oldest first):
{log}

Checkpoints (named good states):
{checkpoints}

Past work sessions:
{sessions}

Question: {question.strip()}

Answer in 1-4 plain sentences (no markdown headings). Cite change numbers like #7 and people by name
when relevant. If the history doesn't contain the answer, say so briefly instead of guessing."""
    return vlm.text(prompt, max_tokens=1500)

"""Push one change (a before and an after photo) to a Delta project."""

from concurrent.futures import ThreadPoolExecutor

import cv2

from diff import describe_move, describe_region, diff_objects, summarize_changes
from regions import crop_box_for, find_changes, iou, overlaps, presence_direction, side_by_side
from stabilize import stabilize
from vlm import VLMRouter, scene_to_objects
import supabase_store as store

_executor = ThreadPoolExecutor(max_workers=10)
MAX_REGIONS = 4
UNNAMED_MIN_FRACTION = 0.00008  # ~74 px at 720p
UNNAMED_SUMMARY = "Something changed on the bench, but the AI couldn't tell what it was. The changed area is in the photos."


def push_change(project_id, before, after, vlm, previous=None, captured_at=None, evidence=None):
    """Upload a change and have Mk1 describe it."""
    evidence = evidence or find_changes(before, after)
    if not evidence.significant:
        print("[Push] No significant pixel change; not a change.")
        return None, previous, []

    commit_id = None
    uploads = []
    try:
        if previous is None:
            previous = store.last_objects(project_id)
        commit_id = store.create_pending_commit(project_id, captured_at)
        uploads = [_executor.submit(store.upload_frame, project_id, commit_id, kind, frame)
                   for kind, frame in (("before", before), ("after", after))]
        describe_before = _executor.submit(vlm.analyze_scene, before) if previous is None else None

        if evidence.is_global:
            describe_after = _executor.submit(vlm.analyze_scene, after)
            if describe_before:
                previous = scene_to_objects(describe_before.result()[0])
            current = stabilize(previous, scene_to_objects(describe_after.result()[0]), before, after, evidence)
            changes = diff_objects(previous, current)
        else:
            spots = []
            for r in evidence.regions[:MAX_REGIONS]:
                pair = side_by_side(before, after, r, crop_box_for(r, after.shape))
                wider = (lambda r=r: vlm.compare_spot(side_by_side(before, after, r, crop_box_for(r, after.shape, 0.3, 1.5))))
                spots.append((r, presence_direction(before, after, r), _executor.submit(vlm.compare_spot, pair), wider))
            if describe_before:
                previous = scene_to_objects(describe_before.result()[0])
            changes, current = _compare_spots(previous, spots, after.shape)
        print(f"[Push] {len(evidence.regions)} changed spot(s), {len(changes)} part change(s).")
        for u in uploads:
            u.result()

        if not changes:
            min_pixels = UNNAMED_MIN_FRACTION * after.shape[0] * after.shape[1]
            solid = [r for r in evidence.regions if r.pixels >= min_pixels and not r.touches_edge()]
            if evidence.is_global or not solid:
                print("[Push] Nothing named and no solid change away from the edge; not a change.")
                store.delete_commit(project_id, commit_id)
                return None, previous, []
            store.mark_described(commit_id, UNNAMED_SUMMARY, previous, previous, [])
            print(f"[Push] Change {commit_id}: pixels changed, AI couldn't name it.")
            return commit_id, previous, []

        summary = summarize_changes(changes)
        store.mark_described(commit_id, summary, previous, current, changes)
        print(f"[Push] Change {commit_id}: {summary}")
        return commit_id, current, changes
    except Exception as e:
        if commit_id:
            for u in uploads:
                try:
                    u.result(timeout=60)
                except Exception as upload_error:
                    print(f"[Push] Photo upload failed too: {upload_error}")
            try:
                store.mark_failed(commit_id, f"Couldn't describe this change: {e}")
            except Exception as inner:
                print(f"[Push] Also failed to mark the change as failed: {inner}")
        raise


def _pair_moves(changes):
    """A part moved far shows up as 'removed' in one spot and 'added' in another: make it one 'moved'."""
    removed = [c for c in changes if c["type"] == "removed"]
    added = [c for c in changes if c["type"] == "added"]
    paired = []
    for r in removed:
        match = next((a for a in added if a["name"].strip().lower() == r["name"].strip().lower()), None)
        if match:
            added.remove(match)
            paired.append({"type": "moved", "name": match["name"], "from": r["from"], "to": match["to"],
                           "detail": describe_move(r["from"], match["to"])})
    leftover_removed = [r for r in removed if not any(p["from"] is r["from"] for p in paired)]
    return [c for c in changes if c["type"] == "moved"] + paired + leftover_removed + added


def _compare_spots(previous, spots, frame_shape):
    min_pixels = UNNAMED_MIN_FRACTION * frame_shape[0] * frame_shape[1]
    memory = [dict(o) for o in previous]
    changes = []
    def named(answer):
        return [i for i in answer if i.get("label", "").strip()
                and i["label"].strip().lower() not in ("unknown part", "unknown")]

    for region, direction, answer, second_look in spots:
        box = region.box()
        known = named(answer.result())
        if direction and not known:
            try:
                known = named(second_look())
            except Exception as e:
                print(f"[Push] Second look failed: {e}")
        found = []
        if direction:
            names = [i["label"] for i in known if i["type"] == direction] or [i["label"] for i in known]
            if not names and region.pixels >= min_pixels and not region.touches_edge():
                names = ["Unidentified part"]
            found = [(direction, n) for n in dict.fromkeys(names)]
        else:
            found = [(i["type"], i["label"]) for i in known]
        for kind, name in found:
            print(f"[Push]   spot ({region.x:.2f},{region.y:.2f}) {region.pixels}px pixels={direction}: {kind} {name}")
            changes.append(_change(kind, name, box))
            if kind == "added":
                memory.append({"name": name, **box})
            elif kind == "removed":
                gone = max((o for o in memory if overlaps(o, box)), default=None,
                           key=lambda o: (o["name"].lower() == name.lower(), iou(o, box)))
                if gone is not None:
                    memory.remove(gone)
    changes = _pair_moves(changes)
    for i, o in enumerate(memory):
        o["id"] = f"obj_{i + 1}"
    return changes, memory


def _change(kind, name, box):
    if kind == "added":
        return {"type": "added", "name": name, "from": None, "to": box, "detail": f"Added at the {describe_region(box)}"}
    if kind == "removed":
        return {"type": "removed", "name": name, "from": box, "to": None, "detail": f"Removed from the {describe_region(box)}"}
    return {"type": "moved", "name": name, "from": box, "to": box, "detail": "Moved slightly"}


def create_pending_commit(project_id, before_path, after_path):
    """Push a change from two image files."""
    before, after = cv2.imread(str(before_path)), cv2.imread(str(after_path))
    if before is None or after is None:
        raise FileNotFoundError(f"Couldn't read {before_path if before is None else after_path}")
    commit_id, _, _ = push_change(project_id, before, after, VLMRouter())
    return commit_id


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4:
        print("Usage: python backend/push_commit.py <project_id> before.jpg after.jpg")
        sys.exit(1)
    print(create_pending_commit(*sys.argv[1:]))

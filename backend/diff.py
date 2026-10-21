"""Scene diffing: compares two lists of detected objects and extracts the changes."""

import math

MATCH_DISTANCE = 0.15
MOVE_DISTANCE = 0.03
SIZE_CHANGE = 0.25


def center(box):
    return box["x"] + box["w"] / 2, box["y"] + box["h"] / 2


def describe_region(box):
    """Plain location words from a 3x3 grid over the image, e.g."""
    cx, cy = center(box)
    col = "left" if cx < 1 / 3 else "center" if cx < 2 / 3 else "right"
    row = "top" if cy < 1 / 3 else "middle" if cy < 2 / 3 else "bottom"
    if row == "middle" and col == "center":
        return "center"
    if row == "middle":
        return f"middle {col}"
    if col == "center":
        return f"{row} center"
    return f"{row} {col}"


def _to_box(o):
    return {"x": o["x"], "y": o["y"], "w": o["w"], "h": o["h"]}


def _distance(a, b):
    acx, acy = center(a)
    bcx, bcy = center(b)
    return math.hypot(acx - bcx, acy - bcy)


def _size_changed(a, b):
    def rel(p, q):
        return q != 0 if p == 0 else abs(q - p) / p > SIZE_CHANGE
    return rel(a["w"], b["w"]) or rel(a["h"], b["h"])


def describe_move(frm, to):
    """Plain-words direction of a move using the dominant axis, e.g."""
    acx, acy = center(frm)
    bcx, bcy = center(to)
    dx, dy = bcx - acx, bcy - acy
    horiz = "right" if dx > 0 else "left"
    vert = "down" if dy > 0 else "up"
    ax, ay = abs(dx), abs(dy)
    if ax < MOVE_DISTANCE and ay < MOVE_DISTANCE:
        return "Resized"
    if ax >= ay:
        return f"Moved {vert} and {horiz}" if ay > ax * 0.5 and ay >= MOVE_DISTANCE else f"Moved {horiz}"
    return f"Moved {vert} and {horiz}" if ax > ay * 0.5 and ax >= MOVE_DISTANCE else f"Moved {vert}"


def diff_objects(before, after):
    """1."""
    before = before or []
    after = after or []
    used_b, used_a = set(), set()
    pairs = []

    def key(o):
        return o["name"].strip().lower()

    named = [(i, j, _distance(b, a))
             for i, b in enumerate(before)
             for j, a in enumerate(after)
             if key(b) == key(a)]
    named.sort(key=lambda t: t[2])
    for i, j, _ in named:
        if i in used_b or j in used_a:
            continue
        used_b.add(i)
        used_a.add(j)
        pairs.append((i, j))

    near = []
    for i, b in enumerate(before):
        if i in used_b:
            continue
        for j, a in enumerate(after):
            if j in used_a:
                continue
            d = _distance(b, a)
            if d < MATCH_DISTANCE:
                near.append((i, j, d))
    near.sort(key=lambda t: t[2])
    for i, j, _ in near:
        if i in used_b or j in used_a:
            continue
        used_b.add(i)
        used_a.add(j)
        pairs.append((i, j))

    changes = []
    for i, j in pairs:
        b, a = before[i], after[j]
        if _distance(b, a) > MOVE_DISTANCE or _size_changed(b, a):
            changes.append({"type": "moved", "name": a["name"], "from": _to_box(b),
                            "to": _to_box(a), "detail": describe_move(b, a)})
    for i, b in enumerate(before):
        if i not in used_b:
            changes.append({"type": "removed", "name": b["name"], "from": _to_box(b),
                            "to": None, "detail": f"Removed from the {describe_region(b)}"})
    for j, a in enumerate(after):
        if j not in used_a:
            changes.append({"type": "added", "name": a["name"], "from": None,
                            "to": _to_box(a), "detail": f"Added at the {describe_region(a)}"})
    return changes


def summarize_changes(changes):
    """One plain-English sentence for commits.mk1_summary."""
    if not changes:
        return "No changes"
    parts = []
    for c in changes:
        if c["type"] == "added":
            parts.append(f"added {c['name']}")
        elif c["type"] == "removed":
            parts.append(f"removed {c['name']}")
        elif c["detail"] == "Resized":
            parts.append(f"resized {c['name']}")
        else:
            parts.append(f"moved {c['name']} {c['detail'].removeprefix('Moved ')}")
    if len(parts) > 4:
        parts = parts[:4] + [f"{len(changes) - 4} more"]
    sentence = ", ".join(parts[:-1]) + (" and " if len(parts) > 1 else "") + parts[-1]
    return sentence[0].upper() + sentence[1:] + "."

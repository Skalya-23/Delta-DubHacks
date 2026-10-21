"""Cross-check the VLM against the pixels."""

import cv2
import numpy as np

from diff import diff_objects

MIN_CHANGED_FRACTION = 0.03
MAX_GLOBAL_CHANGE = 0.5


def change_mask(before, after):
    """Boolean mask of pixels that differ meaningfully between two frames (after's size)."""
    if before.shape != after.shape:
        before = cv2.resize(before, (after.shape[1], after.shape[0]))
    a = cv2.GaussianBlur(cv2.cvtColor(before, cv2.COLOR_BGR2GRAY), (21, 21), 0)
    b = cv2.GaussianBlur(cv2.cvtColor(after, cv2.COLOR_BGR2GRAY), (21, 21), 0)
    mask = cv2.threshold(cv2.absdiff(a, b), 25, 255, cv2.THRESH_BINARY)[1]
    return cv2.dilate(mask, np.ones((9, 9), np.uint8)) > 0


def _changed_fraction(mask, box):
    h, w = mask.shape
    x1, y1 = int(box["x"] * w), int(box["y"] * h)
    x2, y2 = max(x1 + 1, int((box["x"] + box["w"]) * w)), max(y1 + 1, int((box["y"] + box["h"]) * h))
    region = mask[y1:y2, x1:x2]
    return float(region.mean()) if region.size else 0.0


def _same_box(o, box):
    return box is not None and all(o[k] == box[k] for k in ("x", "y", "w", "h"))


def stabilize(previous, current, before, after, evidence=None):
    """Return `current` with pixel-unsupported changes undone (ids renumbered)."""
    if evidence is not None:
        mask = evidence.mask
        if evidence.is_global:
            return current
    else:
        mask = change_mask(before, after)
        if mask.mean() > MAX_GLOBAL_CHANGE:
            return current

    def real(box):
        return box is not None and _changed_fraction(mask, box) >= MIN_CHANGED_FRACTION

    result = [dict(o) for o in current]
    for c in diff_objects(previous, current):
        if c["type"] == "added" and not real(c["to"]):
            result = [o for o in result if not _same_box(o, c["to"])]
        elif c["type"] == "removed" and not real(c["from"]):
            restored = next(o for o in previous if _same_box(o, c["from"]))
            result.append(dict(restored))
        elif c["type"] == "moved" and not real(c["from"]) and not real(c["to"]):
            for o in result:
                if _same_box(o, c["to"]):
                    o.update({k: c["from"][k] for k in ("x", "y", "w", "h")})
                    break
    for i, o in enumerate(result):
        o["id"] = f"obj_{i + 1}"
    return result

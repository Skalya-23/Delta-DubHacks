"""Where did the bench actually change?"""

import os
from dataclasses import dataclass, field

import cv2
import numpy as np

# ~46 px at 720p. A still camera never produced a noise blob bigger than ~20 px.
MIN_REGION_FRACTION = float(os.environ.get("MIN_CHANGE_PIXELS", 46)) / (1280 * 720)
GLOBAL_CHANGE_FRACTION = 0.5
MERGE_GAP = 0.02
# About an inch at the current camera height.
IGNORE_BORDER_PX = int(os.environ.get("IGNORE_BORDER_PX", 84))


def border_px(frame_shape):
    """Ignored border width in pixels for a frame of this shape."""
    return int(round(IGNORE_BORDER_PX * frame_shape[1] / 1280))


def ignore_border(mask):
    """Zero the ignored border of a 2-D mask in place and return it."""
    b = border_px(mask.shape)
    if b > 0:
        mask[:b, :] = 0
        mask[-b:, :] = 0
        mask[:, :b] = 0
        mask[:, -b:] = 0
    return mask


SHADOW_RATIO_SPREAD = 0.12
SHADOW_RATIO_RANGE = (0.35, 1.8)


@dataclass
class Region:
    x: float
    y: float
    w: float
    h: float
    pixels: int

    def box(self):
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}

    def touches_edge(self, margin=0.01):
        """Runs into the edge of the tracked area (the frame minus the ignored border)."""
        mx, my = margin + IGNORE_BORDER_PX / 1280, margin + IGNORE_BORDER_PX / 720
        return self.x <= mx or self.y <= my or self.x + self.w >= 1 - mx or self.y + self.h >= 1 - my


@dataclass
class ChangeEvidence:
    mask: np.ndarray
    regions: list = field(default_factory=list)
    changed_fraction: float = 0.0

    @property
    def is_global(self):
        return self.changed_fraction > GLOBAL_CHANGE_FRACTION

    @property
    def significant(self):
        return self.is_global or bool(self.regions)


def _smooth(img):
    return cv2.GaussianBlur(img, (5, 5), 0).astype(np.int16)


def find_changes(before, after):
    """Pixel-level change evidence between two frames of a fixed camera."""
    if before.shape != after.shape:
        before = cv2.resize(before, (after.shape[1], after.shape[0]))
    a, b = _smooth(before), _smooth(after)
    gain = (a.reshape(-1, 3).mean(axis=0) + 1) / (b.reshape(-1, 3).mean(axis=0) + 1)
    b = np.clip(np.rint(b * gain.astype(np.float32)), 0, 255).astype(np.int16)
    changed = ignore_border(np.abs(a - b).max(axis=2) > 25)
    ys, xs = np.nonzero(changed)
    ratio = (b[ys, xs].astype(np.float32) + 1) / (a[ys, xs].astype(np.float32) + 1)
    lo, hi = SHADOW_RATIO_RANGE
    shadow = (((ratio.max(axis=1) - ratio.min(axis=1)) < SHADOW_RATIO_SPREAD)
              & (ratio.min(axis=1) > lo) & (ratio.max(axis=1) < hi))
    mask = np.zeros(changed.shape, np.uint8)
    mask[ys[~shadow], xs[~shadow]] = 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    h, w = mask.shape
    gap = max(3, int(MERGE_GAP * w))
    joined = cv2.dilate(mask, np.ones((gap, gap), np.uint8))
    near = cv2.dilate(mask, np.ones((9, 9), np.uint8)) > 0
    bw = border_px(mask.shape)
    tracked = mask[bw:mask.shape[0] - bw, bw:mask.shape[1] - bw] if bw else mask
    evidence = ChangeEvidence(mask=near, changed_fraction=float(tracked.mean()) if tracked.size else 0.0)

    count, labels = cv2.connectedComponents(joined, connectivity=8)
    ys, xs = np.nonzero(mask)
    lab = labels[ys, xs]
    pixels = np.bincount(lab, minlength=count)
    x0, y0 = np.full(count, w), np.full(count, h)
    x1, y1 = np.zeros(count, int), np.zeros(count, int)
    np.minimum.at(x0, lab, xs)
    np.minimum.at(y0, lab, ys)
    np.maximum.at(x1, lab, xs)
    np.maximum.at(y1, lab, ys)
    min_pixels = MIN_REGION_FRACTION * h * w
    for i in range(1, count):
        if pixels[i] >= min_pixels:
            evidence.regions.append(Region(float(x0[i] / w), float(y0[i] / h), float((x1[i] - x0[i] + 1) / w),
                                           float((y1[i] - y0[i] + 1) / h), int(pixels[i])))
    evidence.regions.sort(key=lambda r: r.pixels, reverse=True)
    return evidence


def changed_fraction_in(mask, box):
    h, w = mask.shape
    x1, y1 = int(box["x"] * w), int(box["y"] * h)
    x2, y2 = max(x1 + 1, int((box["x"] + box["w"]) * w)), max(y1 + 1, int((box["y"] + box["h"]) * h))
    region = mask[y1:y2, x1:x2]
    return float(region.mean()) if region.size else 0.0


def iou(a, b):
    """Intersection over union of two normalized boxes."""
    ix = max(0.0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
    iy = max(0.0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
    inter = ix * iy
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union > 0 else 0.0


def overlaps(a, b):
    return (a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"]
            and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"])


def crop_box_for(region, frame_shape, min_side=0.18, pad=0.6):
    h, w = frame_shape[:2]
    side_w = max(region.w * (1 + 2 * pad), min_side * h / w)
    side_h = max(region.h * (1 + 2 * pad), min_side)
    cx, cy = region.x + region.w / 2, region.y + region.h / 2
    x0, y0 = max(0.0, cx - side_w / 2), max(0.0, cy - side_h / 2)
    x1, y1 = min(1.0, cx + side_w / 2), min(1.0, cy + side_h / 2)
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def crop(frame, box, target=896):
    """Cut `box` out of the frame and enlarge it so small parts are big for the model."""
    h, w = frame.shape[:2]
    out = frame[int(box["y"] * h):int((box["y"] + box["h"]) * h), int(box["x"] * w):int((box["x"] + box["w"]) * w)]
    scale = target / max(out.shape[:2])
    if scale > 1:
        out = cv2.resize(out, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    return out


def crop_around(frame, region, min_side=0.18, pad=0.6):
    """crop_box_for + crop."""
    box = crop_box_for(region, frame.shape, min_side, pad)
    return crop(frame, box), box


def grow(box, by):
    """Box enlarged by `by` (fraction of the frame) on every side."""
    return {"x": box["x"] - by, "y": box["y"] - by, "w": box["w"] + 2 * by, "h": box["h"] + 2 * by}


def center_in(obj, box):
    cx, cy = obj["x"] + obj["w"] / 2, obj["y"] + obj["h"] / 2
    return box["x"] <= cx <= box["x"] + box["w"] and box["y"] <= cy <= box["y"] + box["h"]


def to_frame_coords(obj, crop_box):
    """Map an object detected in a crop (normalized to the crop) back to full-frame coordinates."""
    return {**obj,
            "x": round(float(crop_box["x"] + obj["x"] * crop_box["w"]), 4),
            "y": round(float(crop_box["y"] + obj["y"] * crop_box["h"]), 4),
            "w": round(float(obj["w"] * crop_box["w"]), 4),
            "h": round(float(obj["h"] * crop_box["h"]), 4)}


def cut_by_crop_edge(obj, margin=0.02):
    """True when an object (crop-normalized) runs into 2+ crop edges, i.e."""
    edges = [obj["x"] <= margin, obj["y"] <= margin,
             obj["x"] + obj["w"] >= 1 - margin, obj["y"] + obj["h"] >= 1 - margin]
    return sum(edges) >= 2


PRESENCE_RATIO = 1.4
PRESENCE_MIN_GAP = 6


def presence_direction(before, after, region):
    """Did something appear or disappear in this spot?"""
    h, w = after.shape[:2]
    x0, y0 = int(region.x * w), int(region.y * h)
    x1, y1 = int((region.x + region.w) * w) + 1, int((region.y + region.h) * h) + 1
    pad = max(8, int(0.6 * max(x1 - x0, y1 - y0)))
    wx0, wy0, wx1, wy1 = max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)
    b = before[wy0:wy1, wx0:wx1].astype(np.int16)
    a = after[wy0:wy1, wx0:wx1].astype(np.int16)
    changed = (np.abs(cv2.GaussianBlur(a, (3, 3), 0) - cv2.GaussianBlur(b, (3, 3), 0)).max(axis=2) > 25).astype(np.uint8)
    if changed.sum() == 0:
        return None
    near = cv2.dilate(changed, np.ones((7, 7), np.uint8)) > 0
    inside, ring = changed > 0, ~near
    if ring.sum() < 20:
        return None

    def stands_out(img):
        background = np.median(img[ring], axis=0)
        return float(np.abs(img[inside] - background).mean())

    sb, sa = stands_out(b), stands_out(a)
    if sa > PRESENCE_RATIO * sb + PRESENCE_MIN_GAP:
        return "added"
    if sb > PRESENCE_RATIO * sa + PRESENCE_MIN_GAP:
        return "removed"
    return None


def side_by_side(before, after, region, box, side=640):
    """BEFORE | AFTER crops of the same spot, enlarged, with the changed area boxed in green on both."""
    cb, ca = crop(before, box, side), crop(after, box, side)
    h, w = after.shape[:2]
    sx = cb.shape[1] / (box["w"] * w)
    sy = cb.shape[0] / (box["h"] * h)
    x1, y1 = int((region.x - box["x"]) * w * sx), int((region.y - box["y"]) * h * sy)
    x2, y2 = x1 + int(region.w * w * sx), y1 + int(region.h * h * sy)
    for img in (cb, ca):
        cv2.rectangle(img, (x1 - 6, y1 - 6), (x2 + 6, y2 + 6), (0, 255, 0), 2)
    return np.hstack([cb, np.full((cb.shape[0], 12, 3), 255, np.uint8), ca])

"""Run: python backend/test_stabilize.py"""

import unittest

import numpy as np

from diff import diff_objects
from stabilize import stabilize


def obj(name, x, y, w=0.1, h=0.1):
    return {"id": "", "name": name, "x": x, "y": y, "w": w, "h": h}


def frame():
    return np.full((200, 400, 3), 120, np.uint8)


def paint(img, box, value=250):
    h, w = img.shape[:2]
    img[int(box["y"] * h):int((box["y"] + box["h"]) * h), int(box["x"] * w):int((box["x"] + box["w"]) * w)] = value
    return img


class StabilizeTest(unittest.TestCase):
    def test_jitter_and_renames_in_still_regions_are_undone(self):
        prev = [obj("DC motor", 0.1, 0.1), obj("Servo", 0.6, 0.6)]
        cur = [obj("motor", 0.15, 0.12, 0.13), obj("Servo", 0.6, 0.6)]
        img = frame()
        self.assertEqual(diff_objects(prev, stabilize(prev, cur, img, img.copy())), [])

    def test_dropped_part_is_restored(self):
        prev = [obj("DC motor", 0.1, 0.1), obj("Servo", 0.6, 0.6)]
        img = frame()
        out = stabilize(prev, [obj("Servo", 0.6, 0.6)], img, img.copy())
        self.assertEqual(sorted(o["name"] for o in out), ["DC motor", "Servo"])

    def test_hallucinated_part_is_dropped(self):
        prev = [obj("Servo", 0.6, 0.6)]
        img = frame()
        out = stabilize(prev, [obj("Servo", 0.6, 0.6), obj("LED", 0.2, 0.2)], img, img.copy())
        self.assertEqual([o["name"] for o in out], ["Servo"])

    def test_real_changes_are_kept(self):
        prev = [obj("DC motor", 0.1, 0.1), obj("Servo", 0.6, 0.6)]
        cur = [obj("DC motor", 0.4, 0.1), obj("Servo", 0.6, 0.6), obj("LED", 0.8, 0.2)]
        before = paint(frame(), prev[0])
        after = paint(paint(frame(), cur[0]), cur[2])
        changes = diff_objects(prev, stabilize(prev, cur, before, after))
        self.assertEqual(sorted((c["type"], c["name"]) for c in changes), [("added", "LED"), ("moved", "DC motor")])

    def test_trusts_vlm_when_whole_frame_changed(self):
        prev = [obj("Servo", 0.6, 0.6)]
        cur = [obj("Servo", 0.6, 0.6), obj("LED", 0.2, 0.2)]
        out = stabilize(prev, cur, frame(), np.full((200, 400, 3), 10, np.uint8))
        self.assertEqual(len(out), 2)

    def test_ids_are_unique(self):
        prev = [obj("A", 0.1, 0.1), obj("B", 0.5, 0.5)]
        img = frame()
        out = stabilize(prev, [obj("B", 0.5, 0.5)], img, img.copy())
        self.assertEqual(sorted(o["id"] for o in out), ["obj_1", "obj_2"])


if __name__ == "__main__":
    unittest.main()

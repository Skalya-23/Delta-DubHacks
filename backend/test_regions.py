"""Pixel change evidence and zoomed re-checks."""

import unittest

import numpy as np

import push_commit
import supabase_store as store
from regions import crop_around, find_changes, to_frame_coords
from test_integration import FakeSupabase

H, W = 720, 1280


def desk(seed=0):
    rng = np.random.default_rng(seed)
    img = np.full((H, W, 3), 170, np.uint8)
    img += rng.integers(0, 3, img.shape, dtype=np.uint8)
    return img


def put(img, x, y, w, h, color=(40, 40, 200)):
    out = img.copy()
    out[y:y + h, x:x + w] = color
    return out


class FindChangesTest(unittest.TestCase):
    def test_identical_is_not_a_change(self):
        a = desk()
        self.assertFalse(find_changes(a, a.copy()).significant)

    def test_exposure_drift_is_not_a_change(self):
        a = desk()
        b = np.clip(a.astype(int) + 12, 0, 255).astype(np.uint8)
        self.assertFalse(find_changes(a, b).significant)

    def test_resistor_sized_part_is_a_change(self):
        a = desk()
        ev = find_changes(a, put(a, 600, 300, 60, 15))
        self.assertTrue(ev.significant and not ev.is_global)
        self.assertEqual(len(ev.regions), 1)
        r = ev.regions[0]
        self.assertAlmostEqual(r.x, 600 / W, delta=0.01)
        self.assertAlmostEqual(r.y, 300 / H, delta=0.01)

    def test_specks_are_not_a_change(self):
        a = desk()
        self.assertFalse(find_changes(a, put(a, 100, 100, 5, 5)).significant)

    def test_separate_and_merged_regions(self):
        a = desk()
        far = put(put(a, 100, 100, 60, 20), 1000, 600, 60, 20)
        self.assertEqual(len(find_changes(a, far).regions), 2)
        near = put(put(a, 500, 300, 60, 20), 570, 300, 60, 20)
        self.assertEqual(len(find_changes(a, near).regions), 1)

    def test_lights_dimming_is_not_a_change(self):
        a = put(desk(), 600, 300, 60, 15)
        b = (a.astype(int) * 0.8).astype(np.uint8)
        self.assertFalse(find_changes(a, b).significant)

    def test_one_inch_border_is_ignored(self):
        a = desk()
        for x, y in [(10, 300), (1200, 300), (600, 10), (600, 650)]:
            self.assertFalse(find_changes(a, put(a, x, y, 60, 15)).significant, (x, y))
        inside = find_changes(a, put(a, 88, 100, 60, 15))
        self.assertTrue(inside.significant)
        self.assertTrue(inside.regions[0].touches_edge(), "a spot at the tracked area's edge counts as 'at the edge'")

    def test_shadow_is_not_a_change(self):
        a = put(desk(), 600, 300, 60, 15)
        b = a.copy()
        b[0:300, 200:900] = (b[0:300, 200:900] * 0.6).astype(np.uint8)
        self.assertFalse(find_changes(a, b).significant)

    def test_black_wire_in_shadow_area_is_still_a_change(self):
        a = desk()
        b = a.copy()
        b[0:300, 200:900] = (b[0:300, 200:900] * 0.6).astype(np.uint8)
        b = put(b, 400, 150, 140, 5, color=(30, 30, 30))
        ev = find_changes(a, b)
        self.assertTrue(ev.significant)
        self.assertAlmostEqual(ev.regions[0].x, 400 / W, delta=0.01)

    def test_bumped_camera_is_global(self):
        rng = np.random.default_rng(1)
        a = desk()
        for _ in range(400):
            x, y = rng.integers(0, W - 40), rng.integers(0, H - 40)
            a = put(a, x, y, 40, 40, tuple(int(v) for v in rng.integers(0, 255, 3)))
        self.assertTrue(find_changes(a, np.roll(a, 25, axis=1)).is_global)

    def test_same_brightness_different_colour_is_a_change(self):
        a = desk()
        b = put(a, 700, 200, 60, 15, color=(200, 200, 30))
        self.assertTrue(find_changes(a, b).significant)

    def test_crop_mapping_roundtrip(self):
        a = put(desk(), 600, 300, 60, 15)
        r = find_changes(desk(), a).regions[0]
        crop, box = crop_around(a, r)
        self.assertGreaterEqual(max(crop.shape[:2]), 896)
        inner = {"x": (r.x - box["x"]) / box["w"], "y": (r.y - box["y"]) / box["h"], "w": r.w / box["w"], "h": r.h / box["h"]}
        back = to_frame_coords(inner, box)
        self.assertAlmostEqual(back["x"], r.x, places=3)
        self.assertAlmostEqual(back["w"], r.w, places=3)


class ZoomVLM:
    """Full frame: sees only the breadboard (misses the small resistor)."""
    def __init__(self):
        self.calls = []

    def analyze_scene(self, frame):
        h, w = frame.shape[:2]
        self.calls.append((w, h))
        board = {"type": "breadboard", "label": "breadboard", "position": "", "x": 0.05, "y": 0.6, "w": 0.3, "h": 0.3}
        if (h, w) == (H, W):
            return {"components": [board], "notes": ""}, "perceptron"
        ys, xs = np.where((frame[:, :, 2] > 150) & (frame[:, :, 0] < 90))
        if not len(xs):
            return {"components": [], "notes": ""}, "perceptron"
        return {"components": [{"type": "resistor", "label": "220 ohm resistor", "position": "",
                                "x": xs.min() / w, "y": ys.min() / h, "w": (xs.max() - xs.min()) / w, "h": (ys.max() - ys.min()) / h}],
                "notes": ""}, "perceptron"


    def compare_spot(self, image):
        half = (image.shape[1] - 12) // 2
        red = lambda img: bool(((img[:, :, 2] > 150) & (img[:, :, 0] < 90)).sum())
        self.calls.append("spot")
        b, a = red(image[:, :half]), red(image[:, half + 12:])
        return [] if a == b else [{"type": "added" if a else "removed", "label": "220 ohm resistor"}]


class PushChangeDecisionTest(unittest.TestCase):
    def setUp(self):
        self.sb = FakeSupabase()
        store._client = self.sb
        self.board = [{"id": "obj_1", "name": "breadboard", "x": 0.05, "y": 0.6, "w": 0.3, "h": 0.3}]

    def test_no_pixel_change_means_no_ai_call_and_no_commit(self):
        vlm = ZoomVLM()
        a = desk()
        cid, _, _ = push_commit.push_change("p", a, a.copy(), vlm, previous=self.board)
        self.assertIsNone(cid)
        self.assertEqual(vlm.calls, [])
        self.assertEqual(self.sb.db.get("commits", []), [])

    def test_removed_small_part(self):
        vlm = ZoomVLM()
        a = desk()
        b = put(a, 700, 200, 60, 15, color=(30, 30, 210))
        mem = self.board + [{"id": "obj_2", "name": "220 ohm resistor", "x": 700 / W, "y": 200 / H, "w": 60 / W, "h": 15 / H}]
        cid, objs, changes = push_commit.push_change("p", b, a, vlm, previous=mem)
        self.assertEqual([(c["type"], c["name"]) for c in changes], [("removed", "220 ohm resistor")])
        self.assertEqual([o["name"] for o in objs], ["breadboard"])

    def test_small_part_missed_full_frame_is_found_zoomed(self):
        vlm = ZoomVLM()
        a = desk()
        b = put(a, 700, 200, 60, 15, color=(30, 30, 210))
        cid, objs, changes = push_commit.push_change("p", a, b, vlm, previous=self.board)
        self.assertEqual([(c["type"], c["name"]) for c in changes], [("added", "220 ohm resistor")])
        self.assertEqual(vlm.calls, ["spot"], "one side-by-side call for the one changed spot, no full-frame call")
        r = changes[0]["to"]
        self.assertAlmostEqual(r["x"], 700 / W, delta=0.01)
        self.assertAlmostEqual(r["y"], 200 / H, delta=0.01)
        self.assertEqual(sorted(o["name"] for o in objs), ["220 ohm resistor", "breadboard"])

    def test_unnamed_real_change_is_kept_with_photos(self):
        class Blind(ZoomVLM):
            def analyze_scene(self, frame):
                return {"components": [], "notes": ""}, "perceptron"

            def compare_spot(self, image):
                return [{"type": "added", "label": "unknown part"}]
        a = desk()
        b = put(a, 700, 200, 60, 15, color=(200, 200, 30))
        cid, _, changes = push_commit.push_change("p", a, b, Blind(), previous=[])
        self.assertIsNotNone(cid)
        c = self.sb.db["commits"][0]
        self.assertEqual(c["processing_state"], "described")
        self.assertEqual([(x["type"], x["name"]) for x in changes], [("added", "Unidentified part")])
        self.assertAlmostEqual(changes[0]["to"]["x"], 700 / W, delta=0.01)
        self.assertEqual(sorted(f["kind"] for f in self.sb.db["frames"]), ["after", "before"])

    def test_failed_ai_still_uploads_photos(self):
        class Down(ZoomVLM):
            def analyze_scene(self, frame):
                raise RuntimeError("Perceptron failed after 3 attempts: timeout")

            def compare_spot(self, image):
                raise RuntimeError("Perceptron failed after 3 attempts: timeout")
        a = desk()
        with self.assertRaises(RuntimeError):
            push_commit.push_change("p", a, put(a, 700, 200, 60, 15), Down(), previous=[])
        self.assertEqual(self.sb.db["commits"][0]["processing_state"], "failed")
        self.assertEqual(sorted(f["kind"] for f in self.sb.db["frames"]), ["after", "before"])

    def test_dropped_connection_is_retried(self):
        self.sb.fail_on.update({"upload": 2, "insert commits": 1})
        a = desk()
        cid, _, changes = push_commit.push_change("p", a, put(a, 700, 200, 60, 15, color=(30, 30, 210)), ZoomVLM(), previous=self.board)
        self.assertIsNotNone(cid)
        self.assertEqual(len(self.sb.db["commits"]), 1, "retried insert must not duplicate")
        self.assertEqual(self.sb.db["commits"][0]["processing_state"], "described")
        self.assertEqual(len(self.sb.db["frames"]), 2)


if __name__ == "__main__":
    unittest.main()

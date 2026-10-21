"""Same cases as frontend/src/lib/diff.test.ts, so the Jetson and the website agree."""

import unittest

from diff import describe_move, describe_region, diff_objects, summarize_changes


def obj(id, name, x, y, w=0.1, h=0.1):
    return {"id": id, "name": name, "x": x, "y": y, "w": w, "h": h}


def count(changes):
    c = {"added": 0, "removed": 0, "moved": 0}
    for ch in changes:
        c[ch["type"]] += 1
    return c


class DiffObjectsTest(unittest.TestCase):
    def test_nothing_changed(self):
        scene = [obj("1", "DC motor", 0.1, 0.1), obj("2", "Servo", 0.6, 0.6)]
        self.assertEqual(diff_objects(scene, scene), [])

    def test_ignores_jitter(self):
        self.assertEqual(diff_objects([obj("1", "DC motor", 0.1, 0.1)], [obj("1", "DC motor", 0.11, 0.115)]), [])

    def test_move_by_name_case_insensitive(self):
        changes = diff_objects([obj("1", "DC motor", 0.12, 0.3)], [obj("9", "dc MOTOR", 0.45, 0.32)])
        self.assertEqual(len(changes), 1)
        self.assertEqual((changes[0]["type"], changes[0]["name"], changes[0]["detail"]), ("moved", "dc MOTOR", "Moved right"))
        self.assertEqual(changes[0]["from"], {"x": 0.12, "y": 0.3, "w": 0.1, "h": 0.1})
        self.assertEqual(changes[0]["to"], {"x": 0.45, "y": 0.32, "w": 0.1, "h": 0.1})

    def test_size_change_is_moved(self):
        changes = diff_objects([obj("1", "Battery pack", 0.4, 0.4, 0.1, 0.1)], [obj("1", "Battery pack", 0.4, 0.4, 0.2, 0.1)])
        self.assertEqual(changes[0]["type"], "moved")

    def test_added_and_removed(self):
        before = [obj("1", "DC motor", 0.1, 0.1), obj("2", "Red wire", 0.8, 0.8)]
        after = [obj("1", "DC motor", 0.1, 0.1), obj("3", "Servo", 0.45, 0.45)]
        changes = diff_objects(before, after)
        self.assertEqual(sorted(c["type"] for c in changes), ["added", "removed"])
        removed = next(c for c in changes if c["type"] == "removed")
        self.assertEqual(removed["name"], "Red wire")
        self.assertIsNone(removed["to"])
        self.assertEqual(removed["detail"], "Removed from the bottom right")
        added = next(c for c in changes if c["type"] == "added")
        self.assertIsNone(added["from"])
        self.assertEqual(added["detail"], "Added at the center")

    def test_renamed_matched_by_proximity(self):
        changes = diff_objects([obj("1", "motor", 0.3, 0.3)], [obj("1", "DC motor", 0.35, 0.3)])
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["type"], "moved")

    def test_far_apart_not_matched(self):
        changes = diff_objects([obj("1", "motor", 0.1, 0.1)], [obj("1", "DC motor", 0.7, 0.7)])
        self.assertEqual(count(changes), {"added": 1, "removed": 1, "moved": 0})

    def test_duplicate_names_nearest(self):
        before = [obj("1", "Blue wire", 0.1, 0.1), obj("2", "Blue wire", 0.7, 0.7)]
        after = [obj("3", "Blue wire", 0.7, 0.7), obj("4", "Blue wire", 0.1, 0.4)]
        changes = diff_objects(before, after)
        self.assertEqual(len(changes), 1)
        self.assertEqual((changes[0]["type"], changes[0]["detail"]), ("moved", "Moved down"))
        self.assertEqual((changes[0]["from"]["x"], changes[0]["from"]["y"]), (0.1, 0.1))

    def test_empty_inputs(self):
        self.assertEqual(diff_objects([], []), [])
        self.assertEqual(diff_objects([], [obj("1", "Servo", 0.5, 0.5)])[0]["type"], "added")
        self.assertEqual(diff_objects([obj("1", "Servo", 0.5, 0.5)], [])[0]["type"], "removed")


class DescribeTest(unittest.TestCase):
    b = {"x": 0.5, "y": 0.5, "w": 0.1, "h": 0.1}

    def test_dominant_axis(self):
        self.assertEqual(describe_move(self.b, {**self.b, "x": 0.8}), "Moved right")
        self.assertEqual(describe_move(self.b, {**self.b, "y": 0.1}), "Moved up")
        self.assertEqual(describe_move(self.b, {**self.b, "x": 0.4, "y": 0.8}), "Moved down")

    def test_diagonal(self):
        self.assertEqual(describe_move(self.b, {**self.b, "x": 0.2, "y": 0.2}), "Moved up and left")
        self.assertEqual(describe_move(self.b, {**self.b, "x": 0.8, "y": 0.75}), "Moved down and right")

    def test_regions(self):
        def at(cx, cy):
            return describe_region({"x": cx - 0.05, "y": cy - 0.05, "w": 0.1, "h": 0.1})
        self.assertEqual(at(0.1, 0.1), "top left")
        self.assertEqual(at(0.5, 0.1), "top center")
        self.assertEqual(at(0.9, 0.1), "top right")
        self.assertEqual(at(0.1, 0.5), "middle left")
        self.assertEqual(at(0.5, 0.5), "center")
        self.assertEqual(at(0.9, 0.5), "middle right")
        self.assertEqual(at(0.1, 0.9), "bottom left")
        self.assertEqual(at(0.5, 0.9), "bottom center")
        self.assertEqual(at(0.9, 0.9), "bottom right")

    def test_summary(self):
        changes = diff_objects([obj("1", "DC motor", 0.12, 0.3), obj("2", "Red wire", 0.8, 0.8)],
                               [obj("1", "DC motor", 0.45, 0.32), obj("3", "Servo", 0.45, 0.45)])
        self.assertEqual(summarize_changes(changes), "Moved DC motor right, removed Red wire and added Servo.")


if __name__ == "__main__":
    unittest.main()

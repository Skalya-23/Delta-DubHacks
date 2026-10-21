"""Quick test: run Perceptron Mk1.5 on a workbench photo to validate the pipeline."""

import sys
import cv2
import json
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, "backend")
from vlm import PerceptronClient


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test_vlm.py <photo.jpg>")
        sys.exit(1)

    path = sys.argv[1]
    frame = cv2.imread(path)
    if frame is None:
        print(f"Could not read {path}")
        sys.exit(1)

    print(f"Analyzing {path} with Perceptron Mk1.5...")
    client = PerceptronClient()
    result = client.analyze_scene(frame)

    print("\n=== Scene JSON ===")
    print(json.dumps(result, indent=2))

    print(f"\nFound {len(result.get('components', []))} components.")


if __name__ == "__main__":
    main()

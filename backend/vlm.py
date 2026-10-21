"""Perceptron Mk1.5 client — TUNED FOR DETECTION."""

import os
import json
import time
import base64
import cv2
import requests

from regions import iou

SCENE_MAX_TOKENS = int(os.environ.get("PERCEPTRON_MAX_TOKENS", 3000))
REQUEST_TIMEOUT = 30
SCENE_REASONING = os.environ.get("PERCEPTRON_REASONING", "low")
SCENE_ATTEMPTS = 3
MAX_IMAGE_SIDE = 1280


SCENE_PROMPT = """You are a computer vision expert analyzing an overhead photo of an electronics workbench.

Your job: identify EVERY component precisely, using your advanced visual capabilities to READ markings, labels, and color codes.

LOOK CAREFULLY at the ENTIRE scene. Use your OCR and detail-recognition skills:

RESISTOR COLOR CODE READING (CRITICAL):
When you see a resistor, READ its color bands left to right and calculate the resistance value.
- Black=0, Brown=1, Red=2, Orange=3, Yellow=4, Green=5, Blue=6, Violet=7, Grey=8, White=9
- 4-band: first 2 = digits, 3rd = multiplier (power of 10), 4th = tolerance
- 5-band: first 3 = digits, 4th = multiplier, 5th = tolerance
- Examples:
  - Brown-Black-Red-Gold = 10 × 100 = 1000 ohms = "1kΩ resistor"
  - Brown-Black-Orange-Gold = 10 × 1000 = 10000 ohms = "10kΩ resistor"
  - Red-Red-Brown-Gold = 22 × 10 = 220 ohms = "220Ω resistor"
  - Yellow-Violet-Red-Gold = 47 × 100 = 4700 = "4.7kΩ resistor"
- If you can't read the bands clearly, just say "resistor" without value

CHIP / IC LABEL READING (OCR):
Read any text, part numbers, or markings on IC chips and modules:
- "ATmega328P" → Arduino Uno microcontroller
- "ESP32-WROOM-32" → ESP32 module
- "STM32F103C8T6" → Blue Pill
- "L298N" → H-bridge motor driver
- "LM317", "7805" → voltage regulators
- "HC-SR04" → ultrasonic sensor
- "DHT22" / "DHT11" → temp+humidity sensor
- "SSD1306" → OLED display driver
- Include part number in the label if you can read it

LED COLOR AND SIZE:
- Note color (red, green, blue, yellow, white, RGB)
- Note size (3mm, 5mm, SMD)
- Note if on vs off if visible

CAPACITOR VALUES:
- Electrolytic: read µF value and voltage from label
- Ceramic: read the 3-digit code (e.g. "104" = 100nF)

DEV BOARD IDENTIFICATION:
Look at the board layout, port positions, chip markings to identify the exact model.

SENSOR MODULE IDENTIFICATION:
Most sensor breakout boards have a printed label — read it.


SMALL PASSIVE COMPONENTS (look very closely):
- RESISTORS: small cylindrical bodies with colored stripe bands
- LEDs: tiny clear or colored dome with 2 metal wire legs
- Capacitors: cylindrical with 2 legs OR flat disc with 2 legs OR surface-mount box
- Diodes: small black cylinder with band marking
- Transistors / MOSFETs: small black or metal 3-leg devices
- Crystal oscillators: small silver cylinder or rectangle

WIRES AND CONNECTIONS:
- Jumper wires (any color — red, black, yellow, green, blue, white, orange)
- DuPont wires (female-to-male connectors)
- Breadboard power rail wires
- Ribbon cables

SENSORS (identify specifically by model if visible):
- DHT22 / DHT11 (temperature + humidity, blue or white rectangle)
- HC-SR04 (ultrasonic, 2 circular transducers)
- PIR motion sensor (white dome)
- MPU6050 / IMU (6-axis motion)
- MAX30102 (pulse / heart rate)
- Light sensor (photoresistor, LDR)
- Soil moisture, gas sensors, pressure sensors
- Any labeled sensor module

DEV BOARDS AND MICROCONTROLLERS:
- Arduino (Uno, Nano, Mega, Mini)
- ESP32 / ESP8266
- STM32 (Nucleo, Blue Pill, Black Pill)
- Raspberry Pi (Pi 4, Pi 5, Pi Zero, Pi Pico)
- Teensy, Adafruit Feather, SparkFun boards
- Custom PCB

CHIPS AND ICs:
- Standalone IC chips (DIP packages with pins)
- Microcontrollers
- Op-amps, voltage regulators (7805, LM317)
- Motor drivers (L298N, L293D, DRV8825, A4988)
- Shift registers (74HC595)
- Logic gates

DISPLAYS:
- OLED (SSD1306, 0.96")
- LCD (16x2, 20x4)
- 7-segment displays
- LED matrix
- E-ink displays

INPUT DEVICES:
- Push buttons (tactile switches)
- Toggle switches, slide switches
- Potentiometers (round with knob)
- Rotary encoders
- Keypads

OUTPUT DEVICES:
- Servos (SG90, MG996R)
- DC motors, stepper motors
- Speakers, buzzers (piezo)
- Relays

POWER:
- Battery holders
- Power modules (buck/boost converters)
- Barrel jacks
- USB breakout boards

CONNECTORS:
- Pin headers (male/female)
- Terminal blocks
- JST connectors

RULES:
- Include EVERY component you can clearly see, no matter how small
- Be thorough — missing a resistor or sensor is worse than mis-labeling one
- Identify specific models when visible (e.g. "DHT22" not just "sensor")
- Only exclude: hands, body parts, phones, pens, laptops, random non-electronic clutter
- If a component is partially visible but recognizable, include it
- List each board or module as ONE item. Do NOT list things built into a board as separate parts
  (USB/HDMI/Ethernet ports, SD slots, on-board chips or LEDs of a Raspberry Pi, Arduino, etc.)

For each component, provide:
- type: one of [breadboard, dev_board, resistor, led, jumper_wire, chip, sensor, button, capacitor, potentiometer, display, motor, buzzer, power_module, connector, other]
- label: SHORT name, 2-4 words, with color/value/model (e.g. "DHT22 sensor", "red LED", "220 ohm resistor", "SG90 servo", "OLED display", "yellow jumper wire", "breadboard"). Do not add positions or qualifiers like "(left)" to the label.
- position: approximate location on scene (e.g. "center of breadboard", "row 15", "top-left near pin 7", "left side next to Arduino")
- x, y, w, h: tight bounding box around the component, as fractions of the image (0.0 to 1.0). x, y is the TOP-LEFT corner; w, h are width and height.

Return JSON:
{"components": [{"type": "...", "label": "...", "position": "...", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}, ...], "notes": "brief observation"}

Be comprehensive. List EVERYTHING you can see."""


SPOT_PROMPT = """The LEFT half is BEFORE and the RIGHT half is AFTER: the same spot on an electronics workbench, photographed from above.
The green rectangle (same place in both halves) marks exactly where the pixels changed.
What changed inside the green rectangle? For each part: "added" (in AFTER, not in BEFORE),
"removed" (in BEFORE, not in AFTER), "moved" (in both, different position).
Name the part briefly with color/value if visible (e.g. "resistor", "red LED", "yellow jumper wire",
"ceramic capacitor"). Ignore hands and shadows. If you can't tell what the part is, use "unknown part".
Return JSON: {"changes": [{"type": "added|removed|moved", "label": "..."}]}"""


SPOT_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "spot_change",
        "schema": {
            "type": "object",
            "properties": {
                "changes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": ["added", "removed", "moved"]},
                            "label": {"type": "string"},
                        },
                        "required": ["type", "label"],
                    },
                },
            },
            "required": ["changes"],
        },
    },
}


SCENE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "workbench_scene",
        "schema": {
            "type": "object",
            "properties": {
                "components": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": [
                                    "breadboard", "dev_board", "resistor", "led",
                                    "jumper_wire", "chip", "sensor", "button",
                                    "capacitor", "potentiometer", "display",
                                    "motor", "buzzer", "power_module",
                                    "connector", "diode", "transistor", "other"
                                ]
                            },
                            "label": {"type": "string"},
                            "position": {"type": "string"},
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "w": {"type": "number"},
                            "h": {"type": "number"}
                        },
                        "required": ["type", "label", "position", "x", "y", "w", "h"]
                    }
                },
                "notes": {"type": "string"}
            },
            "required": ["components", "notes"]
        }
    }
}


def _encode_image(frame):
    h, w = frame.shape[:2]
    if max(h, w) > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / max(h, w)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return base64.standard_b64encode(buf.tobytes()).decode('utf-8')


def _clamp01(v):
    return max(0.0, min(1.0, float(v)))


def scene_to_objects(scene):
    comps = [c for c in scene.get("components", [])
             if all(isinstance(c.get(k), (int, float)) for k in ("x", "y", "w", "h"))]
    scale = 1000.0 if any(c[k] > 1.5 for c in comps for k in ("x", "y", "w", "h")) else 1.0
    objects = []
    for c in comps:
        x, y = _clamp01(c["x"] / scale), _clamp01(c["y"] / scale)
        w, h = _clamp01(c["w"] / scale), _clamp01(c["h"] / scale)
        w, h = min(w, 1.0 - x), min(h, 1.0 - y)
        if w <= 0 or h <= 0:
            continue
        name = (c.get("label") or c.get("type") or "component").strip()
        obj = {"id": f"obj_{len(objects) + 1}", "name": name,
               "x": round(x, 4), "y": round(y, 4), "w": round(w, 4), "h": round(h, 4)}
        if not any(o["name"].lower() == name.lower() and iou(o, obj) > 0.5 for o in objects):
            objects.append(obj)
    return objects


class TruncatedResponse(ValueError):
    """The model ran out of tokens before finishing its answer."""


def _extract_json(text):
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(text[start:end + 1])


class PerceptronClient:
    def __init__(self, api_key=None, endpoint=None):
        self.api_key = api_key or os.environ.get("PERCEPTRON_API_KEY")
        self.endpoint = endpoint or os.environ.get(
            "PERCEPTRON_ENDPOINT",
            "https://api.perceptron.inc/v1/chat/completions"
        )

    def _chat(self, messages, response_format=None, max_tokens=2048, reasoning_effort="medium"):
        if not self.api_key:
            raise RuntimeError("PERCEPTRON_API_KEY not set")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "perceptron-mk1.5",
            "messages": messages,
            "max_tokens": max_tokens,
            "reasoning_effort": reasoning_effort,
        }
        if response_format:
            payload["response_format"] = response_format
        response = requests.post(self.endpoint, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        choice = response.json()["choices"][0]
        if choice.get("finish_reason") == "length":
            raise TruncatedResponse(f"response hit max_tokens={max_tokens}")
        return choice["message"]["content"]

    def analyze_scene(self, frame):
        """Vision scene analysis of one frame."""
        return self._image_json(frame, SCENE_PROMPT, SCENE_SCHEMA, "components")

    def compare_spot(self, side_by_side):
        """What changed in one spot?"""
        return self._image_json(side_by_side, SPOT_PROMPT, SPOT_SCHEMA, "changes")["changes"]

    def _image_json(self, image, prompt, schema, list_key):
        messages = [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{_encode_image(image)}"}},
                {"type": "text", "text": prompt},
            ],
        }]
        response_format = schema
        last_error = None
        for attempt in range(SCENE_ATTEMPTS):
            if attempt:
                time.sleep(attempt)
            try:
                result = _extract_json(self._chat(messages, response_format=response_format,
                                                  max_tokens=SCENE_MAX_TOKENS,
                                                  reasoning_effort=SCENE_REASONING))
                if not isinstance(result.get(list_key), list):
                    raise ValueError(f"response has no {list_key} list")
                return result
            except requests.HTTPError as e:
                last_error = e
                status = e.response.status_code if e.response is not None else 0
                if status in (401, 403):
                    raise RuntimeError("Perceptron rejected the API key (check PERCEPTRON_API_KEY)") from e
                if status == 400 and response_format:
                    response_format = None
            except (requests.ConnectionError, requests.Timeout, ValueError) as e:
                last_error = e
            print(f"[VLM] Attempt {attempt + 1}/{SCENE_ATTEMPTS} failed: {last_error}")
        raise RuntimeError(f"Perceptron failed after {SCENE_ATTEMPTS} attempts: {last_error}")

    def text(self, prompt, max_tokens=1500, reasoning_effort="low"):
        """Text-only completion (summaries, answers), with the same retry policy as scenes."""
        messages = [{"role": "user", "content": prompt}]
        last_error = None
        for attempt in range(SCENE_ATTEMPTS):
            if attempt:
                time.sleep(attempt)
            try:
                answer = (self._chat(messages, max_tokens=max_tokens, reasoning_effort=reasoning_effort) or "").strip()
                if answer:
                    return answer
                last_error = ValueError("empty answer")
            except requests.HTTPError as e:
                if e.response is not None and e.response.status_code in (401, 403):
                    raise RuntimeError("Perceptron rejected the API key (check PERCEPTRON_API_KEY)") from e
                last_error = e
            except (requests.ConnectionError, requests.Timeout, ValueError) as e:
                last_error = e
            print(f"[VLM] Text attempt {attempt + 1}/{SCENE_ATTEMPTS} failed: {last_error}")
        raise RuntimeError(f"Perceptron failed after {SCENE_ATTEMPTS} attempts: {last_error}")


class VLMRouter:
    """Perceptron is the only model; this keeps the (scene, source) interface the pipeline uses."""
    def __init__(self):
        self.perceptron = PerceptronClient()

    def analyze_scene(self, frame):
        return self.perceptron.analyze_scene(frame), "perceptron"

    def compare_spot(self, side_by_side):
        return self.perceptron.compare_spot(side_by_side)

    def text(self, prompt, **kwargs):
        return self.perceptron.text(prompt, **kwargs)

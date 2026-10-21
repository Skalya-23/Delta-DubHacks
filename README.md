## Inspiration

Every hardware engineer has lived this. It's 2am, the circuit worked an hour ago, someone changed something, nobody remembers what.

Software fixed this in 2005 using Git. Every change is tracked, every state is recoverable, and every "who broke what" answerable in seconds. But walk into any robotics lab or EE classroom today and the state of the art is phone photos, whiteboards, and Slack messages that say "sensor goes in port 3, GPIO is empty except pins 4 and 8."

All of us work on hardware. One of us watched a $200 PCB fry because the last tester said "220 ohm" and the docs said "2.2k." We've all lost entire Saturdays trying to reverse-engineer our own prototypes because the last working state was in someone's phone.

**Software has version control. Hardware doesn't have anything.**

So we built Delta.

## What it does

Delta is a Git-style version control system for physical work.

An overhead camera watches your workbench. The second anything changes, a wire moves, a resistor goes in, a chip gets rotated, Delta logs a commit. Each commit has before/after photos, a bounding box on what moved, and an AI description of what the part actually is.

**Live component detection:** every component the camera picks up: wires, LEDs, chips, sensors, breakouts, breadboards, jumper cables, screens, buzzers.

**Specific diffs:** not "a resistor moved" but "10kΩ added at F-14 to F-18."

**Natural-language queries:** ask it questions in English. "When did I add the voltage divider?" "What did my circuit look like 20 minutes ago?" "Who placed the STM32?"

**AI build instructions:** hit a button and get a full Markdown build guide so anyone can rebuild the circuit from scratch.

**Rewind slider:** scrub through every state your workbench has ever been in.

**Checkpoints and works/broken marks:** tag states so you can always get back to the last known good version.

**Compare-two-points view:** diff any two moments in time and get a restore checklist.

**Multi-user sessions:** so a whole team knows who did what.

GitHub for electronics.

## How we built it

We're running a NVIDIA Jetson Orin Nano Dev Kit on Ubuntu 22.04 (JetPack 6). A USB webcam at 1280×720 sits above the breadboard on a 3D-printed arm we CAD'd and printed on-site. The Jetson lives in a custom 3D-printed enclosure for thermal management and cable routing.

The core architectural decision is that **OpenCV handles detection and Perceptron Mk 1.5 handles naming**. Each system is responsible for what it does best, which kept detection fast, consistent, and cost-efficient.

**Change detection pipeline:** when a frame arrives, we wait about 1.5 seconds for the workbench to settle so we aren't capturing hands mid-motion. We then mask out 84 pixels (roughly one inch) on every edge of the frame to ignore activity at the periphery. The before and after frames are diffed per color channel with gain correction, which prevents overall lighting changes from registering as real changes. If all three color channels for a pixel scale by the same ratio (spread under 0.12), the pixel is classified as a shadow or glare rather than a new object.

We clean the remaining changed pixels with a morphological open and run `cv2.connectedComponentsWithStats` to isolate each change into a distinct spot. A spot must be at least 46 pixels to be considered real. Camera noise tops out around 21 pixels and a resistor measures about 77 pixels, so 46 is the threshold that reliably separates signal from noise. If nothing qualifies, no API call is made. If more than half the frame has changed at once, the system falls back to the full-scene path and asks Perceptron to re-inventory the entire workbench.

**Naming the changes:** only once a spot passes every gate do we call Perceptron Mk 1.5. We send a zoomed before/after crop of each spot. If the model can't name the component, we widen the crop and retry. If it still can't identify it, we save the entry as "Unidentified part" and move on. When a part is removed in one spot and added in another, those two events are merged into a single "moved" commit.

**Perceptron configuration:** we run `reasoning_effort: low`, which averages ~5 seconds per call compared to 11-25 seconds on high, and found identical components in our testing. All output is structured JSON with x/y/w/h bounding boxes, with a 30 second timeout and automatic retries. We also use reference-frame diffing: the previous commit's JSON scene is passed back in as context, so the model updates its understanding of the workbench rather than describing it from scratch every call. Perceptron never decides whether something changed. That is strictly the pixel pipeline's job, and that separation is what made detection consistent.

**Database layer:** the backing store is Supabase. Postgres tables hold projects, commits (with a `pending → described` state so the UI can display an in-progress indicator), checkpoints, capture sessions, and project questions. Supabase Storage holds the before and after JPEGs. Realtime subscriptions push updates to the website as commits are processed. Row Level Security scopes every read and write to project members, the Jetson authenticates with the secret key, and the browser only ever receives the publishable key. All commit IDs are generated client-side, which guarantees that a retried insert cannot create a duplicate row.

**Frontend:** the website is built with React 19, TypeScript, Vite, Tailwind, shadcn/ui, and TanStack React Query. It contains the timeline, the before/after viewer, the compare-two-points-in-time view, the works/broken marks and checkpoints, the session recap view, email-based invites, and the Ask AI page.

**Testing:** we wrote 61 unittest cases on the backend covering the diff logic, stabilization, region detection, and a full integration flow using a fake Supabase and a fake AI. The frontend has 12 Vitest cases. A `smoke_test.py` script exercises the real end-to-end pipeline against the live stack.

## Challenges we ran into

**Three hours lost to a locked SD card adapter.** Pi Imager kept silently failing to flash the Jetson's microSD card, and we spent hours debugging software before realizing the adapter had a physical write-lock switch on the side that none of us had noticed. Once we flipped it, the flash completed on the first try.

**Perceptron hallucinating components.** Our initial prompt was too permissive, and the model would confidently list an Arduino Uno on a completely empty breadboard. We rewrote the prompt from scratch, enforced a strict JSON Schema on every response, and switched to lossless image encoding. Most of the hallucinations disappeared.

**Thin wires and quarter-watt resistors slipping through detection.** Switching image encoding from JPEG to PNG and restructuring the prompt to prioritize finding components over reading color bands significantly improved recall on small parts.

**Shadows and lighting changes triggering false commits.** Early versions logged a commit every time someone walked past the fluorescent lights overhead. We solved it by diffing per color channel with gain correction. If all three channels scale by the same ratio, the change is a lighting shift rather than a new object, and the frame is discarded.

**Hands constantly in the frame.** We built a motion-stability detector that waits for the workbench to settle before capturing a frame, which ensures Delta never commits a half-placed component.

**Tuning the thresholds.** The 84-pixel border mask, the 46-pixel minimum spot size, the 50 percent global-change threshold, and the 1.5 second settle time were all tuned against measured camera noise on the actual hardware rather than chosen arbitrarily.

## Accomplishments that we're proud of

**Delta works end to end.** Place a resistor on the breadboard, and within a few seconds a new entry appears in the commit log that reads "Added 10kΩ resistor at F-14 to F-18," with a before/after diff and a bounding box on the exact spot that changed.

**The full Git metaphor, not a single feature.** The system supports log, diff, rewind, user attribution, checkpoints, restore, natural-language Q&A, and automatic build-instruction generation. It functions as a complete tool, not a proof of concept.

**The hybrid architecture is the part we're most proud of.** OpenCV handles the deterministic pixel work directly on the Jetson, which is fast, local, and free of API cost. Perceptron handles the tasks that require semantic understanding: naming components, reading fine text, and writing summaries. A 46-pixel resistor is detected locally without a single API call, and only then does Perceptron identify it as a 10kΩ resistor. Each component of the system is responsible for the work it is best suited to.

**The results back it up.** The detection pipeline produced zero false positives across 100 still frames and correctly handled all eight resistor add, remove, and no-change test cases.

**Tested like a product.** 61 unit and integration tests on the backend, 12 on the frontend, and a smoke test that exercises the full pipeline end to end.

## What we learned

**Prompt engineering has effectively replaced fine-tuning** for projects on this scale. The Perceptron team told us as much when we spoke with them at their booth, and our own iteration confirmed it. With a sufficiently capable base model, careful prompting combined with strict JSON schema enforcement outperforms custom training on any hackathon timescale.

**Reference-frame diffing is a cheat code.** Providing a VLM with the previous frame's output as context dramatically improves consistency. Rather than asking the model to describe each scene from scratch, we give it the prior description and ask what has changed. The difference in output stability is substantial.

**Image encoding matters more than it appears.** JPEG compression artifacts that are imperceptible to the human eye can significantly degrade a VLM's recall on small objects. Switching to lossless PNG encoding noticeably improved detection of thin wires and quarter-watt resistors, and the additional bandwidth cost was negligible.

**Let the pixels decide, let the model describe.** Detection accuracy stabilized the moment we stopped asking the model whether something had changed and began using it solely to identify what the pixel-level pipeline had already isolated.

## What's next for Delta

- **Live correction mode:** Delta flags wiring mistakes in real time, catching errors while the circuit is still on the breadboard rather than after a board has been damaged.
- **PCB mode:** extending the system from breadboards to soldered boards and populated PCBs.
- **Deployment across UW engineering teams:** rolling Delta out to Husky Robotics, ARUW, and Formula Motorsports as a shared tool for lab documentation and handoffs.
- **Industrial assembly:** expanding beyond electronics to version-control any physical assembly process on a factory or manufacturing floor.
- **Mobile client:** a phone app so you can view commits, run queries, and watch the live feed without being at a laptop.

# Pickleball Pong — Project Context

## What this is
A two-player webcam-controlled Pong game built with Flask + p5.js + ml5.js HandPose. Players physically move their hands in front of the camera to control paddles. Hand speed at contact determines ball speed.

## File structure
```
app.py                  — Minimal Flask server (standard templates/ + static/ folders)
templates/index.html    — HUD (scores, status), CDN scripts (p5 v1.9.3, ml5 v1), canvas holder
static/sketch.js        — ALL game logic in a single new p5(...) closure
```

## Game modes
- Menu screen on launch — "Human vs Human" or "Human vs AI"
- AI mode → difficulty picker (Easy / Medium / Hard) before game starts
- HVH labels: "Player 1" (blue, left) vs "Player 2" (pink, right)
- AI mode labels: "Player 1" (blue, left) vs "AI" (pink, right)
- First to **11** wins; game-over overlay with **10-second countdown** then auto-restart same mode
- Phases: `"menu"` → `"difficulty"` → `"waiting"` → `"playing"` ↔ `"point"` → `"gameover"` → `"waiting"`

## AI difficulty
- Easy: maxSpeed 2 px/frame, noisy target (±50px random), lerp 0.04
- Medium: maxSpeed 4 px/frame, lerp 0.09
- Hard: maxSpeed 7.5 px/frame, lerp 0.18, predicts one-bounce ball position when ball moving right

## Key design decisions

### Player assignment
Hand position determines player, NOT ml5 handedness label:
- `wrist.x < W/2` → p1 (left paddle, blue)
- `wrist.x >= W/2` → p2 (right paddle, pink)

### Camera display
Video feed is flipped horizontally (mirror mode) so players see themselves on the correct side:
- `p.translate(W, 0); p.scale(-1, 1);` before drawing video
- ml5 is initialized with `flipped: true` so keypoint coordinates already match screen layout

### Ball speed
Mapped from hand speed at moment of paddle contact:
- Hand speed range: 0–35 px/frame (smoothed with lerp 0.4)
- Ball speed range: 4–14 px/frame

### Constants
W=800, H=600, PADDLE_W=12, PADDLE_H=90, PADDLE_OFFSET=30, BALL_R=10

## Running locally
```bash
python app.py
# open http://localhost:5000
```

## Dependencies
- Python: Flask
- Frontend (CDN): p5.js v1.9.3, ml5.js v1

// handpose.js
// Handles all ml5 HandPose logic.
// Exports a HandTracker object that sketch.js reads each frame.

const HandTracker = (() => {
  // ── Public state read by sketch.js ──────────────────────────────────────
  const state = {
    p1: { y: 300, speed: 0, detected: false },   // left-side player
    p2: { y: 300, speed: 0, detected: false },   // right-side player
    ready: false,       // true once ml5 model loaded
    videoReady: false,
  };

  // ── Internal ─────────────────────────────────────────────────────────────
  let handPose, video, hands = [];

  // Previous wrist positions for velocity calculation (raw pixel coords)
  const prev = {
    left:  { x: 0, y: 0 },
    right: { x: 0, y: 0 },
  };

  // CANVAS_W must match sketch.js — used to mirror the webcam x-axis
  const CANVAS_W = 800;
  const CANVAS_H = 600;

  // Smooth paddle movement (0 = no smoothing, 1 = never moves)
  const LERP_AMT = 0.2;

  // Max speed cap so a very fast flail doesn't launch the ball to infinity
  const MAX_SPEED = 40;

  function init(p5Instance) {
    // Create a hidden video capture inside the p5 sketch
    video = p5Instance.createCapture(p5Instance.VIDEO, () => {
      state.videoReady = true;
    });
    video.size(CANVAS_W, CANVAS_H);
    video.hide();  // We draw it ourselves in sketch.js

    // Load ml5 HandPose (ml5 v1 API)
    console.log("ml5 version:", ml5.version);
    console.log("Creating handPose model...");
    handPose = ml5.handPose({ maxHands: 2, flipped: true });
    console.log("handPose object:", handPose);
    handPose.detectStart(video, (results) => {
      if (!state.ready) console.log("First prediction received! Hands:", results.length);
      hands = results;
      state.ready = true;
    });
    console.log("detectStart called");
  }

  function update(canvasHeight) {
    if (!state.ready || hands.length === 0) {
      state.p1.detected = false;
      state.p2.detected = false;
      return;
    }

    // Reset detection flags each frame
    state.p1.detected = false;
    state.p2.detected = false;

    for (const hand of hands) {
      // Wrist landmark is index 0 in the ml5 HandPose keypoints array
      const wrist = hand.keypoints[0];
      if (!wrist) continue;

      // ml5 HandPose gives us a 'handedness' string: "Left" or "Right"
      // Because we mirror (flipped:true), "Left" appears on the right side of screen
      // → "Left" hand = Player 2 (right side), "Right" hand = Player 1 (left side)
      const side = hand.handedness === "Right" ? "left" : "right";
      const player = side === "left" ? state.p1 : state.p2;
      const prevPos = prev[side];

      // ── Velocity (speed of wrist movement this frame) ──────────────────
      const dx = wrist.x - prevPos.x;
      const dy = wrist.y - prevPos.y;
      const rawSpeed = Math.sqrt(dx * dx + dy * dy);
      const clampedSpeed = Math.min(rawSpeed, MAX_SPEED);

      // Smooth speed with a light low-pass so one jitter frame doesn't spike
      player.speed = player.speed * 0.6 + clampedSpeed * 0.4;

      // ── Y position (smooth lerp to reduce jitter) ──────────────────────
      const targetY = wrist.y;
      player.y = lerp(player.y, targetY, LERP_AMT);
      player.detected = true;

      // Store for next frame
      prevPos.x = wrist.x;
      prevPos.y = wrist.y;
    }
  }

  // Simple lerp helper (p5's lerp isn't available here)
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getVideo() { return video; }

  return { init, update, state, getVideo };
})();

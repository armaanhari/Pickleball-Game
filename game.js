// game.js
// Pure game logic — no p5 or ml5 dependencies.
// sketch.js calls Game.update() each frame and reads Game.state to draw.

const Game = (() => {
  const W = 800;
  const H = 600;

  const PADDLE_W = 14;
  const PADDLE_H = 90;
  const PADDLE_X_OFFSET = 30;  // distance from edge to paddle center

  // Ball speed range mapped from hand speed
  const MIN_BALL_SPEED = 4;
  const MAX_BALL_SPEED = 14;
  const HAND_SPEED_CAP = 35;   // hand pixels/frame that = max ball speed

  const state = {
    ball: { x: W / 2, y: H / 2, vx: 5, vy: 3 },
    p1: { y: H / 2, score: 0 },   // left paddle
    p2: { y: H / 2, score: 0 },   // right paddle
    hitFlash: { active: false, side: null, timer: 0 },  // visual feedback
    gamePhase: "waiting",  // "waiting" | "playing" | "point"
    pointWinner: null,
    countdown: 0,
  };

  let pointPauseTimer = 0;

  // ── Public: called once per frame ──────────────────────────────────────
  function update(handState) {
    const { p1Hand, p2Hand, bothDetected } = extractHands(handState);

    // Update paddle positions from hand tracker
    if (p1Hand.detected) state.p1.y = p1Hand.y;
    if (p2Hand.detected) state.p2.y = p2Hand.y;

    if (state.gamePhase === "waiting") {
      if (bothDetected) {
        state.gamePhase = "playing";
        serveBall();
      }
      return;
    }

    if (state.gamePhase === "point") {
      pointPauseTimer--;
      if (pointPauseTimer <= 0) {
        state.gamePhase = "playing";
        state.pointWinner = null;
        serveBall();
      }
      return;
    }

    // ── Move ball ───────────────────────────────────────────────────────
    state.ball.x += state.ball.vx;
    state.ball.y += state.ball.vy;

    // Top/bottom wall bounce
    if (state.ball.y <= 8 || state.ball.y >= H - 8) {
      state.ball.vy *= -1;
      state.ball.y = state.ball.y <= 8 ? 8 : H - 8;
    }

    // ── Paddle collisions ────────────────────────────────────────────────
    checkPaddleHit("p1", p1Hand.speed);
    checkPaddleHit("p2", p2Hand.speed);

    // ── Scoring (ball exits left or right edge) ──────────────────────────
    if (state.ball.x < -20) {
      scorePoint("p2");
    } else if (state.ball.x > W + 20) {
      scorePoint("p1");
    }

    // Tick hit flash timer
    if (state.hitFlash.active) {
      state.hitFlash.timer--;
      if (state.hitFlash.timer <= 0) state.hitFlash.active = false;
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  function extractHands(handState) {
    return {
      p1Hand: handState.p1,
      p2Hand: handState.p2,
      bothDetected: handState.p1.detected && handState.p2.detected,
    };
  }

  function serveBall() {
    state.ball.x = W / 2;
    state.ball.y = H / 2 + (Math.random() - 0.5) * 200;
    const dir = Math.random() < 0.5 ? 1 : -1;
    state.ball.vx = dir * 6;
    state.ball.vy = (Math.random() - 0.5) * 6;
  }

  function checkPaddleHit(player, handSpeed) {
    const ball = state.ball;
    const paddle = state[player];
    const isP1 = player === "p1";

    const px = isP1 ? PADDLE_X_OFFSET : W - PADDLE_X_OFFSET;
    const halfPH = PADDLE_H / 2;
    const halfPW = PADDLE_W / 2;

    const ballR = 8;

    // Check overlap
    const hitX = isP1
      ? ball.x - ballR < px + halfPW && ball.x + ballR > px - halfPW && ball.vx < 0
      : ball.x + ballR > px - halfPW && ball.x - ballR < px + halfPW && ball.vx > 0;

    const hitY = ball.y > paddle.y - halfPH - ballR && ball.y < paddle.y + halfPH + ballR;

    if (hitX && hitY) {
      // Map hand speed → ball speed
      const mappedSpeed = mapSpeed(handSpeed);

      // Reverse x, preserve y direction, scale both by mapped speed
      const angle = (ball.y - paddle.y) / halfPH;  // -1 to 1 (hit position on paddle)
      state.ball.vx = isP1 ? mappedSpeed : -mappedSpeed;
      state.ball.vy = angle * mappedSpeed * 0.8;

      // Push ball out of paddle so it doesn't re-trigger
      state.ball.x = isP1 ? px + halfPW + ballR + 1 : px - halfPW - ballR - 1;

      // Trigger visual flash
      state.hitFlash = { active: true, side: player, timer: 8 };
    }
  }

  function mapSpeed(handSpeed) {
    // Clamp hand speed to 0–HAND_SPEED_CAP, then linearly map to ball speed range
    const clamped = Math.min(Math.max(handSpeed, 0), HAND_SPEED_CAP);
    const t = clamped / HAND_SPEED_CAP;
    return MIN_BALL_SPEED + t * (MAX_BALL_SPEED - MIN_BALL_SPEED);
  }

  function scorePoint(winner) {
    state[winner].score++;
    state.gamePhase = "point";
    state.pointWinner = winner;
    pointPauseTimer = 90;  // ~1.5 seconds at 60fps
    updateScoreDisplay(winner);
  }

  function updateScoreDisplay(winner) {
    const el1 = document.getElementById("p1-score");
    const el2 = document.getElementById("p2-score");
    if (el1) el1.textContent = state.p1.score;
    if (el2) el2.textContent = state.p2.score;

    const msg = document.getElementById("status-msg");
    if (msg) {
      msg.textContent = winner === "p1" ? "Player 1 scores!" : "Player 2 scores!";
      setTimeout(() => {
        if (msg) msg.textContent = "Rally!";
      }, 1500);
    }
  }

  return { update, state };
})();

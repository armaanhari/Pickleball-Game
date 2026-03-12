// sketch.js
// p5.js drawing loop. Reads from HandTracker.state and Game.state to render.

const W = 800;
const H = 600;

const PADDLE_W = 14;
const PADDLE_H = 90;
const PADDLE_X_OFFSET = 30;

new p5((p) => {
  let font;

  p.setup = () => {
    const cnv = p.createCanvas(W, H);
    cnv.parent("canvas-holder");
    p.textAlign(p.CENTER, p.CENTER);
    p.imageMode(p.CORNER);

    HandTracker.init(p);
  };

  p.draw = () => {
    // ── Update logic ───────────────────────────────────────────────────
    HandTracker.update(H);
    Game.update(HandTracker.state);

    const gs = Game.state;
    const hs = HandTracker.state;

    // ── Background — dark court ────────────────────────────────────────
    p.background(12, 18, 30);

    // Draw mirrored webcam feed (dim, behind game elements)
    if (hs.videoReady) {
      p.push();
      p.tint(255, 50);  // 50/255 alpha — ghosted
      // Video is already flipped via ml5 flipped:true option
      p.image(HandTracker.getVideo(), 0, 0, W, H);
      p.noTint();
      p.pop();
    }

    // ── Court lines ────────────────────────────────────────────────────
    drawCourt(p);

    // ── Status overlay ─────────────────────────────────────────────────
    if (gs.gamePhase === "waiting") {
      drawWaitingOverlay(p, hs);
    }

    if (gs.gamePhase === "point") {
      drawPointOverlay(p, gs.pointWinner);
    }

    // ── Paddles ────────────────────────────────────────────────────────
    drawPaddle(p, PADDLE_X_OFFSET, gs.p1.y, "p1", gs.hitFlash, hs.p1.detected);
    drawPaddle(p, W - PADDLE_X_OFFSET, gs.p2.y, "p2", gs.hitFlash, hs.p2.detected);

    // ── Ball ───────────────────────────────────────────────────────────
    if (gs.gamePhase === "playing") {
      drawBall(p, gs.ball, gs.hitFlash);
    }

    // ── Hand speed indicators ──────────────────────────────────────────
    drawSpeedBar(p, 10, H - 20, hs.p1.speed, "left");
    drawSpeedBar(p, W - 10, H - 20, hs.p2.speed, "right");
  };

  // ── Draw helpers ─────────────────────────────────────────────────────

  function drawCourt(p) {
    p.stroke(255, 255, 255, 25);
    p.strokeWeight(1);
    // Center line (net)
    p.drawingContext.setLineDash([8, 8]);
    p.line(W / 2, 0, W / 2, H);
    p.drawingContext.setLineDash([]);
    // Court border
    p.noFill();
    p.stroke(255, 255, 255, 15);
    p.rect(20, 20, W - 40, H - 40, 6);
  }

  function drawPaddle(p, x, y, side, hitFlash, detected) {
    const isFlashing = hitFlash.active && hitFlash.side === side;
    const isP1 = side === "p1";

    // Color: P1 = blue, P2 = pink; dim if hand not detected
    let baseColor = isP1 ? p.color(79, 195, 247) : p.color(240, 98, 146);
    if (!detected) baseColor = p.color(80, 80, 80);
    if (isFlashing) baseColor = p.color(255, 230, 80);

    p.noStroke();
    p.fill(baseColor);
    p.rectMode(p.CENTER);
    p.rect(x, y, PADDLE_W, PADDLE_H, 5);
    p.rectMode(p.CORNER);

    // Glow effect when flashing
    if (isFlashing) {
      p.noFill();
      p.stroke(255, 230, 80, 80);
      p.strokeWeight(6);
      p.rectMode(p.CENTER);
      p.rect(x, y, PADDLE_W + 8, PADDLE_H + 8, 8);
      p.rectMode(p.CORNER);
      p.noStroke();
    }
  }

  function drawBall(p, ball, hitFlash) {
    const isFlashing = hitFlash.active;

    // Trail (simple — draw a faded circle slightly behind)
    p.noStroke();
    p.fill(255, 255, 255, 40);
    p.circle(ball.x - ball.vx * 2, ball.y - ball.vy * 2, 12);

    // Ball
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const r = p.map(speed, 4, 14, 8, 11);  // slightly bigger when faster
    p.fill(isFlashing ? p.color(255, 240, 100) : p.color(230, 230, 200));
    p.circle(ball.x, ball.y, r * 2);
  }

  function drawSpeedBar(p, x, y, speed, align) {
    const maxSpeed = 35;
    const barW = 100;
    const filled = p.constrain(p.map(speed, 0, maxSpeed, 0, barW), 0, barW);

    p.noStroke();
    p.fill(255, 255, 255, 20);
    const bx = align === "left" ? x : x - barW;
    p.rect(bx, y - 6, barW, 6, 3);

    // Color: green → yellow → red based on speed
    const t = filled / barW;
    p.fill(p.lerpColor(p.color(80, 200, 120), p.color(240, 80, 80), t));
    p.rect(bx, y - 6, filled, 6, 3);
  }

  function drawWaitingOverlay(p, hs) {
    const bothReady = hs.p1.detected && hs.p2.detected;
    p.fill(0, 0, 0, 120);
    p.noStroke();
    p.rect(0, 0, W, H);
    p.fill(255);
    p.textSize(18);
    if (!hs.ready) {
      p.text("Loading hand detection...", W / 2, H / 2);
    } else if (!hs.videoReady) {
      p.text("Waiting for camera...", W / 2, H / 2);
    } else if (!hs.p1.detected && !hs.p2.detected) {
      p.text("Show both hands to start", W / 2, H / 2);
    } else if (!hs.p1.detected) {
      p.fill(79, 195, 247);
      p.text("Player 1: show your left hand", W / 2, H / 2);
    } else if (!hs.p2.detected) {
      p.fill(240, 98, 146);
      p.text("Player 2: show your right hand", W / 2, H / 2);
    }
  }

  function drawPointOverlay(p, winner) {
    p.fill(255, 255, 255, 180);
    p.textSize(32);
    const msg = winner === "p1" ? "Player 1 scores!" : "Player 2 scores!";
    const c = winner === "p1" ? p.color(79, 195, 247) : p.color(240, 98, 146);
    p.fill(c);
    p.text(msg, W / 2, H / 2);
  }
});

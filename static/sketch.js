// ── Constants ──────────────────────────────────────────────────────────────
const W = 680, H = 510;
const PADDLE_W = 12, PADDLE_H = 90, PADDLE_OFFSET = 30;
const BALL_R = 10;
const MIN_BALL_SPEED = 4, MAX_BALL_SPEED = 14;
const MAX_HAND_SPEED = 35, SPEED_LERP = 0.4, PADDLE_LERP = 0.2;
const POINT_PAUSE_FRAMES = 90;
const WIN_SCORE = 11;
const GAME_OVER_FRAMES = 180; // 3s then auto-return to menu

// ── Sketch ─────────────────────────────────────────────────────────────────
new p5((p) => {

  // Mode
  let gameMode = "hvh";       // "hvh" | "ai"
  let aiDifficulty = "medium"; // "easy" | "medium" | "hard"

  // Hand tracking
  let video, handPose, hands = [];
  let tracker = {
    p1: { y: H / 2, speed: 0, smoothedSpeed: 0, prevY: H / 2, detected: false },
    p2: { y: H / 2, speed: 0, smoothedSpeed: 0, prevY: H / 2, detected: false },
    modelReady: false,
    videoReady: false,
  };

  // Ball
  let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  let ballTrail = [];

  // Scores
  let scores = { p1: 0, p2: 0 };

  // Game phase: "menu" | "difficulty" | "waiting" | "playing" | "point" | "gameover"
  let gamePhase = "menu";
  let pointWinner = null;
  let pointTimer = 0;
  let gameWinner = null;
  let gameOverTimer = 0;

  // Hit flash
  let hitFlash = { active: false, side: null, timer: 0 };

  // ── Button layout ─────────────────────────────────────────────────────────
  const BTN = {
    hvh:    { x: W / 2 - 195, y: H / 2 - 38, w: 180, h: 70 },
    ai:     { x: W / 2 + 15,  y: H / 2 - 38, w: 180, h: 70 },
    easy:   { x: W / 2 - 260, y: H / 2 - 38, w: 155, h: 70 },
    medium: { x: W / 2 - 78,  y: H / 2 - 38, w: 155, h: 70 },
    hard:   { x: W / 2 + 105, y: H / 2 - 38, w: 155, h: 70 },
    back:   { x: W / 2 - 55,  y: H / 2 + 70, w: 110, h: 38 },
    replay: { x: W / 2 - 185, y: H / 2 + 65, w: 160, h: 52 },
    toMenu: { x: W / 2 + 25,  y: H / 2 + 65, w: 160, h: 52 },
  };

  // ── Setup ─────────────────────────────────────────────────────────────────
  p.setup = function () {
    let cnv = p.createCanvas(W, H);
    cnv.parent("canvas-holder");
    p.textFont("Segoe UI");
    initHandTracking();
    updateLabelsDOM();
  };

  function initHandTracking() {
    video = p.createCapture(p.VIDEO, () => {
      tracker.videoReady = true;
    });
    video.size(W, H);
    video.hide();

    handPose = ml5.handPose(video, { maxHands: 2, flipped: true }, () => {
      tracker.modelReady = true;
      handPose.detectStart(video, (results) => {
        hands = results;
      });
    });
  }

  // ── Mouse input ───────────────────────────────────────────────────────────
  p.mousePressed = function () {
    if (gamePhase === "menu") {
      if (inBtn(BTN.hvh))     { gameMode = "hvh"; startGame(); }
      else if (inBtn(BTN.ai)) { gameMode = "ai";  gamePhase = "difficulty"; }
    } else if (gamePhase === "difficulty") {
      if (inBtn(BTN.easy))        { aiDifficulty = "easy";   startGame(); }
      else if (inBtn(BTN.medium)) { aiDifficulty = "medium"; startGame(); }
      else if (inBtn(BTN.hard))   { aiDifficulty = "hard";   startGame(); }
      else if (inBtn(BTN.back))   { gamePhase = "menu"; }
    }
  };

  function inBtn(btn) {
    return p.mouseX >= btn.x && p.mouseX <= btn.x + btn.w &&
           p.mouseY >= btn.y && p.mouseY <= btn.y + btn.h;
  }

  function startGame() {
    scores = { p1: 0, p2: 0 };
    gameWinner = null;
    updateScoreDOM();
    updateLabelsDOM();
    gamePhase = "waiting";
    updateStatusMsg();
  }

  // Exposed so the nav "Home" button can call it from HTML
  window.goToMenu = function () {
    scores = { p1: 0, p2: 0 };
    gameWinner = null;
    pointWinner = null;
    updateScoreDOM();
    document.getElementById("label-p1").textContent = "Player 1";
    document.getElementById("label-p2").textContent = "Player 2";
    document.getElementById("status-msg").textContent = "";
    gamePhase = "menu";
  };

  // ── Draw loop ─────────────────────────────────────────────────────────────
  p.draw = function () {
    updateHandTracking();
    updateGame();

    p.background(25, 25, 40);
    drawVideoFeed();
    drawNet();
    drawPaddle("p1");
    drawPaddle("p2");
    if (gamePhase === "playing") drawBall();
    drawSpeedBar("p1");
    if (gameMode === "hvh") drawSpeedBar("p2");

    // Overlays
    if (gamePhase === "menu")        drawMenuOverlay();
    else if (gamePhase === "difficulty") drawDifficultyOverlay();
    else if (gamePhase === "waiting")    drawWaitingOverlay();
    else if (gamePhase === "point")      drawPointOverlay();
    else if (gamePhase === "gameover")   drawGameOverOverlay();

    // Tick hit flash
    if (hitFlash.active) {
      hitFlash.timer--;
      if (hitFlash.timer <= 0) hitFlash.active = false;
    }
  };

  // ── Hand Tracking ─────────────────────────────────────────────────────────
  function updateHandTracking() {
    tracker.p1.detected = false;
    if (gameMode === "hvh") tracker.p2.detected = false;

    for (let hand of hands) {
      if (!hand.keypoints || hand.keypoints.length === 0) continue;
      let wrist = hand.keypoints[0];
      let side = wrist.x < W / 2 ? "p1" : "p2";

      // In AI mode, ignore any hand detected on p2's side
      if (gameMode === "ai" && side === "p2") continue;

      let t = tracker[side];
      if (t.detected) continue;
      t.detected = true;

      let rawSpeed = Math.abs(wrist.y - t.prevY);
      t.smoothedSpeed = p.lerp(t.smoothedSpeed, rawSpeed, SPEED_LERP);
      t.speed = p.constrain(t.smoothedSpeed, 0, MAX_HAND_SPEED);
      t.prevY = wrist.y;
      t.y = p.lerp(t.y, wrist.y, PADDLE_LERP);
    }
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  function updateAI() {
    let t = tracker.p2;
    t.detected = true;

    let targetY = ball.y;
    let maxSpeed, lerpFactor;

    if (aiDifficulty === "easy") {
      // Slow + noisy — misses edges
      targetY += p.random(-50, 50);
      maxSpeed = 2.0;
      lerpFactor = 0.04;
    } else if (aiDifficulty === "medium") {
      maxSpeed = 4.0;
      lerpFactor = 0.09;
    } else {
      // Hard — predicts ball position one bounce ahead
      if (ball.vx > 0) {
        let dist = (W - PADDLE_OFFSET - BALL_R) - ball.x;
        let frames = dist / Math.abs(ball.vx);
        let predicted = ball.y + ball.vy * frames;
        // Resolve one wall bounce
        while (predicted < 0 || predicted > H) {
          if (predicted < 0) predicted = -predicted;
          if (predicted > H) predicted = 2 * H - predicted;
        }
        targetY = predicted;
      }
      maxSpeed = 7.5;
      lerpFactor = 0.18;
    }

    let diff = targetY - t.y;
    let move = p.constrain(diff * lerpFactor, -maxSpeed, maxSpeed);
    let newY = t.y + move;

    // Feed movement into speed so ball speed responds to AI "effort"
    t.smoothedSpeed = p.lerp(t.smoothedSpeed, Math.abs(move) * 4, SPEED_LERP);
    t.speed = p.constrain(t.smoothedSpeed, 0, MAX_HAND_SPEED);
    t.prevY = t.y;
    t.y = newY;
  }

  // ── Game Logic ────────────────────────────────────────────────────────────
  function updateGame() {
    if (gamePhase === "menu" || gamePhase === "difficulty") return;

    // AI always tracks, even during point pause (so it's in position)
    if (gameMode === "ai" && gamePhase !== "waiting" && gamePhase !== "gameover") {
      updateAI();
    }

    if (gamePhase === "waiting") {
      updateStatusMsg();
      let ready = gameMode === "ai"
        ? tracker.p1.detected
        : (tracker.p1.detected && tracker.p2.detected);
      if (ready) {
        gamePhase = "playing";
        serveBall();
        updateStatusMsg();
      }
      return;
    }

    if (gamePhase === "point") {
      pointTimer--;
      if (pointTimer <= 0) {
        gamePhase = "playing";
        serveBall();
        updateStatusMsg();
      }
      return;
    }

    if (gamePhase === "gameover") {
      gameOverTimer--;
      if (gameOverTimer <= 0) window.goToMenu();
      return;
    }

    // ── Playing ──
    ballTrail.unshift({ x: ball.x, y: ball.y });
    if (ballTrail.length > 3) ballTrail.pop();

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - BALL_R < 0) { ball.y = BALL_R;     ball.vy =  Math.abs(ball.vy); }
    if (ball.y + BALL_R > H) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy); }

    checkPaddleHit("p1");
    checkPaddleHit("p2");

    if (ball.x - BALL_R < 0)  scorePoint("p2");
    else if (ball.x + BALL_R > W) scorePoint("p1");
  }

  function serveBall() {
    ball.x = W / 2;
    ball.y = H / 2;
    ballTrail = [];
    let dir = Math.random() < 0.5 ? 1 : -1;
    let angle = Math.random() * 0.4 - 0.2;
    ball.vx = dir * 6;
    ball.vy = Math.sin(angle) * 6;
  }

  function checkPaddleHit(player) {
    let t = tracker[player];
    let paddleX, facingRight;
    if (player === "p1") {
      paddleX = PADDLE_OFFSET + PADDLE_W / 2;
      facingRight = true;
    } else {
      paddleX = W - PADDLE_OFFSET - PADDLE_W / 2;
      facingRight = false;
    }

    let paddleLeft   = paddleX - PADDLE_W / 2;
    let paddleRight  = paddleX + PADDLE_W / 2;
    let paddleTop    = t.y - PADDLE_H / 2;
    let paddleBottom = t.y + PADDLE_H / 2;

    let overlap = (ball.x + BALL_R > paddleLeft)  && (ball.x - BALL_R < paddleRight) &&
                  (ball.y + BALL_R > paddleTop)    && (ball.y - BALL_R < paddleBottom);
    let movingToward = facingRight ? ball.vx < 0 : ball.vx > 0;
    if (!overlap || !movingToward) return;

    let newSpeed = mapSpeed(t.speed);
    let hitPos = p.constrain((ball.y - t.y) / (PADDLE_H / 2), -1, 1);
    ball.vx = facingRight ? newSpeed : -newSpeed;
    ball.vy = hitPos * newSpeed * 0.7;

    // Push out to prevent double-hit
    if (facingRight) ball.x = paddleRight + BALL_R + 1;
    else             ball.x = paddleLeft  - BALL_R - 1;

    hitFlash.active = true;
    hitFlash.side = player;
    hitFlash.timer = 8;
  }

  function mapSpeed(hs) {
    return p.map(p.constrain(hs, 0, MAX_HAND_SPEED), 0, MAX_HAND_SPEED, MIN_BALL_SPEED, MAX_BALL_SPEED);
  }

  function scorePoint(winner) {
    scores[winner]++;
    updateScoreDOM();

    if (scores[winner] >= WIN_SCORE) {
      gameWinner = winner;
      gamePhase = "gameover";
      gameOverTimer = GAME_OVER_FRAMES;
    } else {
      pointWinner = winner;
      gamePhase = "point";
      pointTimer = POINT_PAUSE_FRAMES;
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function updateScoreDOM() {
    document.getElementById("score-p1").textContent = scores.p1;
    document.getElementById("score-p2").textContent = scores.p2;
  }

  function updateLabelsDOM() {
    document.getElementById("label-p1").textContent = "Player 1";
    document.getElementById("label-p2").textContent = gameMode === "ai" ? "AI" : "Player 2";
  }

  function updateStatusMsg() {
    let el = document.getElementById("status-msg");
    if (gamePhase === "menu" || gamePhase === "difficulty" ||
        gamePhase === "playing" || gamePhase === "gameover") {
      el.textContent = "";
      return;
    }
    if (gamePhase === "point") return;
    // waiting
    if (!tracker.modelReady || !tracker.videoReady) {
      el.textContent = "Loading…";
    } else if (gameMode === "ai") {
      el.textContent = tracker.p1.detected ? "" : "Show your hand to start";
    } else {
      if      (!tracker.p1.detected && !tracker.p2.detected) el.textContent = "Show both hands to start";
      else if (!tracker.p1.detected) el.textContent = "Waiting for Player 1…";
      else if (!tracker.p2.detected) el.textContent = "Waiting for Player 2…";
      else el.textContent = "";
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function drawVideoFeed() {
    if (!tracker.videoReady) return;
    p.push();
    p.translate(W, 0);
    p.scale(-1, 1);
    p.tint(255, 110);
    p.image(video, 0, 0, W, H);
    p.pop();
  }

  function drawNet() {
    p.push();
    p.noFill();
    p.stroke(40, 40, 60);
    p.strokeWeight(2);
    p.rect(0, 0, W, H);
    p.stroke(60, 60, 90);
    p.strokeWeight(2);
    let dashLen = 14, gapLen = 10;
    for (let y = 0; y < H; y += dashLen + gapLen) {
      p.line(W / 2, y, W / 2, Math.min(y + dashLen, H));
    }
    p.pop();
  }

  function drawPaddle(player) {
    p.push();
    let t = tracker[player];
    let px, col, glowRGB;
    if (player === "p1") {
      px = PADDLE_OFFSET;
      col = t.detected ? p.color(77, 166, 255) : p.color(80, 80, 120);
      glowRGB = [77, 166, 255];
    } else {
      px = W - PADDLE_OFFSET - PADDLE_W;
      col = t.detected ? p.color(255, 110, 180) : p.color(80, 80, 120);
      glowRGB = [255, 110, 180];
    }
    let py = t.y - PADDLE_H / 2;

    if (hitFlash.active && hitFlash.side === player) {
      p.noStroke();
      p.fill(255, 220, 0, 80);
      p.rect(px - 6, py - 6, PADDLE_W + 12, PADDLE_H + 12, 6);
    }
    if (t.detected) {
      p.noStroke();
      p.fill(glowRGB[0], glowRGB[1], glowRGB[2], 40);
      p.rect(px - 4, py - 4, PADDLE_W + 8, PADDLE_H + 8, 5);
    }
    p.noStroke();
    p.fill(col);
    p.rect(px, py, PADDLE_W, PADDLE_H, 4);
    p.pop();
  }

  function drawBall() {
    p.push();
    for (let i = 0; i < ballTrail.length; i++) {
      let alpha = p.map(i, 0, ballTrail.length, 120, 20);
      let r = p.map(i, 0, ballTrail.length, BALL_R * 0.9, BALL_R * 0.4);
      p.noStroke();
      p.fill(245, 235, 210, alpha);
      p.ellipse(ballTrail[i].x, ballTrail[i].y, r * 2, r * 2);
    }
    p.noStroke();
    p.fill(245, 235, 210);
    p.ellipse(ball.x, ball.y, BALL_R * 2, BALL_R * 2);
    p.pop();
  }

  function drawSpeedBar(player) {
    p.push();
    let t = tracker[player];
    let barW = 80, barH = 8;
    let bx = player === "p1" ? 16 : W - 16 - barW;
    let by = H - 20;
    p.noStroke();
    p.fill(30, 30, 50);
    p.rect(bx, by, barW, barH, 3);
    let fillW = p.map(t.speed, 0, MAX_HAND_SPEED, 0, barW);
    let ratio = t.speed / MAX_HAND_SPEED;
    p.fill(p.lerp(80, 255, ratio), p.lerp(200, 60, ratio), 80);
    p.rect(bx, by, fillW, barH, 3);
    p.pop();
  }

  // ── Overlays ──────────────────────────────────────────────────────────────
  function drawMenuOverlay() {
    p.push();
    p.fill(0, 0, 0, 170);
    p.noStroke();
    p.rect(0, 0, W, H);

    p.textAlign(p.CENTER, p.CENTER);
    p.fill(255);
    p.textSize(44);
    p.textStyle(p.BOLD);
    p.text("PICKLEBALL PONG", W / 2, H / 2 - 130);

    p.textSize(17);
    p.textStyle(p.NORMAL);
    p.fill(160, 160, 170);
    p.text("First to 11 wins  ·  Hand speed = ball speed", W / 2, H / 2 - 82);

    drawBtn(BTN.hvh, "Human vs Human", [77, 166, 255]);
    drawBtn(BTN.ai,  "Human vs AI",    [255, 110, 180]);
    p.pop();
  }

  function drawDifficultyOverlay() {
    p.push();
    p.fill(0, 0, 0, 170);
    p.noStroke();
    p.rect(0, 0, W, H);

    p.textAlign(p.CENTER, p.CENTER);
    p.fill(255);
    p.textSize(38);
    p.textStyle(p.BOLD);
    p.text("Choose AI Difficulty", W / 2, H / 2 - 115);

    drawBtn(BTN.easy,   "Easy",   [100, 220, 100]);
    drawBtn(BTN.medium, "Medium", [255, 200, 60]);
    drawBtn(BTN.hard,   "Hard",   [255, 80, 80]);
    drawBtn(BTN.back,   "← Back", [120, 120, 150]);
    p.pop();
  }

  function drawBtn(btn, label, rgb) {
    let hovered = inBtn(btn);
    p.push();
    p.noStroke();
    if (hovered) {
      p.fill(rgb[0], rgb[1], rgb[2], 50);
      p.rect(btn.x - 5, btn.y - 5, btn.w + 10, btn.h + 10, 12);
    }
    p.fill(hovered ? p.color(rgb[0], rgb[1], rgb[2]) : p.color(rgb[0] * 0.4, rgb[1] * 0.4, rgb[2] * 0.4, 220));
    p.rect(btn.x, btn.y, btn.w, btn.h, 8);
    p.fill(hovered ? 0 : 255);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(17);
    p.textStyle(p.BOLD);
    p.text(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    p.pop();
  }

  function drawWaitingOverlay() {
    p.push();
    p.fill(0, 0, 0, 130);
    p.noStroke();
    p.rect(0, 0, W, H);
    p.textAlign(p.CENTER, p.CENTER);

    if (!tracker.modelReady || !tracker.videoReady) {
      p.fill(180, 180, 180);
      p.textSize(26);
      p.textStyle(p.NORMAL);
      p.text("Loading hand tracking…", W / 2, H / 2);
    } else if (gameMode === "ai") {
      p.fill(77, 166, 255);
      p.textSize(22);
      p.textStyle(p.NORMAL);
      p.text(tracker.p1.detected ? "Get ready…" : "Show your hand to start", W / 2, H / 2);
    } else {
      p.textSize(20);
      p.textStyle(p.NORMAL);
      if (!tracker.p1.detected && !tracker.p2.detected) {
        p.fill(200, 200, 200);
        p.text("Show both hands to start", W / 2, H / 2);
      } else if (!tracker.p1.detected) {
        p.fill(77, 166, 255);
        p.text("Player 1: show your hand", W / 4, H / 2);
        p.fill(255, 110, 180, 140);
        p.text("Player 2 ready ✓", 3 * W / 4, H / 2);
      } else {
        p.fill(77, 166, 255, 140);
        p.text("Player 1 ready ✓", W / 4, H / 2);
        p.fill(255, 110, 180);
        p.text("Player 2: show your hand", 3 * W / 4, H / 2);
      }
    }
    p.pop();
  }

  function drawPointOverlay() {
    p.push();
    let alpha = p.map(pointTimer, POINT_PAUSE_FRAMES, 0, 220, 0);
    p.fill(0, 0, 0, alpha * 0.5);
    p.noStroke();
    p.rect(0, 0, W, H);

    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(50);
    p.textStyle(p.BOLD);

    let label, rgb;
    if (pointWinner === "p1") {
      label = "Point — Player 1!";
      rgb = [77, 166, 255];
    } else {
      label = gameMode === "ai" ? "Point — AI!" : "Point — Player 2!";
      rgb = [255, 110, 180];
    }
    p.fill(rgb[0], rgb[1], rgb[2], alpha);
    p.text(label, W / 2, H / 2);

    // Show score tally
    p.textSize(22);
    p.textStyle(p.NORMAL);
    p.fill(200, 200, 200, alpha * 0.7);
    p.text(`${scores.p1}  —  ${scores.p2}`, W / 2, H / 2 + 52);
    p.pop();
  }

  function drawGameOverOverlay() {
    p.push();
    p.fill(0, 0, 0, 210);
    p.noStroke();
    p.rect(0, 0, W, H);

    p.textAlign(p.CENTER, p.CENTER);

    let winLabel, rgb;
    if (gameWinner === "p1") {
      winLabel = "Player 1 Wins!";
      rgb = [77, 166, 255];
    } else {
      winLabel = gameMode === "ai" ? "AI Wins!" : "Player 2 Wins!";
      rgb = [255, 110, 180];
    }

    p.fill(rgb[0], rgb[1], rgb[2]);
    p.textSize(54);
    p.textStyle(p.BOLD);
    p.text(winLabel, W / 2, H / 2 - 40);

    p.fill(200, 200, 200);
    p.textSize(24);
    p.textStyle(p.NORMAL);
    p.text(`${scores.p1}  —  ${scores.p2}`, W / 2, H / 2 + 20);

    let secs = Math.ceil(gameOverTimer / 60);
    p.fill(130, 130, 150);
    p.textSize(16);
    p.text(`Returning to menu in ${secs}…`, W / 2, H / 2 + 65);
    p.pop();
  }

});

(function () {
  "use strict";

  var container = document.getElementById("snitch-pond");
  var canvas = document.getElementById("snitch-pond-canvas");
  if (!container || !canvas) return;

  var ctx = canvas.getContext("2d");
  var reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  var SNITCH_COUNT = 5;
  var FLEE_RADIUS = 85;
  var BODY_RADIUS = 7;

  var width = 0;
  var height = 0;
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var pointer = null; // {x, y} in CSS px, relative to canvas
  var running = false;
  var lastTime = 0;
  var elapsed = 0;
  var rafId = null;
  var isDark = false;

  function readTheme() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resize() {
    var rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /* ---------------- dust motes (ambient background) ---------------- */

  var motes = [];
  function initMotes() {
    motes = [];
    var count = Math.max(10, Math.round((width * height) / 9000));
    for (var i = 0; i < count; i++) {
      motes.push({
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.5, 1.6),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.4, 1.1)
      });
    }
  }

  function drawMotes(t) {
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * m.speed + m.phase));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = isDark
        ? "rgba(255,255,255," + a.toFixed(3) + ")"
        : "rgba(150,110,40," + (a * 0.6).toFixed(3) + ")";
      ctx.fill();
    }
  }

  /* ---------------- sparkle trail particles ---------------- */

  var particles = [];
  function spawnParticle(x, y) {
    particles.push({
      x: x + rand(-2, 2),
      y: y + rand(-2, 2),
      life: 1,
      maxLife: rand(0.4, 0.8),
      r: rand(1, 2.2)
    });
  }

  function updateAndDrawParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(246,201,76," + (p.life * 0.8).toFixed(3) + ")";
      ctx.fill();
    }
  }

  /* ---------------- snitch ---------------- */

  function Snitch() {
    this.x = rand(BODY_RADIUS * 3, Math.max(BODY_RADIUS * 3, width - BODY_RADIUS * 3));
    this.y = rand(BODY_RADIUS * 3, Math.max(BODY_RADIUS * 3, height - BODY_RADIUS * 3));
    this.angle = rand(0, Math.PI * 2);
    this.wander = rand(0, Math.PI * 2);
    this.speed = rand(13, 20);
    this.startled = 0;
    this.wingPhase = rand(0, Math.PI * 2);
    this.bobPhase = rand(0, Math.PI * 2);
  }

  Snitch.prototype.step = function (dt, pointer) {
    this.wander += rand(-1.6, 1.6) * dt;
    var targetAngle = this.angle + Math.sin(this.wander) * 0.5 * dt;
    var fleeing = false;

    if (pointer) {
      var dx = this.x - pointer.x;
      var dy = this.y - pointer.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < FLEE_RADIUS) {
        var strength = 1 - dist / FLEE_RADIUS;
        targetAngle = Math.atan2(dy, dx);
        this.startled = Math.min(1, this.startled + strength * dt * 6);
        fleeing = true;
      }
    }

    if (!fleeing) {
      this.startled = Math.max(0, this.startled - dt * 0.7);
    }

    // ease heading toward target instead of snapping (smoother flight arcs)
    var turnRate = 5 + this.startled * 9;
    var diff = normalizeAngle(targetAngle - this.angle);
    var maxDelta = turnRate * dt;
    if (diff > maxDelta) diff = maxDelta;
    else if (diff < -maxDelta) diff = -maxDelta;
    this.angle += diff;

    var speed = this.speed * (1 + this.startled * 3);
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;

    var margin = BODY_RADIUS * 3;
    if (this.x < margin) {
      this.x = margin;
      this.angle = Math.PI - this.angle;
    } else if (this.x > width - margin) {
      this.x = width - margin;
      this.angle = Math.PI - this.angle;
    }
    if (this.y < margin) {
      this.y = margin;
      this.angle = -this.angle;
    } else if (this.y > height - margin) {
      this.y = height - margin;
      this.angle = -this.angle;
    }

    this.wingPhase += dt * (14 + this.startled * 22);

    if (this.startled > 0.35 && Math.random() < this.startled * dt * 14) {
      spawnParticle(
        this.x - Math.cos(this.angle) * BODY_RADIUS * 1.5,
        this.y - Math.sin(this.angle) * BODY_RADIUS * 1.5
      );
    }
  };

  // side: +1 / -1 selects which of the two wings (mirror pair). Pivot sits
  // just behind the body; the wing points backward-and-outward from there,
  // with `spread` (rest angle + flap oscillation) controlling how far it
  // swings. Computed as explicit points rather than nested canvas
  // transforms, so the two wings can't be made to cross through the body
  // by a sign error in a rotation composition.
  function drawWing(ctx, side, spread) {
    var pivotX = -BODY_RADIUS * 0.4;
    var pivotY = -side * BODY_RADIUS * 0.5;
    var L = BODY_RADIUS * 2.3;
    var W = BODY_RADIUS * 1.1;

    var angle = Math.PI + side * spread;
    var dirX = Math.cos(angle);
    var dirY = Math.sin(angle);
    var perpX = -dirY;
    var perpY = dirX;

    var tipX = pivotX + dirX * L;
    var tipY = pivotY + dirY * L;
    var c1x = pivotX + dirX * L * 0.4 + perpX * W;
    var c1y = pivotY + dirY * L * 0.4 + perpY * W;
    var c2x = pivotX + dirX * L * 0.6 - perpX * W * 0.25;
    var c2y = pivotY + dirY * L * 0.6 - perpY * W * 0.25;

    var grad = ctx.createLinearGradient(pivotX, pivotY, tipX, tipY);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.55, "rgba(232,234,248,0.55)");
    grad.addColorStop(1, "rgba(232,234,248,0)");

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.quadraticCurveTo(c1x, c1y, tipX, tipY);
    ctx.quadraticCurveTo(c2x, c2y, pivotX, pivotY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(160,160,195,0.30)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // faint feather veins
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.4;
    for (var i = 1; i <= 2; i++) {
      var f = i / 3;
      var vx = pivotX + dirX * L * f;
      var vy = pivotY + dirY * L * f;
      ctx.beginPath();
      ctx.moveTo(pivotX + dirX * L * f * 0.2, pivotY + dirY * L * f * 0.2);
      ctx.quadraticCurveTo(
        pivotX + dirX * L * f * 0.7 + perpX * W * 0.3 * f,
        pivotY + dirY * L * f * 0.7 + perpY * W * 0.3 * f,
        vx,
        vy
      );
      ctx.stroke();
    }
  }

  Snitch.prototype.draw = function (ctx, t) {
    var bob = Math.sin(t * 2.4 + this.bobPhase) * 1.1 * (1 - this.startled * 0.7);

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    // wings, oriented with heading, flapping on a hinge
    var flap = Math.sin(this.wingPhase);
    var amplitude = 0.45 + this.startled * 0.3;
    var restSpread = 0.5;

    ctx.save();
    ctx.rotate(this.angle);
    drawWing(ctx, 1, restSpread + flap * amplitude);
    drawWing(ctx, -1, restSpread + flap * amplitude);
    ctx.restore();

    // soft golden glow behind the body
    ctx.save();
    ctx.shadowColor = "rgba(238,186,58,0.85)";
    ctx.shadowBlur = 9;

    var bodyGrad = ctx.createRadialGradient(
      -BODY_RADIUS * 0.35, -BODY_RADIUS * 0.35, 0.4,
      0, 0, BODY_RADIUS
    );
    bodyGrad.addColorStop(0, "#fffaea");
    bodyGrad.addColorStop(0.38, "#f4cd58");
    bodyGrad.addColorStop(0.75, "#d9a520");
    bodyGrad.addColorStop(1, "#a3760f");

    ctx.beginPath();
    ctx.arc(0, 0, BODY_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(110,78,10,0.45)";
    ctx.beginPath();
    ctx.arc(0, 0, BODY_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // specular highlight, fixed relative to the light source (not to heading)
    var hlGrad = ctx.createRadialGradient(
      -BODY_RADIUS * 0.4, -BODY_RADIUS * 0.4, 0,
      -BODY_RADIUS * 0.4, -BODY_RADIUS * 0.4, BODY_RADIUS * 0.6
    );
    hlGrad.addColorStop(0, "rgba(255,255,255,0.85)");
    hlGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(-BODY_RADIUS * 0.4, -BODY_RADIUS * 0.4, BODY_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = hlGrad;
    ctx.fill();

    ctx.restore();
  };

  var snitches = [];

  function init() {
    isDark = readTheme();
    resize();
    initMotes();
    snitches = [];
    for (var i = 0; i < SNITCH_COUNT; i++) {
      snitches.push(new Snitch());
    }
    if (reducedMotion) {
      drawStatic();
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);
    drawMotes(0);
    for (var i = 0; i < snitches.length; i++) {
      snitches[i].draw(ctx, 0);
    }
  }

  function frame(t) {
    if (!running) return;
    var dt = lastTime ? Math.min(0.05, (t - lastTime) / 1000) : 0;
    lastTime = t;
    elapsed += dt;

    ctx.clearRect(0, 0, width, height);
    drawMotes(elapsed);
    updateAndDrawParticles(dt);
    for (var i = 0; i < snitches.length; i++) {
      snitches[i].step(dt, pointer);
      snitches[i].draw(ctx, elapsed);
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function pointerPos(evt) {
    var rect = canvas.getBoundingClientRect();
    var clientX = evt.clientX;
    var clientY = evt.clientY;
    if (evt.touches && evt.touches.length) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  container.addEventListener(
    "pointermove",
    function (evt) {
      pointer = pointerPos(evt);
    },
    { passive: true }
  );
  container.addEventListener(
    "pointerleave",
    function () {
      pointer = null;
    },
    { passive: true }
  );
  container.addEventListener(
    "touchmove",
    function (evt) {
      pointer = pointerPos(evt);
    },
    { passive: true }
  );
  container.addEventListener(
    "touchend",
    function () {
      pointer = null;
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stop();
    } else if (inView) {
      start();
    }
  });

  var inView = false;
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden) {
          start();
        } else {
          stop();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(container);
  } else {
    inView = true;
    start();
  }

  if ("MutationObserver" in window) {
    var themeObserver = new MutationObserver(function () {
      isDark = readTheme();
      if (reducedMotion) drawStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
  }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      initMotes();
      if (reducedMotion) drawStatic();
    }, 150);
  });

  init();
})();

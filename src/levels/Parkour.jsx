import { useEffect, useRef, useState, useCallback } from "react";

const RED = "#dc2626";
const RED_DARK = "#991b1b";

export default function Parkour({ onComplete }) {
  // --- Canvas / Fullscreen
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // --- UI state
  const [level, setLevel] = useState(1);
  const [started, setStarted] = useState(false);
  const [message, setMessage] = useState("");
  const [usedJoker, setUsedJoker] = useState(false);

  // Progression interne (persistance)
  const [maxUnlocked, setMaxUnlocked] = useState(() => {
    const v = parseInt(localStorage.getItem("parkour_max_unlocked") || "1", 10);
    return isNaN(v) ? 1 : Math.min(3, Math.max(1, v));
  });
  useEffect(() => {
    localStorage.setItem("parkour_max_unlocked", String(maxUnlocked));
  }, [maxUnlocked]);

  // --- World constants
  const W = 900;
  const H = 420;
  const GROUND_Y = H - 70;

  // --- Player
  const player = useRef({
    x: 140,
    y: GROUND_Y - 44,
    w: 28,
    h: 44,
    vy: 0,
    onGround: true,
    canDouble: true,
    sliding: false,
  });

  // --- World refs
  const boxes = useRef([]);  // {x,y,w,h}
  const bars  = useRef([]);  // {x,y,w,h}
  const gaps  = useRef([]);  // {x,w}
  const tags  = useRef([]);  // {x,y,r}
  const speed = useRef(4.2);
  const spawnCd = useRef(0);
  const distance = useRef(0);
  const collected = useRef(0);
  const keys = useRef({});

  // --- Level config
  const cfgRef = useRef({ base: 4.2, spawnMin: 95, spawnMax: 135, dGoal: 800, cGoal: 6 });
  function applyLevel(lvl) {
    if (lvl === 1) cfgRef.current = { base: 4.2, spawnMin: 95,  spawnMax: 135, dGoal: 800,  cGoal: 6 };
    else if (lvl === 2) cfgRef.current = { base: 5.0, spawnMin: 85,  spawnMax: 120, dGoal: 1000, cGoal: 8 };
    else               cfgRef.current = { base: 5.8, spawnMin: 75,  spawnMax: 105, dGoal: 1200, cGoal: 10 };
  }

  // --- Audio (bips)
  const audioCtx = useRef(null);
  useEffect(() => { try { audioCtx.current = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }, []);
  const beep = useCallback((f=620, d=0.06, g=0.05) => {
    const ctx = audioCtx.current; if (!ctx) return;
    const o = ctx.createOscillator(); const gn = ctx.createGain();
    o.type = "square"; o.frequency.value = f;
    o.connect(gn).connect(ctx.destination);
    gn.gain.setValueAtTime(g, ctx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
    o.start(); o.stop(ctx.currentTime + d);
  }, []);

  // --- Joker
  const invincibleUntil = useRef(0);
  const isInvincible = () => performance.now() < invincibleUntil.current;
  const unlockNextLevel = useCallback((reason = "win") => {
    setMaxUnlocked((m) => {
      const next = Math.min(3, level + 1);
      if (next > m) {
        setMessage(reason === "joker" ? `🔓 Niveau ${next} débloqué grâce au Joker` : `🏁 Bravo ! Niveau ${next} débloqué`);
      }
      return Math.max(m, next);
    });
  }, [level]);

  const useJoker = () => {
    if (usedJoker || !started) return;
    setUsedJoker(true);
    invincibleUntil.current = performance.now() + 4000; // bouclier 4s
    unlockNextLevel("joker"); // ★ débloque directement le niveau suivant
    beep(900, 0.12, 0.06);
    // On laisse la partie en cours ; le joueur reste invincible 4s
  };

  // --- Utils
  const rand = (a,b)=> a + Math.random()*(b-a);
  const aabb = (a,b)=> a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // --- Fullscreen helpers
  const enterFullscreen = useCallback(async () => {
    try {
      const el = wrapperRef.current;
      if (el && !document.fullscreenElement) await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.call(el));
    } catch {}
  }, []);
  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
    } catch {}
  }, []);

  // --- Prepare / Reset run
  function prepareRun(forcedLevel) {
    const lvl = forcedLevel ?? level;
    applyLevel(lvl);

    boxes.current = [];
    bars.current  = [];
    gaps.current  = [];
    tags.current  = [];
    distance.current  = 0;
    collected.current = 0;
    speed.current = cfgRef.current.base;
    spawnCd.current = 30;

    const p = player.current;
    p.x = 140; p.y = GROUND_Y - 44; p.w = 28; p.h = 44;
    p.vy = 0; p.onGround = true; p.canDouble = true; p.sliding = false;

    setUsedJoker(false);
    invincibleUntil.current = 0;
    setMessage("");
    setStarted(false);
  }
  useEffect(() => { prepareRun(level); }, [level]);

  // Si la progression baisse (ex. storage vidé), clamp le niveau courant
  useEffect(() => {
    if (level > maxUnlocked) { setLevel(maxUnlocked); prepareRun(maxUnlocked); }
  }, [maxUnlocked]); // eslint-disable-line

  // --- Lock scroll quand on joue
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    if (started) { document.documentElement.style.overflow = "hidden"; document.body.style.overflow = "hidden"; }
    return () => { document.documentElement.style.overflow = prevHtml; document.body.style.overflow = prevBody; };
  }, [started]);

  // --- Inputs clavier
  useEffect(() => {
    const onDown = (e) => {
      // Démarrer avec Espace
      if (!started && (e.code === "Space" || e.key === " ")) { e.preventDefault(); startRun(); return; }
      if (!started) return;

      // Bloquer le scroll
      const block = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","PageUp","PageDown"];
      if (block.includes(e.code) || block.includes(e.key)) e.preventDefault();

      keys.current[e.code] = true;
      if (e.code === "KeyR") { beep(300,0.08); prepareRun(level); startRun(); }

      // Saut ↑ / W (double-saut ok)
      const p = player.current;
      if ((e.code === "ArrowUp" || e.code === "KeyW") && (p.onGround || p.canDouble)) {
        p.vy = -12;
        if (!p.onGround) p.canDouble = false;
        p.onGround = false;
        beep(760,0.05,0.04);
      }
    };
    const onUp = (e) => { keys.current[e.code] = false; };

    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [started, level, beep]);

  // --- Start / Stop
  const startRun = useCallback(async () => { await enterFullscreen(); setStarted(true); setMessage(""); }, [enterFullscreen]);
  const stopRun  = useCallback(async () => { setStarted(false); await exitFullscreen(); setMessage(""); prepareRun(level); }, [exitFullscreen, level]);

  // --- GAME LOOP (update + draw)
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    let last = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // UPDATE
      if (started) {
        // vitesse évolutive
        const base = cfgRef.current.base;
        const d = distance.current;
        speed.current = base + (d > cfgRef.current.dGoal * 0.6 ? 0.6 : d > cfgRef.current.dGoal * 0.3 ? 0.3 : 0);

        // spawn
        spawnCd.current -= 1;
        if (spawnCd.current <= 0) {
          const r = Math.random();
          if (r < 0.5) {
            const w = rand(28, 42), h = rand(28, 54);
            boxes.current.push({ x: W + 30, y: GROUND_Y - h, w, h });
            if (Math.random() < 0.5) tags.current.push({ x: W + 30 + w + rand(60,120), y: GROUND_Y - 90, r: 10 });
          } else if (r < 0.8) {
            const y = GROUND_Y - rand(62, 78);
            bars.current.push({ x: W + 30, y, w: rand(80, 120), h: 16 });
          } else {
            const minW = level === 1 ? 70 : level === 2 ? 90 : 110;
            const maxW = level === 1 ? 110 : level === 2 ? 130 : 150;
            gaps.current.push({ x: W + 30, w: rand(minW, maxW) });
          }
          spawnCd.current = Math.floor(rand(cfgRef.current.spawnMin, cfgRef.current.spawnMax));
        }

        // sliding (↓ / Shift)
        const p = player.current;
        const sliding = keys.current.ArrowDown || keys.current.ShiftLeft || keys.current.ShiftRight;
        if (sliding && p.onGround) { p.sliding = true; p.h = 26; } else { p.sliding = false; p.h = 44; }

        // sol (trous)
        let ground = GROUND_Y;
        for (const g of gaps.current) {
          if (p.x + p.w > g.x && p.x < g.x + g.w) { ground = H + 200; break; }
        }

        // gravité
        p.vy += 0.7;
        p.y += p.vy;
        if (p.y + p.h >= ground) {
          p.y = ground - p.h; p.vy = 0; p.onGround = ground === GROUND_Y;
          if (p.onGround) p.canDouble = true;
        } else p.onGround = false;

        // monde qui défile
        const vx = speed.current * (dt * 60);
        boxes.current.forEach(b => b.x -= vx);
        bars.current.forEach(b => b.x -= vx);
        gaps.current.forEach(g => g.x -= vx);
        tags.current.forEach(t => t.x -= vx);

        // collisions (sauf invincible)
        const inv = isInvincible();
        const hitObstacle =
          boxes.current.some(b => aabb(p, b)) ||
          (!p.sliding && bars.current.some(b => aabb(p, b)));
        if (!inv && (hitObstacle || p.y > H)) {
          beep(320,0.08);
          prepareRun(level);
          setMessage("❌ Raté… Tu as heurté un obstacle. ▶ Play ou R pour rejouer.");
          exitFullscreen();
        }

        // collectes
        for (let i = tags.current.length - 1; i >= 0; i--) {
          const t = tags.current[i];
          const cx = t.x, cy = t.y, r = t.r;
          const nx = Math.max(p.x, Math.min(cx, p.x + p.w));
          const ny = Math.max(p.y, Math.min(cy, p.y + p.h));
          if ((cx - nx) ** 2 + (cy - ny) ** 2 <= r ** 2) {
            tags.current.splice(i, 1);
            collected.current += 1;
            beep(860,0.05,0.05);
          }
        }

        // progression + victoire
        distance.current += speed.current * dt * 10;
        if (distance.current >= cfgRef.current.dGoal || collected.current >= cfgRef.current.cGoal) {
          unlockNextLevel("win");                             // ★ débloque via réussite
          setMessage("🏁 Bien joué ! Niveau réussi.");
          beep(900,0.12,0.06);
          setStarted(false);
          exitFullscreen();
          setTimeout(() => onComplete?.(), 600);
        }
      }

      // DRAW (fond -> monde -> HUD)
      const ctx = c.getContext("2d");
      // fond
      ctx.fillStyle = "#0c1220";
      ctx.fillRect(0, 0, W, H);
      // immeubles (parallax)
      ctx.fillStyle = "rgba(255,255,255,.06)";
      for (let i = 0; i < 8; i++) {
        const bw = 80 + (i % 3) * 30;
        const bh = 80 + (i * 18);
        const bx = (i * 140 - (distance.current * 2) % 140) + 40;
        ctx.fillRect(bx, H - bh - 70, bw, bh);
      }
      // sol
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      // trous
      ctx.fillStyle = "#0b1020";
      gaps.current.forEach(g => ctx.fillRect(g.x, GROUND_Y, g.w, H - GROUND_Y));
      // obstacles
      ctx.fillStyle = "#e5e7eb";
      boxes.current.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
      // barres
      ctx.fillStyle = "#ef4444";
      bars.current.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
      // balises
      ctx.fillStyle = "#22c55e";
      tags.current.forEach(t => { ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI*2); ctx.fill(); });
      // joueur
      const p = player.current;
      if (isInvincible()) { ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 22; }
      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.shadowBlur = 0;

      // HUD
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillRect(16, 16, 310, 112);
      ctx.strokeStyle = "rgba(0,0,0,.15)";
      ctx.strokeRect(16, 16, 310, 112);
      ctx.fillStyle = "#111";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`Niveau : ${level} (débloqué max : ${maxUnlocked})`, 26, 36);
      ctx.fillText(`Distance : ${Math.floor(distance.current)} m / ${cfgRef.current.dGoal} m`, 26, 56);
      ctx.fillText(`Balises : ${collected.current} / ${cfgRef.current.cGoal}`, 26, 76);
      const left = Math.max(0, (invincibleUntil.current - performance.now()) / 1000);
      ctx.fillStyle = left > 0 ? "#b45309" : "#6b7280";
      ctx.fillText(`Joker bouclier : ${left > 0 ? left.toFixed(1) + "s" : "inactif"}`, 26, 96);

      // Hint pause
      if (!started) {
        ctx.fillStyle = "rgba(255,255,255,.06)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("▶ Play ou Espace pour commencer", W/2, H/2);
        ctx.textAlign = "left";
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, level, beep, onComplete, unlockNextLevel, exitFullscreen, maxUnlocked]);

  // --- UI
  return (
    <div
      ref={wrapperRef}
      style={{
        minHeight: "100svh",
        width: "100vw",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0 24px",
        background: "#fff",
      }}
    >
      {/* Bandeau */}
      <div
        style={{
          background: "rgba(220,38,38,.12)",
          border: `1px solid ${RED}`,
          color: RED_DARK,
          borderRadius: 14,
          textAlign: "center",
          padding: "18px 16px",
          marginBottom: 14,
          width: "100%",
          maxWidth: 980,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, color: RED }}>Parkour — Runner urbain</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Évite obstacles et trous, <b>saute</b> (↑/W) avec <b>double-saut</b>, et <b>glisse</b> (↓/Shift).
          Atteins la distance cible ou collecte assez de balises pour gagner. <b>R</b> pour rejouer.
        </div>
      </div>

      {/* Contrôles */}
      <div style={{ width: "100%", maxWidth: 980, marginBottom: 12, padding: "0 6px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontWeight: 700 }}>Niveau :</span>
          {[1, 2, 3].map((n) => {
            const locked = n > maxUnlocked;
            return (
              <button
                key={n}
                onClick={() => { if (!locked) { setLevel(n); prepareRun(n); } }}
                disabled={locked}
                style={{
                  padding: "6px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${n === level ? RED : "#e5e7eb"}`,
                  background: locked ? "#f3f4f6" : n === level ? "rgba(220,38,38,.1)" : "#fff",
                  color: locked ? "#9ca3af" : "#111",
                  fontWeight: 800,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
                title={locked ? "Termine le niveau précédent (ou utilise un Joker) pour le débloquer" : `Aller au niveau ${n}`}
                aria-pressed={n === level}
              >
                {locked ? `🔒 ${n}` : n}
              </button>
            );
          })}

          {!started ? (
            <button
              onClick={startRun}
              style={{ marginLeft: 10, padding: "8px 12px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 800 }}
              title="Espace pour démarrer"
            >
              ▶ Play
            </button>
          ) : (
            <button
              onClick={() => { prepareRun(level); startRun(); }}
              style={{ marginLeft: 10, padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
              title="Raccourci : R"
            >
              Rejouer
            </button>
          )}

          <button
            onClick={stopRun}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
          >
            ⏹ Stop
          </button>

          <button
            onClick={useJoker}
            disabled={usedJoker || !started}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${RED}`,
              background: usedJoker ? "#f3f4f6" : "rgba(220,38,38,.06)",
              color: usedJoker ? "#9ca3af" : RED_DARK,
              fontWeight: 800,
              cursor: usedJoker || !started ? "not-allowed" : "pointer",
            }}
            title="Bouclier d’invincibilité 4s et débloque le niveau suivant"
          >
            🎟️ Joker (bouclier + débloque)
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
          Niv 1 : lent — Niv 2 : moyen — Niv 3 : plus rapide.
        </p>
      </div>

      {/* Canvas */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            width: "min(96vw, 1100px)",
            maxWidth: 1100,
            aspectRatio: `${W} / ${H}`,
            display: "block",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#0b1020",
          }}
        />
      </div>

      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
        ↑/W : sauter (double-saut) • ↓/Shift : glisser • R : rejouer
      </div>

      {message && (
        <div style={{ marginTop: 8, fontWeight: 800, color: message.startsWith("🏁") || message.startsWith("🔓") ? "#16a34a" : "#ef4444", textAlign: "center" }}>
          {message}
        </div>
      )}
    </div>
  );
}


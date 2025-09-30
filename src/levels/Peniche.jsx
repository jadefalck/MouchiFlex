// src/levels/PenicheSimple.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";

const RED = "#dc2626";
const RED_DARK = "#991b1b";

/*
  PÉNICHE — CANAL RUNNER (CHAOS) — v2
  ✅ 3 niveaux avec difficulté croissante
  ✅ Verrou des niveaux : on ne peut sélectionner que ≤ niveau max débloqué
  ✅ Déblocage du niveau suivant uniquement après réussite
  ✅ Progression persistée: localStorage ("peniche_maxLevel")
  ✅ Fin N3: onComplete() + déblocage du jeu suivant dans localStorage ("mouchiflex_unlockedGames")
  Joker (1x/niveau) : 3s d'invincibilité + portiques élargis (+40px) pendant l'effet
*/

const LS_PENICHE_LEVEL = "peniche_maxLevel";
const LS_GAMES = "mouchiflex_unlockedGames";
const ORDER = ["peniche", "trompette", "cuisine", "parkour", "cinema", "ken"];

export default function Peniche({ onComplete /* optionnel */ }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // ----- Progression PERSISTÉE -----
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(LS_PENICHE_LEVEL) || "1", 10);
      return isNaN(v) ? 1 : Math.min(Math.max(v, 1), 3);
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_PENICHE_LEVEL, String(maxUnlockedLevel)); } catch {}
  }, [maxUnlockedLevel]);

  // UI
  const [level, setLevel] = useState(() => Math.min(1, 3)); // 1..3 (affiché)
  useEffect(() => {
    // Si le localStorage dit qu'on a déjà débloqué plus haut, place le niveau courant sur le max
    setLevel((prev) => Math.min(prev, maxUnlockedLevel));
  }, [maxUnlockedLevel]);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null); // 'win' | 'lose' | null
  const [msg, setMsg] = useState("");

  // scène
  const W = 1000, H = 560;
  const canalTop = 140, canalBot = 420;

  // bateau
  const boat = useRef({ x: 180, y: 280, targetY: 280, r: 14 });

  // vitesse (défilement monde)
  const speed = useRef(180);
  const baseSpeed = useRef(180);
  const accelUp = 1.15;
  const accelDown = 0.80;
  const brakeFactor = 0.55;
  const keys = useRef({});

  // course (portiques)
  const gates = useRef([]); // { x, centerY, gap, counted }
  const totalGates = useRef(0);
  const passedCount = useRef(0);

  // obstacles
  const obstacles = useRef([]); // { type, x, y, r, color, baseY, amp, phase, freq, vxSelf }

  // pointeur (souris/touch)
  const pointer = useRef({ has: false, y: 280 });

  // Joker
  const jokerUsed = useRef(false);
  const jokerUntil = useRef(0); // timestamp (ms). Si > now => invincible + gaps élargis

  /* ---------- Préparation par niveau ---------- */
  const makeCourse = useCallback((lvl) => {
    const cfg = {
      gap:        lvl === 1 ? 155 : lvl === 2 ? 130 : 105,
      base:       lvl === 1 ? 200 : lvl === 2 ? 235 : 270,
      count:      lvl === 1 ? 11  : lvl === 2 ? 13  : 15,
      spacing:    250,
      obsPerSeg:  lvl === 1 ? [2,3] : lvl === 2 ? [3,4] : [4,5],
      vxKayak:    lvl === 1 ? 120 : lvl === 2 ? 150 : 185,
      vxLog:      lvl === 1 ? 35  : lvl === 2 ? 50  : 65,
      patrolAmp:  lvl === 1 ? 42  : lvl === 2 ? 56  : 68,
      patrolFreq: lvl === 1 ? 1.5 : lvl === 2 ? 1.8 : 2.2,
    };

    // Portiques
    const arr = [];
    let x = W + 240;
    let cy = 280;
    for (let i = 0; i < cfg.count; i++) {
      cy += (Math.random() * 220 - 110);
      const margin = cfg.gap / 2 + 22;
      cy = clamp(cy, canalTop + margin, canalBot - margin);
      arr.push({ x, centerY: cy, gap: cfg.gap, counted: false });
      x += cfg.spacing + Math.random() * 80;
    }

    // Obstacles
    const obs = [];
    const segs = arr.length;
    for (let i = 0; i < segs; i++) {
      const x0 = (i === 0) ? W + 80 : arr[i - 1].x + 40;
      const x1 = arr[i].x - 40;
      const n = randInt(cfg.obsPerSeg[0], cfg.obsPerSeg[1]);
      for (let k = 0; k < n; k++) {
        const t = Math.random();
        const ox = lerp(x0, x1, t);
        const choice = Math.random();
        if (choice < 0.32) {
          const y = rand(canalTop + 26, canalBot - 26);
          obs.push({ type: "buoy", x: ox, y, r: 12, color: "#f59e0b", baseY: y, amp: 0, phase: 0, freq: 0, vxSelf: 0 });
        } else if (choice < 0.62) {
          const y = rand(canalTop + 30, canalBot - 30);
          obs.push({ type: "log", x: ox, y, r: 16, color: "#b45309", baseY: y, amp: 12, phase: Math.random() * Math.PI * 2, freq: 1.5, vxSelf: -cfg.vxLog });
        } else if (choice < 0.90) {
          const up = Math.random() < 0.5;
          const y = up ? canalTop + 30 : canalBot - 30;
          const vx = (Math.random() < 0.5 ? -1 : 1) * cfg.vxKayak;
          obs.push({ type: "kayak", x: ox, y, r: 14, color: "#fb7185", baseY: y, amp: 24, phase: Math.random() * 6.28, freq: 1.9, vxSelf: vx });
        } else {
          const y = rand(canalTop + 40, canalBot - 40);
          obs.push({ type: "patrol", x: ox, y, r: 18, color: "#60a5fa", baseY: y, amp: cfg.patrolAmp, phase: Math.random() * 6.28, freq: cfg.patrolFreq, vxSelf: 0 });
        }
      }
    }

    return { gates: arr, obstacles: obs, cfg };
  }, []);

  const prepare = useCallback((lvl) => {
    const { gates: G, obstacles: O, cfg } = makeCourse(lvl);
    gates.current = G;
    totalGates.current = G.length;
    passedCount.current = 0;
    obstacles.current = O;

    boat.current.y = 280;
    boat.current.targetY = 280;

    baseSpeed.current = cfg.base;
    speed.current = cfg.base;

    jokerUsed.current = false;
    jokerUntil.current = 0;

    setMsg("");
    setResult(null);
  }, [makeCourse]);

  useEffect(() => { prepare(level); }, [prepare, level]);

  /* ---------- Clavier + blocage scroll ---------- */
  useEffect(() => {
    const down = (e) => {
      const active = started && !paused && !result;
      const block = new Set(["ArrowUp","ArrowDown","Space","PageUp","PageDown","Home","End"]);
      // Espace : si partie non démarrée → DEMARRE. Sinon (en jeu) = frein fort
      if (e.code === "Space" && !started && !result) {
        e.preventDefault();
        setStarted(true);
        setPaused(false);
        setMsg("Reste dans le vert et évite tout !");
        return;
      }

      if (active && block.has(e.code)) e.preventDefault();
      keys.current[e.code] = true;

      if (e.code === "KeyP" && started && !result) { setPaused(p => !p); }
      if (e.code === "KeyR") { prepare(level); setStarted(true); setPaused(false); setMsg("Reste dans le vert et évite tout !"); }
    };
    const up = (e) => { keys.current[e.code] = false; };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started, paused, result, level, prepare]);

  useEffect(() => {
    const active = started && !paused && !result;
    const prev = document.body.style.overflow;
    if (active) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    const prevent = (e) => active ? e.preventDefault() : undefined;
    if (active) {
      window.addEventListener("wheel", prevent, { passive: false });
      window.addEventListener("touchmove", prevent, { passive: false });
    }
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("wheel", prevent);
      window.removeEventListener("touchmove", prevent);
    };
  }, [started, paused, result]);

  /* ---------- Pointeur souris/touch ---------- */
  useEffect(() => {
    const c = canvasRef.current;
    const getY = (ev) => {
      const r = c.getBoundingClientRect();
      const t = ev.touches?.[0];
      const cy = t ? t.clientY : ev.clientY;
      const y = ((cy - r.top) / r.height) * c.height;
      return y;
    };
    const enter = (e) => { pointer.current.has = true; pointer.current.y = getY(e); };
    const move = (e) => { pointer.current.has = true; pointer.current.y = getY(e); };
    const leave = () => { pointer.current.has = false; };

    c.addEventListener("mouseenter", enter);
    c.addEventListener("mousemove", move);
    c.addEventListener("mouseleave", leave);
    c.addEventListener("touchstart", enter, { passive: true });
    c.addEventListener("touchmove", move, { passive: true });
    c.addEventListener("touchend", leave, { passive: true });
    return () => {
      c.removeEventListener("mouseenter", enter);
      c.removeEventListener("mousemove", move);
      c.removeEventListener("mouseleave", leave);
      c.removeEventListener("touchstart", enter);
      c.removeEventListener("touchmove", move);
      c.removeEventListener("touchend", leave);
    };
  }, []);

  /* ---------- Boucle ---------- */
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    let last = performance.now() / 1000;

    const loop = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.033, now - last);
      last = now;

      // fond
      ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
      // canal
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, canalTop, W, canalBot - canalTop);

      if (started && !paused && !result) {
        // vitesse
        let factor = 1;
        if (keys.current.ArrowUp) factor *= accelUp;
        if (keys.current.ArrowDown) factor *= accelDown;
        if (keys.current.Space) factor *= brakeFactor;
        const target = baseSpeed.current * factor;
        speed.current += (target - speed.current) * Math.min(1, dt * 4);

        // viser la position du pointeur
        const aimY = pointer.current.has ? pointer.current.y : boat.current.targetY;
        boat.current.targetY = aimY;
        boat.current.y += (boat.current.targetY - boat.current.y) * Math.min(1, dt * 6);

        // berges = mort (sauf joker invincible)
        const invincible = performance.now() < jokerUntil.current;
        if (!invincible) {
          if (boat.current.y < canalTop + boat.current.r || boat.current.y > canalBot - boat.current.r) {
            setResult("lose"); setMsg("Touché la berge !");
          }
        } else {
          boat.current.y = clamp(boat.current.y, canalTop + boat.current.r, canalBot - boat.current.r);
        }

        // avancer le monde
        for (const g of gates.current) g.x -= speed.current * dt;

        for (const o of obstacles.current) {
          o.x -= speed.current * dt;
          o.x += (o.vxSelf || 0) * dt;
          if (o.amp && o.freq) {
            o.phase += o.freq * dt;
            o.y = o.baseY + o.amp * Math.sin(o.phase);
          }
        }

        // PASSAGE PORTIQUES
        const gapBonus = invincible ? 40 : 0;
        const bx = boat.current.x;
        for (const g of gates.current) {
          if (!g.counted && g.x < bx + 6) {
            const within = Math.abs(boat.current.y - g.centerY) <= ((g.gap + gapBonus) / 2 - 10);
            if (within) {
              passedCount.current += 1;
              setMsg(`Bien ! ${passedCount.current}/${totalGates.current}`);
            } else if (!invincible) {
              setResult("lose");
              setMsg("Raté l’ouverture !");
            } else {
              passedCount.current += 1;
              setMsg(`(Joker) OK — ${passedCount.current}/${totalGates.current}`);
            }
            g.counted = true;
          }
        }

        // COLLISIONS
        if (!invincible) {
          const br = boat.current.r;
          for (const o of obstacles.current) {
            if (o.x < -60 || o.x > W + 200) continue;
            const dx = o.x - boat.current.x;
            const dy = o.y - boat.current.y;
            const rr = (o.r + br) * (o.r + br);
            if (dx * dx + dy * dy <= rr) {
              setResult("lose");
              setMsg("Collision !");
              break;
            }
          }
        }

        // victoire
        if (passedCount.current >= totalGates.current && !result) {
          setResult("win");
          setMsg("Arrivée !");
          handleWinLevel();
        }
      }

      // dessin
      for (const g of gates.current) drawGate(ctx, g, canalTop, canalBot, performance.now() < jokerUntil.current ? 40 : 0);
      for (const o of obstacles.current) drawObstacle(ctx, o);
      drawBoat(ctx, boat.current);
      drawHUD(ctx, {
        speed: speed.current,
        passed: passedCount.current,
        total: totalGates.current,
        level,
        joker: jokerUsed.current,
        inv: performance.now() < jokerUntil.current
      });

      if (!started && !result) drawOverlay(ctx, "ESPACE ou ▶ Play — Glisse haut/bas • Passe dans le VERT • Évite tout");
      if (paused)   drawOverlay(ctx, "⏸ Pause — P pour reprendre");
      if (result === "win" && level === 3)  drawOverlay(ctx, "✅ Dernier niveau réussi !");
      if (result === "lose") drawOverlay(ctx, "❌ Perdu");

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, paused, result, level]); // prepare est appelé ailleurs

  /* ---------- Utils ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- Déblocage jeux (global) ---------- */
  const unlockNextGameGlobally = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_GAMES);
      const arr = raw ? JSON.parse(raw) : [ORDER[0]];
      const has = (id) => arr.includes(id);
      // s'assurer que peniche est dans la liste
      if (!has("peniche")) arr.push("peniche");
      // débloquer "trompette"
      const idx = ORDER.indexOf("peniche");
      if (idx >= 0 && idx < ORDER.length - 1) {
        const next = ORDER[idx + 1];
        if (!has(next)) arr.push(next);
      }
      localStorage.setItem(LS_GAMES, JSON.stringify(arr));
    } catch {}
  }, []);

  /* ---------- Fin de niveau : logique de progression ---------- */
  const handleWinLevel = useCallback(() => {
    // Débloque le niveau suivant **uniquement** si on vient d'atteindre le max actuel
    setMaxUnlockedLevel((prev) => {
      if (level >= prev && level < 3) {
        const next = level + 1;
        try { localStorage.setItem(LS_PENICHE_LEVEL, String(next)); } catch {}
        // passage auto au niveau suivant
        setTimeout(() => {
          setLevel(next);
          prepare(next);
          setStarted(true);
          setPaused(false);
          setMsg(`Niveau ${next} — plus rapide et plus d'obstacles !`);
        }, 900);
        return next;
      }
      return prev;
    });

    // Si niveau 3 réussi → marquer le jeu comme terminé et débloquer le suivant
    if (level === 3) {
      unlockNextGameGlobally();
      onComplete?.();
    }
  }, [level, prepare, unlockNextGameGlobally, onComplete]);

  /* ---------- Dessin ---------- */
  function drawBoat(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = "#d1d5db";
    ctx.fillRect(-26, -10, 52, 20);
    ctx.beginPath(); ctx.moveTo(26, -10); ctx.lineTo(38, 0); ctx.lineTo(26, 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-8, -8, 18, 16);
    ctx.restore();
  }

  function drawGate(ctx, g, top, bot, bonusGap = 0) {
    const wallW = 8;
    const gapY1 = g.centerY - (g.gap + bonusGap) / 2;
    const gapY2 = g.centerY + (g.gap + bonusGap) / 2;
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(g.x - wallW / 2, top, wallW, gapY1 - top);
    ctx.fillStyle = "rgba(34,197,94,.35)";
    ctx.fillRect(g.x - wallW / 2 - 6, gapY1, wallW + 12, (g.gap + bonusGap));
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(g.x - wallW / 2, gapY2, wallW, bot - gapY2);
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath(); ctx.arc(g.x, gapY1, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(g.x, gapY2, 5.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawObstacle(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = o.color;

    if (o.type === "buoy") {
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === "log") {
      ctx.rotate(0.15);
      ctx.fillRect(-o.r * 1.8, -o.r * 0.6, o.r * 3.6, o.r * 1.2);
    } else if (o.type === "kayak") {
      ctx.rotate(Math.sin(o.phase) * 0.12);
      ctx.fillRect(-o.r * 1.6, -o.r * 0.5, o.r * 3.2, o.r);
      ctx.fillStyle = "#111827";
      ctx.fillRect(-2, -o.r * 0.5 - 3, 4, o.r + 6);
    } else if (o.type === "patrol") {
      ctx.fillRect(-18, -10, 36, 20);
      ctx.fillStyle = "#93c5fd";
      ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = "rgba(59,130,246,.7)";
      ctx.fillRect(-2, -12, 4, 4);
    }
    ctx.restore();
  }

  function drawHUD(ctx, s) {
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillRect(12, 12, 420, 106);
    ctx.strokeStyle = "rgba(0,0,0,.12)";
    ctx.strokeRect(12, 12, 420, 106);
    ctx.fillStyle = "#111";
    ctx.font = "12px system-ui";
    ctx.fillText(`Niveau: ${s.level}`, 20, 32);
    ctx.fillText(`Vitesse: ${Math.round(s.speed)} px/s`, 20, 50);
    ctx.fillText(`Portiques: ${s.passed}/${s.total}`, 20, 68);
    ctx.fillText(`Joker: ${s.inv ? "ACTIF" : (s.joker ? "utilisé" : "disponible")}`, 20, 86);

    ctx.fillStyle = "#111";
    ctx.fillText("Règle: Passe dans le VERT. Tout le reste = mort.", 200, 50);
    ctx.fillText("Espace: démarrer/fort frein  •  P: pause  •  R: rejouer", 200, 68);
  }

  function drawOverlay(ctx, text) {
    const Wc = ctx.canvas.width, Hc = ctx.canvas.height;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, Wc, Hc);
    ctx.fillStyle = "#fff"; ctx.font = "bold 18px system-ui";
    const m = ctx.measureText(text);
    ctx.fillText(text, (Wc - m.width) / 2, Hc / 2);
  }

  /* ---------- Actions UI ---------- */
  const clickPlay = () => {
    setStarted(true);
    setPaused(false);
    setMsg("Reste dans le vert et évite tout !");
    try { canvasRef.current?.focus(); } catch {}
  };

  const clickStop = () => {
    prepare(level);
    setStarted(false);
    setPaused(false);
    setMsg("");
  };

  const clickReplay = () => {
    prepare(level);
    setStarted(true);
    setPaused(false);
    setMsg("Reste dans le vert et évite tout !");
  };

  const useJoker = () => {
    if (jokerUsed.current || result) return;
    jokerUsed.current = true;
    jokerUntil.current = performance.now() + 3000; // 3 secondes
    setMsg("🎟️ Joker actif : invincibilité + portiques élargis (3s)");
  };

  // niveau sélectionnable ≤ maxUnlockedLevel
  const canPick = useCallback((n) => n <= maxUnlockedLevel, [maxUnlockedLevel]);

  /* ---------- UI React ---------- */
  return (
    <div style={{ minHeight: "100svh", width: "100vw", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0 24px" }}>
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
        <div style={{ fontSize: 28, fontWeight: 900, color: RED }}>Péniche — Canal Runner (Chaos)</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Glisse <b>haut/bas</b> pour viser l’ouverture verte. Évite bouées, troncs, kayaks, patrouille.
          <br />↑ accélère • ↓ ralentit • <b>Espace</b> démarre / freine fort • P pause • R rejouer • 🎟️ Joker (3s)
        </div>
      </div>

      {/* Niveaux + Play/Stop/Rejouer/Joker */}
      <div style={{ width: "100%", maxWidth: 980, marginBottom: 12, textAlign: "center" }}>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontWeight: 700 }}>Niveau :</span>
          {[1,2,3].map(n => {
            const locked = !canPick(n);
            return (
              <button
                key={n}
                onClick={() => {
                  if (locked) return;
                  setLevel(n);
                  prepare(n);
                  setStarted(false);
                  setPaused(false);
                  setMsg("");
                }}
                disabled={locked}
                style={{
                  padding: "6px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${n === level ? RED : "#e5e7eb"}`,
                  background: n === level ? "rgba(220,38,38,.1)" : "#fff",
                  fontWeight: 800,
                  opacity: locked ? 0.5 : 1,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
                aria-pressed={n === level}
                title={locked ? "Termine d’abord le niveau précédent" : `Aller au niveau ${n}`}
              >{n}</button>
            );
          })}

          {!started ? (
            <button
              onClick={clickPlay}
              style={{ marginLeft: 10, padding: "8px 12px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 800 }}
            >▶ Play</button>
          ) : (
            <>
              <button
                onClick={() => setPaused(p => !p)}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
              >{paused ? "⏵ Reprendre" : "⏸ Pause"}</button>

              <button
                onClick={clickStop}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
                title="Stop : revient au début du niveau (en pause)"
              >⏹ Stop</button>

              <button
                onClick={clickReplay}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
              >↻ Rejouer</button>

              <button
                onClick={useJoker}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${RED}`,
                  background: "rgba(220,38,38,.06)",
                  color: RED_DARK,
                  fontWeight: 800,
                  opacity: jokerUsed.current ? .5 : 1,
                  cursor: jokerUsed.current ? "not-allowed" : "pointer",
                }}
                disabled={jokerUsed.current || !!result}
                title="Invincibilité et portiques élargis pendant 3 secondes"
              >🎟️ Joker</button>
            </>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
          Passe tous les portiques. <b>Un contact = perdu.</b>
        </p>
      </div>

      {/* Canvas */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          tabIndex={0}
          style={{
            width: "min(96vw, 1100px)",
            maxWidth: 1100,
            aspectRatio: `${W}/${H}`,
            display: "block",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#0b1020"
          }}
        />
      </div>

      {/* Messages sous le canvas */}
      {msg && (
        <div style={{ marginTop: 10, fontWeight: 700, color: result === "lose" ? "#ef4444" : "#111" }}>
          {msg}
        </div>
      )}

      {/* Résultat + actions */}
      {result && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 800, color: result === "win" ? "#16a34a" : "#ef4444" }}>
            {result === "win" ? "✅ Niveau réussi !" : "❌ Niveau non réussi."}
          </span>

          {result === "lose" && (
            <button
              onClick={clickReplay}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
            >↻ Rejouer</button>
          )}

          {/* Après le niveau 3 : bouton vers le jeu suivant */}
          {result === "win" && level === 3 && (
            <button
              onClick={() => navigate("/play/trompette")}
              style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 800 }}
            >→ Jeu suivant (Trompette)</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Utils & helpers ---------------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function lerp(a, b, t) { return a + (b - a) * t; }

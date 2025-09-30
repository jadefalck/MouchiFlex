import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const RED = "#dc2626";
const RED_DARK = "#991b1b";

/*
  CUISINE — "Cuisson parfaite"
  - Full-page, no-scroll while running
  - Play / Pause / Rejouer / Joker (signature stored)
  - When finished: exit fullscreen, show result overlay (stay on page).
    If success and level<3: offer "Niveau suivant".
    If success and level===3: offer "Jeu suivant" → /play/shabbat (change if needed).
*/

export default function Cuisine({ onComplete /* unused now */ }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // UI
  const [level, setLevel] = useState(1); // 1..3
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("");
  const [showJoker, setShowJoker] = useState(false);
  const [result, setResult] = useState(null); // 'win' | 'lose' | null

  // états
  const progress = useRef(0); // 0..100
  const temp = useRef(50);    // 0..100
  const flame = useRef(2);    // 0..5
  const failTimer = useRef(0);
  const keys = useRef({});
  const lastTime = useRef(performance.now() / 1000);

  // paramètres par niveau
  const cfg = useRef({
    heatRate: 7, coolStir: 14, envLoss: 3.0, noise: 0.6,
    goodZone: [55, 70], warnZone: [45, 80],
    targetTime: 40, failAfter: 1.8,
    eventEvery: [3.0, 5.0], eventWindow: 1.25,
    progressRates: { green: 1.6, yellow: 0.8, red: 0.25 },
  });

  const applyLevel = useCallback((lvl) => {
    if (lvl === 1) {
      cfg.current = {
        heatRate: 6.0, coolStir: 16, envLoss: 3.2, noise: 0.5,
        goodZone: [55, 70], warnZone: [45, 80],
        targetTime: 45, failAfter: 2.1, eventEvery: [3.2, 5.2], eventWindow: 1.4,
        progressRates: { green: 1.7, yellow: 0.9, red: 0.3 },
      };
    } else if (lvl === 2) {
      cfg.current = {
        heatRate: 6.6, coolStir: 15, envLoss: 3.0, noise: 0.6,
        goodZone: [56, 69], warnZone: [46, 79],
        targetTime: 42, failAfter: 1.9, eventEvery: [2.6, 4.2], eventWindow: 1.25,
        progressRates: { green: 1.6, yellow: 0.85, red: 0.28 },
      };
    } else {
      cfg.current = {
        heatRate: 7.2, coolStir: 14, envLoss: 3.0, noise: 0.7,
        goodZone: [57, 68], warnZone: [47, 78],
        targetTime: 40, failAfter: 1.8, eventEvery: [2.2, 3.6], eventWindow: 1.15,
        progressRates: { green: 1.5, yellow: 0.8, red: 0.25 },
      };
    }
  }, []);

  // événements cuisine
  const event = useRef(null); // { type:'salt'|'spice'|'flip', deadline }
  const nextEventT = useRef(0);

  // audio bip simple
  const audioCtx = useRef(null);
  useEffect(() => {
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
  }, []);
  const beep = (f = 740, d = 0.06, g = 0.06) => {
    const ctx = audioCtx.current; if (!ctx) return;
    const o = ctx.createOscillator(); const gn = ctx.createGain();
    o.type = "square"; o.frequency.value = f;
    o.connect(gn).connect(ctx.destination);
    gn.gain.setValueAtTime(g, ctx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
    o.start(); o.stop(ctx.currentTime + d);
  };

  // reset
  const prepare = useCallback((forcedLevel) => {
    const lvl = forcedLevel ?? level;
    applyLevel(lvl);

    temp.current = 50;
    flame.current = 2;
    progress.current = 0;
    failTimer.current = 0;
    event.current = null;
    nextEventT.current = 1.5 + rand(cfg.current.eventEvery[0], cfg.current.eventEvery[1]);

    setStarted(false);
    setPaused(false);
    setMessage("");
    setResult(null);
    lastTime.current = performance.now() / 1000;
  }, [level, applyLevel]);

  useEffect(() => { prepare(level); }, [prepare, level]);

  // clavier (bloque le scroll quand jeu lancé)
  useEffect(() => {
    const down = (e) => {
      const gameActive = started && !showJoker; // pause incluse mais overlay exclu
      const block = new Set([
        "ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
        "Space","PageUp","PageDown","Home","End"
      ]);
      if (gameActive && block.has(e.code)) e.preventDefault();
      keys.current[e.code] = true;

      // R = rejouer
      if (e.code === "KeyR") { prepare(level); setStarted(true); setPaused(false); focusAndMaybeFullscreen(); return; }

      // P = pause / reprise
      if (e.code === "KeyP" && started) {
        setPaused(p => !p);
        lastTime.current = performance.now() / 1000;
        try { canvasRef.current?.focus(); } catch {}
        return;
      }

      if (!started || paused) return;

      // Événements : A (sel) / Z (épices) / E (retourner)
      if (event.current) {
        if (event.current.type === "salt"  && e.code === "KeyA") { resolveEvent(true); return; }
        if (event.current.type === "spice" && e.code === "KeyZ") { resolveEvent(true); return; }
        if (event.current.type === "flip"  && e.code === "KeyE") { resolveEvent(true); return; }
      }
    };
    const up = (e) => { keys.current[e.code] = false; };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [started, paused, level, prepare, showJoker]);

  // Bloquer le scroll (overflow, wheel, touch) quand le jeu est lancé
  useEffect(() => {
    const active = started && !showJoker;
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
  }, [started, showJoker]);

  const resolveEvent = (ok) => {
    if (!event.current) return;
    if (ok) {
      temp.current -= 2.5;
      progress.current += 2.0;
      beep(900, 0.05, 0.05);
    } else {
      temp.current += 3.5;
      progress.current = Math.max(0, progress.current - 2.0);
      beep(300, 0.06, 0.06);
    }
    event.current = null;
    nextEventT.current = (performance.now() / 1000) + rand(cfg.current.eventEvery[0], cfg.current.eventEvery[1]);
  };

  // boucle
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    const loop = () => {
      const now = performance.now() / 1000;
      let dt = Math.min(0.033, now - lastTime.current);
      lastTime.current = now;

      // fond
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, 900, 420);

      // plaque
      ctx.fillStyle = "#111827";
      ctx.fillRect(20, 280, 860, 20);

      // thermomètre + zones
      drawThermo(ctx, temp.current);
      const [g1, g2] = cfg.current.goodZone;
      const [w1, w2] = cfg.current.warnZone;
      drawZones(ctx, w1, w2, g1, g2);

      // pas démarré ou pause → rendu statique
      if (!started || paused) {
        drawPan(ctx, flame.current, false);
        drawHUD(ctx, progress.current, level, cfg.current);
        if (!started) drawPaused(ctx);
        if (paused) drawPauseOverlay(ctx);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // feu (↑/↓) & remuer (Espace)
      if (keys.current.ArrowUp)   flame.current = Math.min(5, flame.current + 2 * dt);
      if (keys.current.ArrowDown) flame.current = Math.max(0, flame.current - 2 * dt);
      const stirring = !!keys.current.Space;

      // physique température
      const heat = flame.current * cfg.current.heatRate;
      const cool = (stirring ? cfg.current.coolStir : 0) + cfg.current.envLoss;
      let dT = (heat - cool) * dt + (Math.random() - 0.5) * cfg.current.noise * dt * 6;
      temp.current = clamp(temp.current + dT, 0, 100);

      // progression
      const mult =
        temp.current >= g1 && temp.current <= g2 ? cfg.current.progressRates.green :
        temp.current >= w1 && temp.current <= w2 ? cfg.current.progressRates.yellow :
        cfg.current.progressRates.red;
      progress.current += (dt * 100) / cfg.current.targetTime * mult;
      progress.current = Math.min(100, progress.current);

      // fail si trop longtemps hors warnZone
      if (temp.current < w1 || temp.current > w2) failTimer.current += dt;
      else failTimer.current = Math.max(0, failTimer.current - dt * 1.5);
      if (failTimer.current >= cfg.current.failAfter) {
        setMessage("🔥 Trop cuit !");
        setStarted(false);
        setResult("lose");
      }

      // événements
      if (!event.current && now >= nextEventT.current) {
        const r = Math.random();
        event.current = { type: r < 0.34 ? "salt" : r < 0.67 ? "spice" : "flip", deadline: now + cfg.current.eventWindow };
      }
      if (event.current && now > event.current.deadline) {
        resolveEvent(false);
      }

      // rendu
      drawPan(ctx, flame.current, stirring);
      drawHUD(ctx, progress.current, level, cfg.current);
      drawEvent(ctx, event.current);

      // victoire
      if (progress.current >= 100) {
        setMessage("✅ Parfait ! Service prêt !");
        setStarted(false);
        setResult("win");
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, paused, level]);

  // Exit fullscreen when a result appears
  useEffect(() => {
    if (result && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [result]);

  // ---------- Overlay "Joker" : carte à signer ----------
  const {
    signatureCanvas,
    isSigning,
    startSign,
    moveSign,
    endSign,
    clearSign,
    saveSignatureAndUnlock,
  } = useSignature(() => {
    if (level < 3) {
      const next = level + 1;
      try { localStorage.setItem("cuisine_unlocked_max", String(next)); } catch {}
      setLevel(next);
      prepare(next);
      setShowJoker(false);
      setMessage("Joker utilisé. Niveau suivant débloqué ✨");
    } else {
      setShowJoker(false);
      setMessage("Tu es déjà au dernier niveau 😉");
    }
  });

  // au montage : reprendre niveau max débloqué par joker (persisté)
  useEffect(() => {
    try {
      const s = localStorage.getItem("cuisine_unlocked_max");
      if (s) {
        const max = Math.max(1, Math.min(3, parseInt(s, 10) || 1));
        setLevel(max);
      }
    } catch {}
  }, []);

  const focusAndMaybeFullscreen = () => {
    try { canvasRef.current?.focus(); } catch {}
    const el = containerRef.current || document.documentElement;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div
      ref={containerRef}
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
      {/* Contenu principal (floutté quand overlay Joker) */}
      <div
        style={{
          filter: showJoker ? "blur(6px)" : "none",
          pointerEvents: showJoker ? "none" : "auto",
          transition: "filter .2s ease",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Bandeau titre + règles */}
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
          <div style={{ fontSize: 28, fontWeight: 900, color: RED }}>Cuisine — Cuisson parfaite</div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Garde la <b>température</b> dans la zone idéale pour remplir la barre.{" "}
            ↑/↓ : le feu • Espace : <b>remuer</b> • Événements : <b>A</b> (🧂), <b>Z</b> (🌶️), <b>E</b> (🔄) • <b>R</b> : rejouer • <b>P</b> : pause
          </div>
        </div>

        {/* Niveaux + Play / Pause / Rejouer / Joker */}
        <div style={{ width: "100%", maxWidth: 980, marginBottom: 12, padding: "0 6px", textAlign: "center" }}>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>Niveau :</span>
            {[1,2,3].map(n => (
              <button
                key={n}
                onClick={() => { setLevel(n); prepare(n); }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${n === level ? RED : "#e5e7eb"}`,
                  background: n === level ? "rgba(220,38,38,.1)" : "#fff",
                  fontWeight: 800,
                }}
              >{n}</button>
            ))}

            {!started ? (
              <button
                onClick={() => { setStarted(true); setPaused(false); lastTime.current = performance.now() / 1000; focusAndMaybeFullscreen(); }}
                style={{ marginLeft: 10, padding: "8px 12px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 800 }}
              >▶ Play</button>
            ) : (
              <>
                <button
                  onClick={() => { setPaused(p => !p); lastTime.current = performance.now() / 1000; try{canvasRef.current?.focus();}catch{} }}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
                  title="P"
                >{paused ? "⏵ Reprendre" : "⏸ Pause"}</button>
                <button
                  onClick={() => { prepare(level); setStarted(true); setPaused(false); lastTime.current = performance.now() / 1000; focusAndMaybeFullscreen(); }}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700 }}
                  title="R"
                >↻ Rejouer</button>
              </>
            )}

            {/* JOKER */}
            <button
              onClick={() => setShowJoker(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${RED}`,
                background: "rgba(220,38,38,.06)",
                color: RED_DARK,
                fontWeight: 800,
              }}
              title="Utiliser un joker pour débloquer un niveau"
            >
              🎟️ Joker pour débloquer un niveau
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
            Plus le niveau monte, plus les événements sont fréquents et la fenêtre de timing est courte.
            Tu perds si la température reste trop longtemps hors de la grande zone.
          </p>
        </div>

        {/* Canvas centré et responsive */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <canvas
            ref={canvasRef}
            width={900}
            height={420}
            tabIndex={0}
            style={{
              width: "min(96vw, 1100px)",
              maxWidth: 1100,
              aspectRatio: "900 / 420",
              display: "block",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
            }}
          />
        </div>

        {/* Légende + messages */}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
          ↑/↓ : feu • Espace : remuer • Événements : <b>A</b>/<b>Z</b>/<b>E</b> • <b>R</b> : rejouer • <b>P</b> : pause
        </div>

        {message && (
          <div style={{ marginTop: 8, fontWeight: 700, color: message.startsWith("✅") ? "#16a34a" : "#ef4444" }}>
            {message}
          </div>
        )}
      </div>

      {/* ---------- Overlay JOKER (fond floutté) ---------- */}
      {showJoker && (
        <div role="dialog" aria-modal="true" style={overlayBg}>
          <div style={cardShell}>
            <div style={cardHeader}>🎟️ Joker — Carte d'engagement</div>
            <div style={{ padding: 16 }}>
              <p style={{ marginTop: 0 }}>
                Passer un niveau, <b>ça ne se fait pas comme ça</b> 😏. Pour débloquer le niveau suivant,
                signe cette carte d’engagement :
              </p>
              <div style={pledgeBox}>
                <p style={{ marginTop: 0, marginBottom: 8 }}>
                  « Je m’engage à offrir un <b>massage de 10 minutes</b> à <b>Jade</b> si j’utilise ce joker. »
                </p>
                <div style={{ fontSize: 13, opacity: .8, marginBottom: 6 }}>Signature :</div>

                {/* Zone de signature */}
                <div style={signArea}>
                  <canvas
                    ref={signatureCanvas}
                    width={680}
                    height={180}
                    style={{ width: "100%", height: "100%", display: "block", borderRadius: 10 }}
                    onMouseDown={startSign}
                    onMouseMove={moveSign}
                    onMouseUp={endSign}
                    onMouseLeave={endSign}
                    onTouchStart={startSign}
                    onTouchMove={moveSign}
                    onTouchEnd={endSign}
                  />
                  {!isSigning && <div style={signHint}>(Signe ici avec la souris ou le doigt)</div>}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={clearSign} style={btnGhost}>Effacer</button>
                  <button onClick={saveSignatureAndUnlock} style={btnPrimary}>Enregistrer & débloquer le niveau →</button>
                  <button onClick={() => setShowJoker(false)} style={{ ...btnGhost, marginLeft: "auto" }}>Annuler</button>
                </div>
              </div>
              <p style={{ fontSize: 12, opacity: .7, marginTop: 10 }}>
                La signature est stockée dans <code>localStorage</code> (clé <code>cuisine_joker_signatures</code>).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------- RESULT OVERLAY (stay on page, exit fullscreen) ---------- */}
      {result && (
        <div role="dialog" aria-modal="true" style={overlayBg}>
          <div style={cardShell}>
            <div style={{ ...cardHeader, borderBottom: "1px solid " + RED }}>
              {result === "win" ? "✅ Niveau réussi !" : "❌ Niveau non réussi"}
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ marginTop: 0 }}>
                {result === "win"
                  ? (level < 3
                    ? "Bravo ! Tu peux passer au niveau suivant."
                    : "Excellent ! Tu as fini la Cuisine. Tu peux passer au jeu suivant.")
                  : "Tu peux rejouer ce niveau, ou utiliser un joker."}
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => { prepare(level); /* stay not-started */ }}
                  style={btnGhost}
                >
                  ↻ Rejouer ce niveau
                </button>

                {result === "win" && level < 3 && (
                  <button
                    onClick={() => { const next = level + 1; setLevel(next); prepare(next); }}
                    style={btnPrimary}
                  >
                    → Niveau {level + 1}
                  </button>
                )}

                {result === "win" && level === 3 && (
                  <button
                    onClick={() => navigate("/play/shabbat")} // change route if your order differs
                    style={btnPrimary}
                  >
                    → Jeu suivant (Shabbat)
                  </button>
                )}

                {result === "lose" && (
                  <button onClick={() => setShowJoker(true)} style={btnWarn}>
                    🎟️ Utiliser un joker
                  </button>
                )}

                <button onClick={() => setResult(null)} style={{ ...btnGhost, marginLeft: "auto" }}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- UI helpers ---------- */
const overlayBg = {
  position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0,0,0,.35)", padding: 16, zIndex: 60
};
const cardShell = { width: "min(92vw, 720px)", background: "#fff", borderRadius: 16, border: `1px solid ${RED}`, boxShadow: "0 10px 30px rgba(0,0,0,.25)", overflow: "hidden" };
const cardHeader = { background: "rgba(220,38,38,.08)", padding: "14px 16px", fontWeight: 900, color: RED_DARK, fontSize: 18 };
const pledgeBox = { border: "1px dashed #ddd", borderRadius: 12, padding: 12, background: "linear-gradient(180deg,#fff,rgba(220,38,38,.03))" };
const signArea = { background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", height: 180, position: "relative" };
const signHint = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", fontSize: 13, color: "#9ca3af" };
const btnPrimary = { padding: "8px 12px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 800, cursor: "pointer" };
const btnGhost = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" };
const btnWarn = { padding: "8px 12px", borderRadius: 10, border: `1px solid ${RED}`, background: "rgba(220,38,38,.06)", color: RED_DARK, fontWeight: 800, cursor: "pointer" };

/* ---------- Dessin & utilitaires ---------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }

function drawThermo(ctx, t) {
  const x = 40, y = 40, w = 20, h = 280;
  ctx.fillStyle = "#e5e7eb"; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = "#0f172a"; ctx.fillRect(x, y, w, h);
  const level = (t / 100) * h;
  ctx.fillStyle = "#ef4444"; ctx.fillRect(x, y + h - level, w, level);
  ctx.fillStyle = "#fff"; ctx.font = "12px system-ui"; ctx.fillText(`${Math.round(t)}°`, x - 4, y + h + 18);
}

function drawZones(ctx, w1, w2, g1, g2) {
  const y0 = 40, h = 280, x0 = 70, x1 = 860;
  const toY = (val) => y0 + h - (val / 100) * h;
  ctx.fillStyle = "rgba(245, 158, 11, .18)"; ctx.fillRect(x0, toY(w2), x1 - x0, toY(w1) - toY(w2));
  ctx.fillStyle = "rgba(34, 197, 94, .2)";  ctx.fillRect(x0, toY(g2), x1 - x0, toY(g1) - toY(g2));
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.beginPath();
  for (let i = 0; i <= 5; i++) { const yy = y0 + (i * h) / 5; ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); }
  ctx.stroke();
}

function drawPan(ctx, flame, stirring) {
  ctx.save();
  ctx.translate(450, 250);
  ctx.fillStyle = "#1f2937";
  ctx.beginPath(); ctx.ellipse(0, 0, 180, 60, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#374151"; ctx.fillRect(160, -12, 140, 24);
  ctx.fillStyle = "#f59e0b";
  const wobble = stirring ? Math.sin(performance.now() / 120) * 6 : 0;
  ctx.beginPath(); ctx.ellipse(0, wobble, 150, 40, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < Math.round(flame); i++) {
    ctx.fillStyle = i % 2 ? "#f97316" : "#fb7185";
    ctx.beginPath();
    ctx.moveTo(-160 + i * 16, 70);
    ctx.quadraticCurveTo(-160 + i * 16 + 8, 90 + Math.random() * 20, -160 + i * 16 + 16, 70);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHUD(ctx, prog, level, cfg) {
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.fillRect(16, 340, 868, 64);
  ctx.strokeStyle = "rgba(0,0,0,.15)";
  ctx.strokeRect(16, 340, 868, 64);
  ctx.fillStyle = "#111";
  ctx.font = "12px system-ui";
  ctx.fillText(`Niveau: ${level}`, 26, 360);
  ctx.fillText("Cuisson", 26, 382);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(86, 372, 780, 12);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(86, 372, 780 * Math.min(1, prog / 100), 12);
}

function drawEvent(ctx, ev) {
  if (!ev) return;
  const icon = ev.type === "salt" ? "🧂" : ev.type === "spice" ? "🌶️" : "🔄";
  const key  = ev.type === "salt" ? "A"   : ev.type === "spice" ? "Z"   : "E";
  const t = Math.max(0, ev.deadline - performance.now() / 1000);
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillRect(390, 120, 180, 40);
  ctx.fillStyle = "#fff";
  ctx.font = "14px system-ui";
  ctx.fillText(`${icon}  ${key}  (${t.toFixed(1)}s)`, 410, 146);
}

function drawPaused(ctx) {
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, 0, 900, 420);
  ctx.fillStyle = "#fff"; ctx.font = "bold 22px system-ui";
  ctx.fillText("▶ Cliquez sur Play pour commencer", 250, 220);
}

function drawPauseOverlay(ctx) {
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, 900, 420);
  ctx.fillStyle = "#fff"; ctx.font = "bold 22px system-ui";
  ctx.fillText("⏸ En pause — appuie sur P ou 'Reprendre'", 240, 220);
}

/* ---------------- Hook de signature (canvas) ---------------- */
function useSignature(onSave) {
  const signatureCanvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [isSigning, setIsSigning] = useState(false);

  useEffect(() => {
    const ctx = signatureCanvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, signatureCanvas.current.width, signatureCanvas.current.height);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 2.8;
  }, []);

  const getXY = (e) => {
    const rect = signatureCanvas.current.getBoundingClientRect();
    const isTouch = e.touches && e.touches[0];
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) / rect.width) * signatureCanvas.current.width;
    const y = ((clientY - rect.top) / rect.height) * signatureCanvas.current.height;
    return { x, y };
  };

  const startSign = (e) => { e.preventDefault(); drawing.current = true; setIsSigning(true); last.current = getXY(e); };
  const moveSign = (e) => {
    if (!drawing.current) return;
    const ctx = signatureCanvas.current.getContext("2d");
    const { x, y } = getXY(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(x, y); ctx.stroke();
    last.current = { x, y };
  };
  const endSign = () => { drawing.current = false; };

  const clearSign = () => {
    const c = signatureCanvas.current; const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    setIsSigning(false);
  };

  const saveSignatureAndUnlock = () => {
    const c = signatureCanvas.current;
    try {
      const dataUrl = c.toDataURL("image/png");
      const key = "cuisine_joker_signatures";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push({ when: new Date().toISOString(), dataUrl });
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
    onSave?.();
  };

  return { signatureCanvas, isSigning, startSign, moveSign, endSign, clearSign, saveSignatureAndUnlock };
}

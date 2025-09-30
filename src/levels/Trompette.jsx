// src/levels/Trompette.jsx
import { useEffect, useRef, useState, useCallback } from "react";
// import musicFile from "../audio/trompette.mp3"; // ← décommente si tu as le fichier

const RED = "#dc2626";
const RED_DARK = "#991b1b";

/*
  Trompette — Jeu de rythme (plein écran + très lent + overlay "joker")
  - Touches: J K L M (R pour rejouer)
  - 3 niveaux : beaucoup plus lents
  - Seuils de précision : 60% / 70% / 80%
  - Démarre en PAUSE : cliquer "▶ Play" pour commencer
  - Bouton "Stop" : stoppe et remet au début sans lancer
  - Joker : ouvre carte à signer. "Enregistrer" => stocke la signature (localStorage) et débloque le niveau suivant (persisté).
  - Niveaux verrouillés jusqu'au max débloqué (persisté).
  - Après le niveau 3 : onComplete() + déblocage global du jeu suivant ("cuisine") dans localStorage.
*/

const LS_TROMPETTE_LEVEL = "trompette_maxLevel";
const LS_GAMES = "mouchiflex_unlockedGames";
const ORDER = ["peniche", "trompette", "cuisine", "parkour", "cinema", "ken"];

export default function Trompette({ onComplete }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // --- Progression persistée par niveau (1..3) ---
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(LS_TROMPETTE_LEVEL) || "1", 10);
      return isNaN(v) ? 1 : Math.min(Math.max(v, 1), 3);
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_TROMPETTE_LEVEL, String(maxUnlockedLevel)); } catch {}
  }, [maxUnlockedLevel]);

  const [message, setMessage] = useState("");
  const [level, setLevel] = useState(1); // 1..3 (affiché)
  useEffect(() => {
    // si localStorage indique un niveau supérieur, ne pas permettre de sélectionner au-delà
    if (level > maxUnlockedLevel) setLevel(maxUnlockedLevel);
  }, [maxUnlockedLevel, level]);

  const [started, setStarted] = useState(false); // pause au début
  const [showJoker, setShowJoker] = useState(false); // overlay carte
  const [stats, setStats] = useState({
    hit: 0, total: 0, accuracy: 0, score: 0, combo: 0, bestCombo: 0,
  });

  // Canvas cible (fixe), mis à l’échelle côté style pour du responsive
  const W = 900;
  const H = 480;

  // chart / timeline
  const song = useRef([]); // {timeSec, lane, hit, judged, result}
  const startTime = useRef(0);
  const running = useRef(false);

  // réglages par niveau — TRÈS LENTS
  const settingsRef = useRef({ bpm: 46, speed: 85, perfect: 0.12, good: 0.22 });

  // seuils de réussite par niveau
  const passThresholdFor = (lvl) => (lvl === 1 ? 60 : lvl === 2 ? 70 : 80);

  // lanes → J K L M
  const KEY_TO_LANE = { j: 0, k: 1, l: 2, m: 3 };
  const laneX = (i) => 150 + i * 160;
  const hitLineY = H - 100;

  // audio (bips + musique)
  const audioCtx = useRef(null);
  const musicRef = useRef(null);

  useEffect(() => {
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    try {
      // musicRef.current = new Audio(musicFile);  // ← décommente si import audio
      if (musicRef.current) {
        musicRef.current.volume = 0.6;
        musicRef.current.preload = "auto";
      }
    } catch {
      musicRef.current = null;
    }
  }, []);

  const beep = useCallback((f = 660, d = 0.06, g = 0.04) => {
    const ctx = audioCtx.current; if (!ctx) return;
    const o = ctx.createOscillator(); const gn = ctx.createGain();
    o.type = "square"; o.frequency.value = f;
    o.connect(gn).connect(ctx.destination);
    gn.gain.setValueAtTime(g, ctx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
    o.start(); o.stop(ctx.currentTime + d);
  }, []);

  // Appliquer la vitesse/fenêtres selon le niveau — toutes plus lentes
  const applyLevelSettings = useCallback((lvl) => {
    if (lvl === 1) settingsRef.current = { bpm: 50, speed: 95,  perfect: 0.12,  good: 0.22 };
    else if (lvl === 2) settingsRef.current = { bpm: 60, speed: 122, perfect: 0.10,  good: 0.18 };
    else settingsRef.current =       { bpm: 70, speed: 148, perfect: 0.085, good: 0.155 };
  }, []);

  // Prépare une nouvelle chart (PAUSE par défaut)
  const prepareChart = useCallback((forcedLevel) => {
    const lvl = forcedLevel ?? level;
    applyLevelSettings(lvl);
    const { bpm } = settingsRef.current;
    const beat = 60 / bpm;

    const lengthBeats = 52; // durée globale ~ (beats/bpm) * 60
    const arr = [];
    for (let b = 0; b < lengthBeats; b++) {
      const t = 1.8 + b * beat;
      const mod = b % 8;
      if (mod === 0) { arr.push({ timeSec: t, lane: 0 }); }
      else if (mod === 1) { arr.push({ timeSec: t, lane: 2 }); }
      else if (mod === 2) { arr.push({ timeSec: t, lane: 1 }); }
      else if (mod === 3) { arr.push({ timeSec: t, lane: 3 }); }
      else if (mod === 4) { arr.push({ timeSec: t, lane: 1 }); }
      else if (mod === 5) { /* repos */ }
      else if (mod === 6) { arr.push({ timeSec: t, lane: 0 }); }
      else if (mod === 7) { arr.push({ timeSec: t + beat * 0.5, lane: 2 }); }
    }

    song.current = arr.map(n => ({ ...n, hit: false, judged: false }));
    setStats({ hit: 0, total: arr.length, accuracy: 0, score: 0, combo: 0, bestCombo: 0 });
    running.current = false;
    setStarted(false);
    setMessage("");

    if (musicRef.current) {
      try { musicRef.current.pause(); musicRef.current.currentTime = 0; } catch {}
    }
  }, [applyLevelSettings, level]);

  useEffect(() => { prepareChart(level); }, [prepareChart, level]);

  // Démarre réellement la partie (Play)
  const startSong = useCallback(() => {
    startTime.current = performance.now() / 1000;
    running.current = true;
    setStarted(true);
    if (musicRef.current) {
      try { musicRef.current.currentTime = 0; musicRef.current.play().catch(() => {}); } catch {}
    }
  }, []);

  // STOP : arrête tout et remet au début (sans lancer)
  const stopSong = useCallback(() => {
    running.current = false;
    setStarted(false);
    setMessage("");
    if (musicRef.current) {
      try { musicRef.current.pause(); musicRef.current.currentTime = 0; } catch {}
    }
    prepareChart(level);
  }, [level, prepareChart]);

  // Inputs clavier
  useEffect(() => {
    const onDown = (e) => {
      if (e.code === "KeyR") { prepareChart(level); startSong(); return; } // rejouer direct
      if (!started) return;

      const ch = (e.key || "").toLowerCase();
      const laneIdx = Object.prototype.hasOwnProperty.call(KEY_TO_LANE, ch) ? KEY_TO_LANE[ch] : -1;
      if (laneIdx === -1) return;

      if (musicRef.current && musicRef.current.paused) {
        musicRef.current.play().catch(() => {});
      }

      const tNow = performance.now() / 1000 - startTime.current;

      // meilleure note dans la fenêtre
      let best = null; let bestAbs = Infinity;
      for (let i = 0; i < song.current.length; i++) {
        const n = song.current[i];
        if (n.lane !== laneIdx || n.judged) continue;
        const dt = tNow - n.timeSec;
        const abs = Math.abs(dt);
        if (abs < bestAbs) { best = { i, abs }; bestAbs = abs; }
      }

      const { perfect, good } = settingsRef.current;
      if (!best || bestAbs > good) {
        beep(240, 0.05, 0.03);
        setStats(s => ({ ...s, combo: 0 }));
        return;
      }

      let result = null; let add = 0;
      if (bestAbs <= perfect) { result = "perfect"; add = 100; beep(780, 0.05, 0.05); }
      else { result = "good"; add = 50; beep(600, 0.05, 0.04); }

      song.current[best.i].hit = true;
      song.current[best.i].judged = true;
      song.current[best.i].result = result;

      setStats(s => {
        const hit = s.hit + 1;
        const combo = s.combo + 1;
        const bestCombo = Math.max(s.bestCombo, combo);
        const score = s.score + add + Math.floor(combo * 2.5);
        const accuracy = (hit / s.total) * 100;
        return { ...s, hit, combo, bestCombo, score, accuracy };
      });
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [prepareChart, startSong, started, beep, level]);

  // Débloque le jeu suivant globalement (liste des jeux)
  const unlockNextGameGlobally = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_GAMES);
      const arr = raw ? JSON.parse(raw) : [ORDER[0]];
      const has = (id) => arr.includes(id);
      if (!has("trompette")) arr.push("trompette");
      const idx = ORDER.indexOf("trompette");
      if (idx >= 0 && idx < ORDER.length - 1) {
        const next = ORDER[idx + 1]; // "cuisine"
        if (!has(next)) arr.push(next);
      }
      localStorage.setItem(LS_GAMES, JSON.stringify(arr));
    } catch {}
  }, []);

  // Victoire : progression (niveau + jeu global si N3)
  const handleWinLevel = useCallback(() => {
    const needed = passThresholdFor(level);
    setMessage(`Bravo 🎺 Précision ≥ ${needed}% !`);

    // Débloque niveau suivant si on vient d'atteindre le max courant
    setMaxUnlockedLevel((prev) => {
      if (level >= prev && level < 3) {
        const next = level + 1;
        try { localStorage.setItem(LS_TROMPETTE_LEVEL, String(next)); } catch {}
        // Passage auto au niveau suivant (en pause)
        setTimeout(() => {
          setLevel(next);
          prepareChart(next);
          setStarted(false);
          setMessage(`Niveau ${next} débloqué ✨`);
        }, 700);
        return next;
      }
      return prev;
    });

    // Si niveau 3 → débloque jeu suivant + onComplete
    if (level === 3) {
      unlockNextGameGlobally();
      setTimeout(() => onComplete?.(), 600);
    }
  }, [level, prepareChart, unlockNextGameGlobally, onComplete]);

  // Loop
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    const draw = () => {
      const tNow = performance.now() / 1000 - startTime.current;
      const { speed, good } = settingsRef.current;

      // fond
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, W, H);

      // colonnes
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.07)";
        ctx.fillRect(laneX(i) - 60, 0, 120, H);
      }

      // ligne de hit
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, hitLineY);
      ctx.lineTo(W - 100, hitLineY);
      ctx.stroke();

      // si pas démarré, on ne dessine pas les notes
      if (!started) {
        drawHUD(ctx, stats, 0, song.current.at(-1)?.timeSec ?? 0, passThresholdFor(level));
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // notes
      const noteW = 90, noteH = 16;
      song.current.forEach(n => {
        const dt = tNow - n.timeSec;
        const y = hitLineY - dt * speed;
        const x = laneX(n.lane) - noteW / 2;

        if (!n.judged && tNow - n.timeSec > good) {
          n.judged = true; n.result = "miss";
          setStats(s => ({ ...s, combo: 0 }));
        }

        if (y > H + 30 || y < -60) return;

        let color = "#38bdf8";
        if (n.judged) {
          if (n.result === "perfect") color = "#22c55e";
          else if (n.result === "good") color = "#f59e0b";
          else if (n.result === "miss") color = "rgba(239,68,68,.7)";
        }

        const glow = Math.max(0, 1 - Math.abs(y - hitLineY) / 60);
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * glow;
        ctx.fillStyle = color;
        ctx.fillRect(x, y - noteH / 2, noteW, noteH);
        ctx.shadowBlur = 0;
      });

      // HUD
      drawHUD(ctx, stats, tNow, song.current.at(-1)?.timeSec ?? 0, passThresholdFor(level));

      // fin de chanson
      const lastT = (song.current.at(-1)?.timeSec ?? 0) + 2.0;
      if (running.current && tNow >= lastT) {
        running.current = false;
        const acc = stats.accuracy; // mis à jour au fil de l'eau
        const needed = passThresholdFor(level);
        if (acc >= needed) {
          if (musicRef.current) musicRef.current.pause();
          handleWinLevel();
        } else {
          if (musicRef.current) musicRef.current.pause();
          setMessage(`Raté… (R pour rejouer) — Il fallait ${needed}%`);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (musicRef.current) musicRef.current.pause();
    };
  }, [stats, started, level, handleWinLevel]);

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
    // à l'enregistrement : débloquer le niveau suivant (persisté)
    if (level < 3) {
      const next = level + 1;
      try { localStorage.setItem(LS_TROMPETTE_LEVEL, String(Math.max(maxUnlockedLevel, next))); } catch {}
      setMaxUnlockedLevel((prev) => Math.max(prev, next));
      setLevel(next);
      prepareChart(next);
      setShowJoker(false);
      setMessage("Joker utilisé. Niveau suivant débloqué ✨");
    } else {
      setShowJoker(false);
      setMessage("Tu es déjà au dernier niveau 😉");
    }
  });

  // ---------- UI plein écran centrée ----------
  return (
    <div
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
      {/* Contenu principal (floutté quand overlay ouvert) */}
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
        {/* Bandeau titre rouge + description */}
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
          <div style={{ fontSize: 28, fontWeight: 900, color: RED }}>
            Trompette — Jeu de rythme
          </div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Appuie sur <b>J K L M</b> quand les notes atteignent la ligne rouge.
            <b> R</b> pour rejouer.
          </div>
        </div>

        {/* Sélecteur de niveau + boutons Play/Rejouer/Stop/Joker (centrés) */}
        <div style={{ width: "100%", maxWidth: 980, marginBottom: 12, padding: "0 6px", textAlign: "center" }}>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>Niveau :</span>
            {[1, 2, 3].map((n) => {
              const locked = n > maxUnlockedLevel;
              return (
                <button
                  key={n}
                  onClick={() => {
                    if (locked) return;
                    setLevel(n);
                    prepareChart(n);
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
                >
                  {n}
                </button>
              );
            })}
            {!started ? (
              <button
                onClick={startSong}
                style={{
                  marginLeft: 10,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: RED,
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                ▶ Play
              </button>
            ) : (
              <button
                onClick={() => { prepareChart(level); startSong(); }}
                style={{
                  marginLeft: 10,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 700,
                }}
                title="Raccourci clavier : R"
              >
                Rejouer
              </button>
            )}

            {/* STOP */}
            <button
              onClick={stopSong}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
              }}
              title="Arrêter et revenir au début"
            >
              ⏹ Stop
            </button>

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

          <p style={{ margin: 0, fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
            Termine la chanson avec au moins <b>{passThresholdFor(level)}%</b> de précision.<br />
            Plus le niveau est élevé, plus les notes descendent vite et plus la fenêtre temporelle est serrée.
          </p>
        </div>

        {/* Canvas centré */}
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
          Touches: <b>J</b> <b>K</b> <b>L</b> <b>M</b> • <b>R</b> pour rejouer • <b>⏹ Stop</b> pour arrêter
        </div>

        {message && (
          <div
            style={{
              marginTop: 8,
              fontWeight: 700,
              color: message.startsWith("Bravo") || message.includes("débloqué") ? "#16a34a" : "#ef4444",
            }}
          >
            {message}
          </div>
        )}
      </div>

      {/* ---------- Overlay JOKER (fond floutté) ---------- */}
      {showJoker && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,.35)",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => {/* clic dehors n'exclut pas */}}
        >
          <div
            style={{
              width: "min(92vw, 720px)",
              background: "#fff",
              borderRadius: 16,
              border: `1px solid ${RED}`,
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "rgba(220,38,38,.08)",
                padding: "14px 16px",
                borderBottom: `1px solid ${RED}`,
                fontWeight: 900,
                color: RED_DARK,
                fontSize: 18,
              }}
            >
              🎟️ Joker — Carte d'engagement
            </div>

            <div style={{ padding: 16 }}>
              <p style={{ marginTop: 0 }}>
                Passer un niveau, <b>ça ne se fait pas comme ça</b> 😏. Si tu veux débloquer
                le niveau suivant sans atteindre la précision requise, tu dois signer
                cette carte d'engagement :
              </p>

              <div
                style={{
                  border: "1px dashed #ddd",
                  borderRadius: 12,
                  padding: 12,
                  background: "linear-gradient(180deg,#fff,rgba(220,38,38,.03))",
                }}
              >
                <p style={{ marginTop: 0, marginBottom: 8 }}>
                  « Je m’engage à offrir un <b>massage de 10 minutes</b> à <b>Jade</b> si j’utilise ce joker. »
                </p>
                <div style={{ fontSize: 13, opacity: .8, marginBottom: 6 }}>Signature :</div>

                {/* Zone de signature */}
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    height: 180,
                    position: "relative",
                  }}
                >
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
                  {!isSigning && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        fontSize: 13,
                        color: "#9ca3af",
                      }}
                    >
                      (Signe ici avec la souris ou le doigt)
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={clearSign}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    Effacer
                  </button>
                  <button
                    onClick={saveSignatureAndUnlock}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: RED,
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    Enregistrer & débloquer le niveau →
                  </button>
                  <button
                    onClick={() => setShowJoker(false)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      fontWeight: 700,
                      marginLeft: "auto",
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>

              <p style={{ fontSize: 12, opacity: .7, marginTop: 10 }}>
                La signature est stockée localement sur ton navigateur (localStorage). Tu peux la supprimer en
                vidant les données du site.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- HUD ---------------- */
function drawHUD(ctx, stats, tNow, lastNoteTime, needed) {
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillRect(16, 16, 280, 124);
  ctx.strokeStyle = "rgba(0,0,0,.15)";
  ctx.strokeRect(16, 16, 280, 124);
  ctx.fillStyle = "#111";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";

  const acc = stats.total ? (stats.hit / stats.total) * 100 : 0;

  ctx.fillText(`Score : ${stats.score}`, 26, 36);
  ctx.fillText(`Précision : ${acc.toFixed(1)}% (objectif ${needed}%)`, 26, 54);
  ctx.fillText(`Combo : ${stats.combo} (best ${stats.bestCombo})`, 26, 72);

  const total = Math.max(1, (lastNoteTime ?? 0) + 2);
  const p = Math.min(1, tNow / total);
  ctx.fillText("Progression", 26, 92);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(96, 84, 180, 10);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(96, 84, 180 * p, 10);
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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.8;
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

  const startSign = (e) => {
    e.preventDefault();
    drawing.current = true;
    setIsSigning(true);
    last.current = getXY(e);
  };

  const moveSign = (e) => {
    if (!drawing.current) return;
    const ctx = signatureCanvas.current.getContext("2d");
    const { x, y } = getXY(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last.current = { x, y };
  };

  const endSign = () => { drawing.current = false; };

  const clearSign = () => {
    const c = signatureCanvas.current;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setIsSigning(false);
  };

  const saveSignatureAndUnlock = () => {
    const c = signatureCanvas.current;
    try {
      const dataUrl = c.toDataURL("image/png");
      const key = "mouchiflex_joker_signatures";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push({ when: new Date().toISOString(), dataUrl });
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
    onSave?.();
  };

  return {
    signatureCanvas,
    isSigning,
    startSign,
    moveSign,
    endSign,
    clearSign,
    saveSignatureAndUnlock,
  };
}

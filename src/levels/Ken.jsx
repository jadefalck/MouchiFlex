// src/levels/Ken.jsx
import { useEffect, useRef, useState, useCallback } from "react";

const RED = "#dc2626";
const RED_DARK = "#991b1b";
const BLUE = "#1d4ed8";
const BLUE_SOFT = "rgba(29,78,216,.10)";

const ARENA_W = 920;
const ARENA_H = 420;
const GROUND_Y = ARENA_H - 90;
const GRAVITY = 0.9;
const MOVE_SPEED = 3.2;
const JUMP_VELOCITY = -14;
const FRICTION = 0.85;

const ROUND_TIME = 60; // secondes
const MAX_ROUNDS = 3;
const WIN_ROUNDS = 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowMS = () => performance.now();

const initialFighter = (side = "left") => ({
  x: side === "left" ? 140 : ARENA_W - 200,
  y: GROUND_Y,
  vx: 0,
  vy: 0,
  w: 60,
  h: 90,
  face: side === "left" ? 1 : -1,
  hp: 100,
  rounds: 0,
  blocking: false,
  crouch: false,
  attack: null, // { type: 'light'|'heavy', frame, active }
  canAct: true,
  invincibleUntil: 0,
  jokerUsed: false,
  name: side === "left" ? "Joueur 1" : "Joueur 2",
});

export default function Ken({ onComplete }) {
  const [p1, setP1] = useState(() => initialFighter("left"));
  const [p2, setP2] = useState(() => initialFighter("right"));

  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [message, setMessage] = useState("Appuie sur ESPACE ou ▶ Play pour commencer le combat ultime !");
  const [running, setRunning] = useState(false);
  const [matchOver, setMatchOver] = useState(false);

  const keysRef = useRef({});
  const rafRef = useRef(0);
  const lastTS = useRef(0);
  const timerRef = useRef(0);

  const resetRound = useCallback((keepScore = true) => {
    setP1(prev => ({
      ...initialFighter("left"),
      rounds: keepScore ? prev.rounds : 0,
      jokerUsed: keepScore ? prev.jokerUsed : false,
    }));
    setP2(prev => ({
      ...initialFighter("right"),
      rounds: keepScore ? prev.rounds : 0,
      jokerUsed: keepScore ? prev.jokerUsed : false,
    }));
    setTimeLeft(ROUND_TIME);
    setMessage(`Round ${round} — Prêt ?`);
  }, [round]);

  const fullReset = useCallback(() => {
    setRound(1);
    setMatchOver(false);
    setP1(initialFighter("left"));
    setP2(initialFighter("right"));
    setTimeLeft(ROUND_TIME);
    setMessage("Nouveau match ! Appuie sur ESPACE ou ▶ Play.");
    setRunning(false);
  }, []);

  // --------- Clavier (plein écran / même logique que Trompette) ----------
  useEffect(() => {
    const onDown = (e) => {
      keysRef.current[e.key] = true;
      if (e.key === " " && !matchOver) {
        e.preventDefault();
        setRunning(r => !r);
        setMessage(m => (running ? "Pause..." : `Round ${round} — Fight!`));
      }
    };
    const onUp = (e) => { keysRef.current[e.key] = false; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [matchOver, round, running]);

  // --------- Timer de round ----------
  useEffect(() => {
    if (!running || matchOver) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          endRoundByTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [running, matchOver]);

  const endRoundByTimeout = useCallback(() => {
    setRunning(false);
    setMessage("Temps écoulé !");
    // Compare HP
    setP1(P1 => {
      setP2(P2 => {
        const w = P1.hp > P2.hp ? "p1" : P2.hp > P1.hp ? "p2" : "draw";
        if (w === "p1") {
          const r1 = P1.rounds + 1;
          roundOver("Joueur 1 remporte le round !", r1, P2.rounds);
        } else if (w === "p2") {
          const r2 = P2.rounds + 1;
          roundOver("Joueur 2 remporte le round !", P1.rounds, r2);
        } else {
          roundOver("Égalité ! Personne ne marque.", P1.rounds, P2.rounds);
        }
        return P2;
      });
      return P1;
    });
  }, []);

  const roundOver = (msg, r1, r2) => {
    setMessage(msg);
    const isMatchEnd = r1 >= WIN_ROUNDS || r2 >= WIN_ROUNDS || round >= MAX_ROUNDS;
    if (isMatchEnd) {
      setMatchOver(true);
      setRunning(false);
      const finalMsg = r1 > r2 ? "🎉 Victoire de Joueur 1 !" : r2 > r1 ? "🎉 Victoire de Joueur 2 !" : "Match nul !";
      setTimeout(() => setMessage(`${msg} ${finalMsg}`), 150);
      setP1(prev => ({ ...prev, rounds: r1 }));
      setP2(prev => ({ ...prev, rounds: r2 }));
      // callback de fin (niveau final)
      if (onComplete) setTimeout(() => onComplete(), 600);
      return;
    }
    setP1(prev => ({ ...prev, rounds: r1 }));
    setP2(prev => ({ ...prev, rounds: r2 }));
    setRound(r => r + 1);
    setTimeout(() => {
      resetRound(true);
      setRunning(true);
      setMessage(`Round ${round + 1} — Fight!`);
    }, 900);
  };

  // --------- Simulation ----------
  const step = useCallback((dtMS) => {
    if (!running || matchOver) return;
    const dt = Math.min(32, dtMS);
    const k = keysRef.current;

    // --- P1 ---
    setP1(P1 => {
      let p = { ...P1 };
      if (p.canAct) {
        // Move
        if (k["a"] || k["A"]) p.vx = -MOVE_SPEED;
        else if (k["d"] || k["D"]) p.vx = MOVE_SPEED;
        else p.vx *= FRICTION;
        // Crouch / Jump
        p.crouch = !!(k["s"] || k["S"]);
        if ((k["w"] || k["W"]) && p.y >= GROUND_Y) p.vy = JUMP_VELOCITY;
        // Block
        p.blocking = !!(k["h"] || k["H"]);
        // Attacks
        if (!p.attack) {
          if (k["f"] || k["F"]) p.attack = { type: "light", frame: 0, active: false };
          else if (k["g"] || k["G"]) p.attack = { type: "heavy", frame: 0, active: false };
        }
        // Joker
        if ((k["r"] || k["R"]) && !p.jokerUsed) {
          p.jokerUsed = true;
          p.hp = clamp(p.hp + 20, 0, 100);
          p.invincibleUntil = nowMS() + 1500;
        }
      }
      // Physics
      p.vy += GRAVITY;
      p.x = clamp(p.x + p.vx, 0, ARENA_W - p.w);
      p.y = Math.min(p.y + p.vy, GROUND_Y);
      if (p.y >= GROUND_Y) p.vy = 0;
      // Face
      p.face = p.x + p.w / 2 < p2.x + p2.w / 2 ? 1 : -1;
      // Attack frames
      if (p.attack) {
        p.attack.frame += dt;
        const activeWindow = p.attack.type === "light" ? [100, 220] : [180, 360];
        const endAt = p.attack.type === "light" ? 300 : 520;
        p.attack.active = p.attack.frame >= activeWindow[0] && p.attack.frame <= activeWindow[1];
        if (p.attack.frame >= endAt) p.attack = null;
      }
      return p;
    });

    // --- P2 ---
    setP2(P2 => {
      let p = { ...P2 };
      if (p.canAct) {
        if (k["j"] || k["J"]) p.vx = -MOVE_SPEED;
        else if (k["l"] || k["L"]) p.vx = MOVE_SPEED;
        else p.vx *= FRICTION;
        p.crouch = !!(k["k"] || k["K"]);
        if ((k["i"] || k["I"]) && p.y >= GROUND_Y) p.vy = JUMP_VELOCITY;
        p.blocking = !!(k[";"]);
        if (!p.attack) {
          if (k["o"] || k["O"]) p.attack = { type: "light", frame: 0, active: false };
          else if (k["p"] || k["P"]) p.attack = { type: "heavy", frame: 0, active: false };
        }
        if ((k["u"] || k["U"]) && !p.jokerUsed) {
          p.jokerUsed = true;
          p.hp = clamp(p.hp + 20, 0, 100);
          p.invincibleUntil = nowMS() + 1500;
        }
      }
      p.vy += GRAVITY;
      p.x = clamp(p.x + p.vx, 0, ARENA_W - p.w);
      p.y = Math.min(p.y + p.vy, GROUND_Y);
      if (p.y >= GROUND_Y) p.vy = 0;
      p.face = p.x + p.w / 2 < p1.x + p1.w / 2 ? 1 : -1;
      if (p.attack) {
        p.attack.frame += dt;
        const activeWindow = p.attack.type === "light" ? [100, 220] : [180, 360];
        const endAt = p.attack.type === "light" ? 300 : 520;
        p.attack.active = p.attack.frame >= activeWindow[0] && p.attack.frame <= activeWindow[1];
        if (p.attack.frame >= endAt) p.attack = null;
      }
      return p;
    });

    // --- Collisions, dégâts, KO ---
    setP1(P1 => {
      let A = { ...P1 };
      setP2(P2 => {
        let B = { ...P2 };

        // Push léger si chevauchement
        const overlapX = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x));
        const overlapY = Math.max(0, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
        if (overlapX > 0 && overlapY > 0) {
          const centerA = A.x + A.w / 2;
          const centerB = B.x + B.w / 2;
          const push = 0.6;
          if (centerA < centerB) { A.x = clamp(A.x - push, 0, ARENA_W - A.w); B.x = clamp(B.x + push, 0, ARENA_W - B.w); }
          else { A.x = clamp(A.x + push, 0, ARENA_W - A.w); B.x = clamp(B.x - push, 0, ARENA_W - B.w); }
        }

        const hit = (attacker, defender, setDef, setAtk) => {
          if (!attacker.attack || !attacker.attack.active) return;
          const reach = attacker.attack.type === "light" ? 44 : 66;
          const hw = attacker.attack.type === "light" ? 36 : 50;
          const hh = 40;
          const hx = attacker.face === 1 ? attacker.x + attacker.w : attacker.x - hw;
          const hy = attacker.y + 20;

          const collides =
            hx < defender.x + defender.w &&
            hx + hw > defender.x &&
            hy < defender.y + defender.h &&
            hy + hh > defender.y;

          if (collides) {
            const t = nowMS();
            if (defender.invincibleUntil && t < defender.invincibleUntil) return;

            const base = attacker.attack.type === "light" ? 8 : 16;
            const dmg = defender.blocking ? Math.floor(base * 0.3) : base;
            const newHP = clamp(defender.hp - dmg, 0, 100);
            defender = { ...defender, hp: newHP };

            // knockback + micro-stun
            const knock = attacker.attack.type === "light" ? 2.4 : 3.6;
            const dir = attacker.face;
            defender.vx += dir * knock;
            defender.canAct = false;
            const tId = setTimeout(() => {
              setDef(d => ({ ...d, canAct: true }));
              clearTimeout(tId);
            }, 140);

            attacker.attack.active = false; // une touche par frame active

            setDef(defender);
            setAtk(attacker);

            // KO => fin du round
            if (newHP <= 0) {
              setRunning(false);
              setP1(p1s => {
                setP2(p2s => {
                  const r1 = defender === p2s ? p1s.rounds + 1 : p1s.rounds;
                  const r2 = defender === p1s ? p2s.rounds + 1 : p2s.rounds;
                  const winnerMsg = defender === p2s ? "Joueur 1 met KO !" : "Joueur 2 met KO !";
                  roundOver(winnerMsg, r1, r2);
                  return p2s;
                });
                return p1s;
              });
            }
          }
        };

        // A frappe B / B frappe A
        hit(A, B, (nb) => (B = nb), (na) => (A = na));
        hit(B, A, (na) => (A = na), (nb) => (B = nb));

        // push updates
        setTimeout(() => {
          setP1(() => A);
          setP2(() => B);
        }, 0);

        return B;
      });
      return A;
    });
  }, [running, matchOver, round, p1.x, p2.x]);

  useEffect(() => {
    const loop = (ts) => {
      if (!lastTS.current) lastTS.current = ts;
      const dt = ts - lastTS.current;
      lastTS.current = ts;
      step(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [step]);

  // --------- Actions UI ----------
  const handlePlay = () => {
    if (matchOver) return;
    setRunning(true);
    setMessage(`Round ${round} — Fight!`);
  };
  const handleStop = () => {
    setRunning(false);
    setMessage("⏹ Stop — Reviens au début du round");
    resetRound(true);
  };
  const handleRejouer = () => { fullReset(); };
  const handleJoker1 = () => {
    setP1(p => (p.jokerUsed || matchOver) ? p : { ...p, jokerUsed: true, hp: clamp(p.hp + 20, 0, 100), invincibleUntil: nowMS() + 1500 });
  };
  const handleJoker2 = () => {
    setP2(p => (p.jokerUsed || matchOver) ? p : { ...p, jokerUsed: true, hp: clamp(p.hp + 20, 0, 100), invincibleUntil: nowMS() + 1500 });
  };

  // --------- UI helpers (inline styles comme Trompette) ----------
  const HealthBar = ({ hp, label, wins }) => (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span style={{ fontWeight: 700 }}>{label} — ❤️ {hp}</span>
        <span>Rounds: {wins}</span>
      </div>
      <div style={{ width: "100%", height: 10, background: "rgba(0,0,0,.08)", borderRadius: 9999 }}>
        <div
          style={{
            width: `${hp}%`,
            height: "100%",
            borderRadius: 9999,
            background: "linear-gradient(90deg,#22c55e,#ef4444)",
            transition: "width .15s ease",
          }}
        />
      </div>
    </div>
  );

  const FighterView = ({ f, tint }) => {
    const isInv = f.invincibleUntil && nowMS() < f.invincibleUntil;
    return (
      <div
        style={{
          position: "absolute",
          left: f.x,
          top: f.y - (f.h - 2),
          width: f.w,
          height: f.h,
          transform: `scaleX(${f.face})`,
          filter: isInv ? "brightness(1.35) saturate(1.25)" : "none",
          transition: "transform .05s linear",
        }}
      >
        {/* Corps */}
        <div
          style={{
            width: "100%", height: "100%",
            borderRadius: 12,
            boxShadow: "0 6px 20px rgba(0,0,0,.35)",
            background: tint === "blue"
              ? "linear-gradient(180deg,#60a5fa,#1d4ed8)"
              : "linear-gradient(180deg,#fca5a5,#b91c1c)",
            border: "2px solid rgba(255,255,255,.15)",
          }}
        />
        {/* Indicateur de coup */}
        {f.attack && (
          <div
            style={{
              position: "absolute",
              width: f.attack.type === "light" ? 24 : 36,
              height: 14,
              right: f.face === 1 ? -18 : undefined,
              left: f.face === -1 ? -18 : undefined,
              top: 28,
              borderRadius: 8,
              background: "rgba(255,255,255,.9)",
              boxShadow: "0 0 14px rgba(255,255,255,.7)",
            }}
          />
        )}
        {/* Bouclier */}
        {f.blocking && (
          <div
            style={{
              position: "absolute",
              width: 64, height: 64,
              left: f.face === 1 ? -8 : undefined,
              right: f.face === -1 ? -8 : undefined,
              top: 10,
              borderRadius: "9999px",
              background: "rgba(125,211,252,.25)",
              border: "2px solid rgba(125,211,252,.7)",
              boxShadow: "inset 0 0 10px rgba(56,189,248,.8)",
            }}
          />
        )}
      </div>
    );
  };

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
      {/* Contenu centré (plein écran) */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Bandeau titre (même style que Trompette) */}
        <div
          style={{
            background: BLUE_SOFT,
            border: `1px solid ${BLUE}`,
            color: "#0b1a4a",
            borderRadius: 14,
            textAlign: "center",
            padding: "18px 16px",
            marginBottom: 14,
            width: "100%",
            maxWidth: 980,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 900, color: BLUE }}>
            Ken — Combat ultime (2 joueurs)
          </div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
            Gagne <b>2 rounds</b> sur 3. <br />
            <b>J1</b> A/D (↔), W (saut), S (accroupi), F (léger), G (lourd), H (bloc), R (joker).&nbsp;|&nbsp;
            <b>J2</b> J/L (↔), I (saut), K (accroupi), O (léger), P (lourd), ; (bloc), U (joker).&nbsp;|&nbsp;
            <b>Espace</b> : Play/Pause
          </div>
        </div>

        {/* Infos + boutons */}
        <div style={{ width: "100%", maxWidth: 980, marginBottom: 12, padding: "0 6px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr minmax(140px, 180px) 1fr",
              gap: 12,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <HealthBar hp={p1.hp} label="Joueur 1" wins={p1.rounds} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: .6, opacity: .6 }}>Round</div>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{round}</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: .6 }}>Temps</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{timeLeft}s</div>
            </div>
            <HealthBar hp={p2.hp} label="Joueur 2" wins={p2.rounds} />
          </div>

          {/* Boutons actions (style identique à Trompette) */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            {!running ? (
              <button
                onClick={handlePlay}
                style={{
                  marginLeft: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: BLUE,
                  color: "#fff",
                  fontWeight: 800,
                }}
                disabled={matchOver}
              >
                ▶ Play
              </button>
            ) : (
              <button
                onClick={() => setRunning(false)}
                style={{
                  marginLeft: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 700,
                }}
                title="Pause (Espace)"
              >
                ⏸ Pause
              </button>
            )}

            <button
              onClick={handleStop}
              style={{
                marginLeft: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
              }}
              title="Arrêter et revenir au début du round"
            >
              ⏹ Stop
            </button>

            <button
              onClick={handleRejouer}
              style={{
                marginLeft: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
              }}
              title="Rejouer le match"
            >
              ↻ Rejouer le match
            </button>

            <button
              onClick={handleJoker1}
              style={{
                marginLeft: 12,
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${BLUE}`,
                background: "rgba(29,78,216,.06)",
                color: "#0b1a4a",
                fontWeight: 800,
                opacity: p1.jokerUsed ? .5 : 1,
                cursor: p1.jokerUsed ? "not-allowed" : "pointer",
              }}
              disabled={p1.jokerUsed || matchOver}
              title="Joueur 1 : +20 PV & invincibilité courte"
            >
              🧪 Joker J1
            </button>

            <button
              onClick={handleJoker2}
              style={{
                marginLeft: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${RED}`,
                background: "rgba(220,38,38,.06)",
                color: RED_DARK,
                fontWeight: 800,
                opacity: p2.jokerUsed ? .5 : 1,
                cursor: p2.jokerUsed ? "not-allowed" : "pointer",
              }}
              disabled={p2.jokerUsed || matchOver}
              title="Joueur 2 : +20 PV & invincibilité courte"
            >
              🧪 Joker J2
            </button>
          </div>

          {/* Message */}
          {message && (
            <div
              style={{
                width: "100%",
                borderRadius: 12,
                background: "rgba(0,0,0,.04)",
                padding: "10px 12px",
                textAlign: "center",
                fontSize: 13,
                border: "1px solid #e5e7eb",
              }}
            >
              {message}
            </div>
          )}
        </div>

        {/* Arène (mise à l’échelle responsive comme le canvas de Trompette) */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              position: "relative",
              width: ARENA_W,
              height: ARENA_H,
              // responsive scale :
              maxWidth: 1100,
              aspectRatio: `${ARENA_W} / ${ARENA_H}`,
              transformOrigin: "top center",
              // on laisse le navigateur faire le scale via width en vw
              width: "min(96vw, 1100px)",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
              background: "radial-gradient(ellipse at center,#0b1220 0%,#070b13 60%,#05070b 100%)",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
            }}
          >
            {/* Décor */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(transparent 98%, rgba(255,255,255,.05) 100%)", backgroundSize: "100% 12px", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,.06)" }} />
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,.06)" }} />
            <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: 80, background: "linear-gradient(0deg,rgba(0,0,0,.55),transparent)" }} />

            {/* Combattants */}
            <FighterView f={p1} tint="blue" />
            <FighterView f={p2} tint="red" />
          </div>
        </div>

        {/* Légende touches (compacte) */}
        <div style={{ fontSize: 12, opacity: .75, marginTop: 8, textAlign: "center" }}>
          <b>J1</b> A/D, W, S, F/G/H, R &nbsp;•&nbsp; <b>J2</b> J/L, I, K, O/P/;, U &nbsp;•&nbsp; <b>Espace</b> Play/Pause
        </div>
      </div>
    </div>
  );
}

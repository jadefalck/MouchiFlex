import { useEffect, useRef, useState, useCallback } from "react";

const RED = "#dc2626";
const RED_DARK = "#991b1b";

/*
  Parkour — Runner urbain (plein écran)
  Contrôles :
    - ↑ / W : sauter (double-saut autorisé)
    - ↓ / Shift : glisser (hitbox plus basse)
    - R : rejouer (reset + Play auto)
    - Espace : démarrer le niveau (START) — non affiché dans la légende

  Objectif (selon niveau) :
    - Atteindre une distance cible OU collecter X balises
    - Niveaux : 1 (lent) • 2 (moyen) • 3 (plus rapide)

  Nouveaux boutons :
    - ▶ Play (Espace)
    - Rejouer
    - ⏹ Stop
    - 🎟️ Joker : bouclier 4s (invincibilité), 1× par niveau
*/

export default function Parkour({ onComplete }) {
  const canvasRef = useRef(null);
  const rafRef = useRef();

  const [message, setMessage] = useState("");
  const [level, setLevel] = useState(1);
  const [started, setStarted] = useState(false); // pause au départ

  // Joker
  const [usedJoker, setUsedJoker] = useState(false);
  const invincibleUntil = useRef(0); // timestamp ms

  // Canvas
  const W = 900, H = 420;
  const GROUND_Y = H - 70;

  // Joueur
  const player = useRef({
    x: 140, y: GROUND_Y - 44, w: 28, h: 44,
    vy: 0, onGround: true, canDouble: true, sliding: false
  });

  // Monde
  const boxes = useRef([]);   // obstacles au sol: {x,y,w,h}
  const bars  = useRef([]);   // barres en hauteur: {x,y,w,h}
  const gaps  = useRef([]);   // trous: {x,w}
  const tags  = useRef([]);   // balises: {x,y,r}
  const speed = useRef(4.2);  // px/frame approx (varie avec lvl & distance)
  const spawnCd = useRef(0);  // cooldown de spawn
  const distance = useRef(0); // "m"
  const collected = useRef(0);
  const keys = useRef({});

  // Réglages par niveau (plus doux)
  const cfgRef = useRef({
    base: 4.2, spawnMin: 95, spawnMax: 135, dGoal: 800, cGoal: 6
  });

  const applyLevel = useCallback((lvl) => {
    if (lvl === 1) cfgRef.current = { base: 4.2, spawnMin: 95,  spawnMax: 135, dGoal: 800,  cGoal: 6 };
    else if (lvl === 2) cfgRef.current = { base: 5.0, spawnMin: 85,  spawnMax: 120, dGoal: 1000, cGoal: 8 };
    else cfgRef.current =          { base: 5.8, spawnMin: 75,  spawnMax: 105, dGoal: 1200, cGoal: 10 };
  }, []);

  // Audio bip
  const audioCtx = useRef(null);
  useEffect(() => {
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
  }, []);
  const beep = useCallback((f = 620, d = 0.06, g = 0.05) => {
    const ctx = audioCtx.current; if (!ctx) return;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = "square"; o.frequency.value = f;
    o.connect(gn).connect(ctx.destination);
    gn.gain.setValueAtTime(g, ctx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
    o.start(); o.stop(ctx.currentTime + d);
  }, []);

  // Utils
  const rand = (a,b)=> a + Math.random()*(b-a);
  const aabb = (a,b)=> a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // Prépare une run (PAUSE par défaut)
  const prepareRun = useCallback((forcedLevel) => {
    const lvl = forcedLevel ?? level;
    applyLevel(lvl);

    boxes.current = [];
    bars.current  = [];
    gaps.current  = [];
    tags.current  = [];
    distance.current = 0;
    collected.current = 0;
    speed.current = cfgRef.current.base;
    spawnCd.current = 30;

    const p = player.current;
    p.x = 140; p.y = GROUND_Y - 44; p.w = 28; p.h = 44;
    p.vy = 0; p.onGround = true; p.canDouble = true; p.sliding = false;

    setMessage("");
    setStarted(false);
    setUsedJoker(false);
    invincibleUntil.current = 0;
  }, [applyLevel, level]);

  useEffect(() => { prepareRun(level); }, [prepareRun, level]);

  // Démarrer réellement
  const startRun = useCallback(() => {
    setStarted(true);
  }, []);

  // Input
  useEffect(() => {
    const down = (e) => {
      // START niveau avec Espace
      if ((e.code === "Space" || e.key === " ") && !started) {
        e.preventDefault();
        startRun();
        return;
      }

      keys.current[e.code] = true;

      if (e.code === "KeyR") { beep(300,0.08); prepareRun(level); startRun(); }

      if (!started) return;

      // SAUT : ↑ / W (pas la barre espace)
      if ((e.code === "ArrowUp" || e.code === "KeyW") && (player.current.onGround || player.current.canDouble)) {
        player.current.vy = -12;
        if (!player.current.onGround) player.current.canDouble = false;
        player.current.onGround = false;
        beep(760,0.05,0.04);
      }
    };
    const up = (e) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [prepareRun, startRun, started, level, beep]);

  // Joker : invincibilité 4s
  const useJoker = () => {
    if (usedJoker || !started) return;
    setUsedJoker(true);
    invincibleUntil.current = performance.now() + 4000;
    beep(900, 0.12, 0.06);
    setMessage("Joker actif : invincibilité 4s ✨");
    setTimeout(() => setMessage(""), 1200);
  };
  const isInvincible = () => performance.now() < invincibleUntil.current;

  // Boucle
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    let last = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // fond
      ctx.fillStyle = "#0c1220";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.06)";
      for (let i = 0; i < 8; i++) {
        const bw = 80 + (i % 3) * 30;
        const bh = 80 + (i * 18);
        const bx = (i * 140 - (distance.current * 2) % 140) + 40;
        ctx.fillRect(bx, H - bh - 70, bw, bh);
      }
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

      // Pause : on dessine l'état figé et on n'update rien
      if (!started) {
        drawWorld(ctx);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // ——— UPDATE ———
      // vitesse de base (plus un léger palier avec la distance)
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

      // joueur : sliding
      const p = player.current;
      const sliding = keys.current.ArrowDown || keys.current.ShiftLeft || keys.current.ShiftRight;
      if (sliding && p.onGround) { p.sliding = true; p.h = 26; } else { p.sliding = false; p.h = 44; }

      // sol (si trou sous les pieds → tombe)
      let ground = GROUND_Y;
      for (const g of gaps.current) {
        if (p.x + p.w > g.x && p.x < g.x + g.w) { ground = H + 200; break; }
      }

      // gravité + vertical
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

      // collisions (ignorées si invincible)
      const inv = isInvincible();
      const hitObstacle =
        boxes.current.some(b => aabb(p, b)) ||
        (!p.sliding && bars.current.some(b => aabb(p, b)));

      if (!inv && (hitObstacle || p.y > H)) {
        // Échec → reset + message
        beep(320,0.08);
        prepareRun(level);
        setTimeout(() => setMessage("Oups ! Tu as heurté un obstacle. Clique sur ▶ Play ou appuie sur R pour rejouer."), 0);
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

      // distance + victoire
      distance.current += speed.current * dt * 10;
      if (distance.current >= cfgRef.current.dGoal || collected.current >= cfgRef.current.cGoal) {
        setMessage("🏁 Bien joué ! Niveau réussi.");
        beep(900,0.12,0.06);
        setStarted(false); // stop
        setTimeout(() => onComplete?.(), 600);
      }

      drawWorld(ctx, { invincible: inv, invLeft: Math.max(0, (invincibleUntil.current - performance.now()) / 1000) });
      rafRef.current = requestAnimationFrame(loop);
    };

    const drawWorld = (ctx, { invincible, invLeft }) => {
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
      if (invincible) {
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 22;
      }
      ctx.fillStyle = "#f43f5e"; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.shadowBlur = 0;

      // HUD
      drawHUD(ctx, cfgRef.current, distance.current, collected.current, invincible ? invLeft : 0);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [prepareRun, onComplete, started, level, beep]);

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
      {/* Bandeau titre rouge + règles */}
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
          Évite obstacles et trous, <b>saute</b> (↑/W) avec <b>double-saut</b>, et <b>glisse</b> (↓/Shift) sous les barres.
          Atteins la distance cible ou collecte assez de balises pour gagner. <b>R</b> pour rejouer.
        </div>
      </div>

      {/* Sélecteur de niveau + Play/Rejouer/Stop/Joker */}
      <div style={{ width:"100%", maxWidth:980, marginBottom:12, padding:"0 6px", textAlign:"center" }}>
        <div style={{ display:"inline-flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
          <span style={{ fontWeight:700 }}>Niveau :</span>
          {[1,2,3].map(n=>(
            <button
              key={n}
              onClick={()=>{ setLevel(n); prepareRun(n); }}
              style={{
                padding:"6px 10px",
                borderRadius:9999,
                border:`1px solid ${n===level?RED:"#e5e7eb"}`,
                background: n===level ? "rgba(220,38,38,.1)" : "#fff",
                fontWeight:800
              }}
              aria-pressed={n===level}
            >{n}</button>
          ))}
          {!started ? (
            <button
              onClick={startRun}
              style={{ marginLeft:10, padding:"8px 12px", borderRadius:10, border:"none", background:RED, color:"#fff", fontWeight:800 }}
              title="Espace pour démarrer"
            >▶ Play</button>
          ) : (
            <button
              onClick={()=>{ prepareRun(level); startRun(); }}
              style={{ marginLeft:10, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", fontWeight:700 }}
              title="Raccourci clavier : R"
            >Rejouer</button>
          )}

          <button
            onClick={()=>{ prepareRun(level); }}
            style={{ padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", fontWeight:700 }}
          >⏹ Stop</button>

          <button
            onClick={useJoker}
            disabled={usedJoker || !started}
            style={{
              padding:"8px 12px",
              borderRadius:10,
              border:`1px solid ${RED}`,
              background: usedJoker ? "#f3f4f6" : "rgba(220,38,38,.06)",
              color: usedJoker ? "#9ca3af" : RED_DARK,
              fontWeight:800,
              cursor: usedJoker || !started ? "not-allowed" : "pointer"
            }}
            title="Bouclier d’invincibilité 4s (1× par niveau)"
          >
            🎟️ Joker (bouclier 4s)
          </button>
        </div>

        <p style={{ margin:0, fontSize:13, opacity:.85, lineHeight:1.5 }}>
          Niv 1 : lent — Niv 2 : moyen — Niv 3 : plus rapide. Le jeu est en pause tant que tu n’as pas cliqué <b>Play</b>.
        </p>
      </div>

      {/* Canvas centré et responsive */}
      <div style={{ width:"100%", display:"flex", justifyContent:"center" }}>
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

      {/* Légende — on n’affiche PAS la barre espace */}
      <div style={{ fontSize:12, opacity:.8, marginTop:8 }}>
        ↑/W : sauter (double-saut) • ↓/Shift : glisser • R : rejouer
      </div>

      {message && (
        <div
          style={{
            marginTop: 8,
            fontWeight: 800,
            color: message.startsWith("🏁") ? "#16a34a" : "#ef4444",
            textAlign: "center",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function drawHUD(ctx, cfg, dist, tags, invLeft) {
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillRect(16, 16, 280, 98);
  ctx.strokeStyle = "rgba(0,0,0,.15)";
  ctx.strokeRect(16, 16, 280, 98);
  ctx.fillStyle = "#111";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`Distance : ${Math.floor(dist)} m / ${cfg.dGoal} m`, 26, 36);
  ctx.fillText(`Balises : ${tags} / ${cfg.cGoal}`, 26, 56);

  if (invLeft > 0) {
    ctx.fillStyle = "#b45309";
    ctx.fillText(`Joker bouclier : ${invLeft.toFixed(1)}s`, 26, 76);
  } else {
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`Joker bouclier : inactif`, 26, 76);
  }
}

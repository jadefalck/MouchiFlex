import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * MouchiFlex — Ciné Quiz (style “Question pour un champion”)
 * - UI plein écran (comme Trompette)
 * - Niveaux: 1→3 (seuils 60/65/70%), temps/question 12/10/8s
 * - Play (Espace), Rejouer, Stop, Joker 50/50 (1x par niveau)
 * - Passage auto au niveau suivant si seuil atteint
 * - Appelle onComplete() quand les 3 niveaux sont validés
 */

const RED = "#dc2626";
const RED_DARK = "#991b1b";

const LEVELS = [
  { id: 1, label: "Niveau 1", threshold: 0.6, timePerQuestion: 12 },
  { id: 2, label: "Niveau 2", threshold: 0.65, timePerQuestion: 10 },
  { id: 3, label: "Niveau 3", threshold: 0.7, timePerQuestion: 8 },
];

const QUESTIONS = {
  1: [
    { q: "Qui a réalisé Titanic ?", options: ["Steven Spielberg", "James Cameron", "Ridley Scott", "Peter Jackson"], answer: 1 },
    { q: "Dans quelle saga entend-on « Que la Force soit avec toi » ?", options: ["Star Trek", "Star Wars", "Dune", "Alien"], answer: 1 },
    { q: "Qui incarne Jack Sparrow ?", options: ["Orlando Bloom", "Johnny Depp", "Tom Holland", "Keanu Reeves"], answer: 1 },
    { q: "Quel studio a pour emblème un lion rugissant ?", options: ["Universal", "Paramount", "MGM", "20th Century Studios"], answer: 2 },
    { q: "Dans quel film cherche-t-on Nemo ?", options: ["Là-haut", "Le Monde de Nemo", "Cars", "Vice-Versa"], answer: 1 },
    { q: "Que signifie l’acronyme CGI ?", options: ["Computer-Generated Imagery", "Cinema Gradient Index", "Camera Graph Input", "Color Grading Intelligence"], answer: 0 },
    { q: "Quel réalisateur est surnommé le maître du suspense ?", options: ["Christopher Nolan", "Alfred Hitchcock", "David Fincher", "Bong Joon-ho"], answer: 1 },
    { q: "Dans quel film voit-on une DeLorean voyager dans le temps ?", options: ["Blade Runner", "Retour vers le futur", "Tron", "Terminator 2"], answer: 1 },
    { q: "Où se déroule le Festival de Cannes ?", options: ["Italie", "Espagne", "France", "Allemagne"], answer: 2 },
    { q: "Quel personnage porte un anneau au cœur d’une quête épique ?", options: ["Harry Potter", "Frodon", "Indiana Jones", "Luke Skywalker"], answer: 1 },
  ],
  2: [
    { q: "Qui a composé la musique d’Inception ?", options: ["Hans Zimmer", "John Williams", "Ennio Morricone", "Howard Shore"], answer: 0 },
    { q: "Quel film a remporté l’Oscar du Meilleur Film (cérémonie 2020) ?", options: ["1917", "Joker", "Parasite", "Once Upon a Time in Hollywood"], answer: 2 },
    { q: "Qui a réalisé Pulp Fiction ?", options: ["Martin Scorsese", "Quentin Tarantino", "Guy Ritchie", "PT Anderson"], answer: 1 },
    { q: "Quelle pilule choisit Neo pour découvrir la vérité ?", options: ["Bleue", "Rouge", "Verte", "Jaune"], answer: 1 },
    { q: "Quel film du Studio Ghibli met en scène un château ambulant ?", options: ["Le Voyage de Chihiro", "Mononoké", "Le Château ambulant", "Ponyo"], answer: 2 },
    { q: "Qui a réalisé La La Land ?", options: ["Damien Chazelle", "Greta Gerwig", "James Wan", "Sofia Coppola"], answer: 0 },
    { q: "Qui incarne Wolverine ?", options: ["Hugh Jackman", "Chris Evans", "Ryan Reynolds", "Robert Downey Jr."], answer: 0 },
    { q: "Quel festival remet l’Ours d’or ?", options: ["Venise", "Berlin", "Toronto", "Locarno"], answer: 1 },
    { q: "Dans quel film un anneau doit être détruit à la Montagne du Destin ?", options: ["Le Hobbit", "Willow", "Le Seigneur des Anneaux", "Narnia"], answer: 2 },
    { q: "Quel réalisateur est associé à Dunkirk et Interstellar ?", options: ["Christopher Nolan", "Sam Mendes", "Ron Howard", "Ridley Scott"], answer: 0 },
  ],
  3: [
    { q: "Qui a réalisé Le Fabuleux Destin d’Amélie Poulain ?", options: ["Jean-Pierre Jeunet", "Luc Besson", "Cédric Klapisch", "Michel Hazanavicius"], answer: 0 },
    { q: "Dans quel film entend-on « Je suis ton père » ?", options: ["Star Wars V", "Star Wars IV", "Star Wars VI", "Rogue One"], answer: 0 },
    { q: "Quel film d’animation a pour héros un rat cuisinier ?", options: ["Coco", "Ratatouille", "Soul", "Encanto"], answer: 1 },
    { q: "Qui a réalisé Blade Runner (1982) ?", options: ["Denis Villeneuve", "James Cameron", "Ridley Scott", "John Carpenter"], answer: 2 },
    { q: "Quelle actrice joue Furiosa dans Mad Max: Fury Road (2015) ?", options: ["Charlize Theron", "Scarlett Johansson", "Emily Blunt", "Margot Robbie"], answer: 0 },
    { q: "Quel film a popularisé la réplique « Why so serious? » ?", options: ["The Dark Knight", "Joker", "Watchmen", "Sin City"], answer: 0 },
    { q: "Qui a réalisé Le Parrain ?", options: ["Francis Ford Coppola", "Martin Scorsese", "Brian De Palma", "Sergio Leone"], answer: 0 },
    { q: "Quel réalisateur japonais est derrière Seven Samurai ?", options: ["Takashi Miike", "Akira Kurosawa", "Hayao Miyazaki", "Hirokazu Kore-eda"], answer: 1 },
    { q: "Dans Alien (1979), qui incarne Ripley ?", options: ["Sigourney Weaver", "Linda Hamilton", "Jodie Foster", "Jamie Lee Curtis"], answer: 0 },
    { q: "Quel film français a remporté l’Oscar du Meilleur Film International en 2020 ?", options: ["Hors Normes", "Portrait de la jeune fille en feu", "Les Misérables", "J’accuse"], answer: 2 },
  ],
};

function pct(x) { return Math.round(x * 100); }

export default function Cinema({ onComplete }) {
  const [levelIndex, setLevelIndex] = useState(0); // 0..2
  const level = LEVELS[levelIndex];
  const questions = useMemo(() => QUESTIONS[level.id], [level.id]);

  const [running, setRunning] = useState(false);
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [usedJoker, setUsedJoker] = useState(false);
  const [hidden, setHidden] = useState([]); // options masquées (indices)
  const [feedback, setFeedback] = useState(null); // "ok" | "ko" | null
  const [msg, setMsg] = useState("");
  const [finished, setFinished] = useState(false);

  const [timeLeft, setTimeLeft] = useState(level.timePerQuestion);
  const timer = useRef(null);

  // ---------- NOUVEAU : progression persistée par niveau ----------
  const [passedLevels, setPassedLevels] = useState(() => {
    try {
      const raw = localStorage.getItem("cinema_passedLevels");
      const arr = raw ? JSON.parse(raw) : [false, false, false]; // [niv1, niv2, niv3]
      return Array.isArray(arr) && arr.length === 3 ? arr : [false, false, false];
    } catch {
      return [false, false, false];
    }
  });

  useEffect(() => {
    localStorage.setItem("cinema_passedLevels", JSON.stringify(passedLevels));
  }, [passedLevels]);

  // dernier niveau sélectionnable manuellement (0 si niv1 pas passé, 1 si niv1 passé mais pas niv2, sinon 2)
  const lastUnlockedLevelIndex = useMemo(() => {
    if (!passedLevels[0]) return 0;
    if (!passedLevels[1]) return 1;
    return 2;
  }, [passedLevels]);

  // À l'arrivée, s'assurer qu'on ne se place pas sur un niveau verrouillé
  useEffect(() => {
    if (levelIndex > lastUnlockedLevelIndex) {
      setLevelIndex(lastUnlockedLevelIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUnlockedLevelIndex]);

  // Reset au changement de niveau
  useEffect(() => {
    clearInterval(timer.current);
    setRunning(false);
    setIdx(0);
    setCorrect(0);
    setUsedJoker(false);
    setHidden([]);
    setFeedback(null);
    setMsg("");
    setFinished(false);
    setTimeLeft(level.timePerQuestion);
  }, [level]);

  const start = useCallback(() => {
    if (finished) return;
    setRunning(true);
  }, [finished]);

  const stop = useCallback(() => {
    setRunning(false);
    clearInterval(timer.current);
    setIdx(0); setCorrect(0);
    setUsedJoker(false); setHidden([]); setFeedback(null);
    setMsg(""); setFinished(false);
    setTimeLeft(level.timePerQuestion);
  }, [level.timePerQuestion]);

  const replay = useCallback(() => {
    setRunning(false);
    setIdx(0); setCorrect(0);
    setUsedJoker(false); setHidden([]); setFeedback(null);
    setMsg(""); setFinished(false);
    setTimeLeft(level.timePerQuestion);
    setTimeout(() => setRunning(true), 0);
  }, [level.timePerQuestion]);

  // Espace → Play + chiffres 1..4
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (!running) start();
      }
      if (!running || feedback) return;
      if (e.code === "Digit1") handleAnswer(0);
      if (e.code === "Digit2") handleAnswer(1);
      if (e.code === "Digit3") handleAnswer(2);
      if (e.code === "Digit4") handleAnswer(3);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, feedback, start]);

  // Timer
  useEffect(() => {
    clearInterval(timer.current);
    if (!running || feedback) return;
    timer.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer.current);
          handleAnswer(-1); // timeout = faux
          return level.timePerQuestion;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, feedback, idx, level.timePerQuestion]);

  const q = questions[idx];
  const total = questions.length;
  const progressTime = (timeLeft / level.timePerQuestion) * 100;

  function handleAnswer(choice) {
    const good = choice === q.answer;
    setFeedback(good ? "ok" : "ko");
    if (good) setCorrect((c) => c + 1);

    setTimeout(() => {
      setFeedback(null);
      setHidden([]);
      if (idx + 1 < total) {
        setIdx((i) => i + 1);
        setTimeLeft(level.timePerQuestion);
      } else {
        // Fin du niveau
        setRunning(false);
        const ratio = correct / total + (good ? 1 / total : 0); // inclure dernière
        const passed = ratio >= level.threshold;

        if (passed) {
          // Marque le niveau comme validé et calcule si tout est fini
          let willHaveAll = false;
          setPassedLevels((prev) => {
            const next = [...prev];
            next[levelIndex] = true;
            willHaveAll = next.every(Boolean);
            return next;
          });

          const nextExists = levelIndex < LEVELS.length - 1;
          setMsg(
            `Bravo ! ${pct(ratio)}% ≥ ${pct(level.threshold)}%. ` +
            (nextExists ? "Niveau suivant débloqué." : "Jeu terminé 🎬")
          );

          // Passage auto au niveau suivant uniquement si le courant est réussi
          if (nextExists) {
            setTimeout(() => setLevelIndex((i) => i + 1), 1200);
          }

          // Si les 3 niveaux sont validés → termine et notifie le hub
          if (!nextExists) {
            // on est sur le dernier niveau ; onComplete sera appelé juste après
            setFinished(true);
            setTimeout(() => onComplete && onComplete(), 700);
          } else if (willHaveAll) {
            // cas rare si l'état s'aligne et que tous sont verts
            setFinished(true);
            setTimeout(() => onComplete && onComplete(), 700);
          }
        } else {
          setMsg(`Raté… ${pct(ratio)}% < ${pct(level.threshold)}%. Clique sur Rejouer.`);
        }
      }
    }, 600);
  }

  function useJoker() {
    if (usedJoker || !running || feedback) return;
    const wrongs = [0, 1, 2, 3].filter((i) => i !== q.answer);
    const pick2 = wrongs.sort(() => Math.random() - 0.5).slice(0, 2);
    setHidden(pick2);
    setUsedJoker(true);
  }

  // ---------- UI plein écran (comme Trompette) ----------
  return (
    <div
      style={{
        minHeight: "100svh",
        width: "100vw",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "#fff",
        padding: "16px 0 24px",
      }}
    >
      {/* Bandeau titre */}
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
          Ciné Quiz — Question pour un champion
        </div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Réponds à un maximum de questions dans le temps imparti. Objectifs :{" "}
          <b>60%</b> / <b>65%</b> / <b>70%</b>.
        </div>
      </div>

      {/* Barre de contrôle */}
      <div style={{ width: "100%", maxWidth: 980, marginBottom: 12, padding: "0 6px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontWeight: 700 }}>Niveau :</span>
          {[0, 1, 2].map((i) => {
            const lockedByProgress = i > lastUnlockedLevelIndex;
            return (
              <button
                key={i}
                onClick={() => {
                  if (lockedByProgress) return; // ne pas autoriser la sélection
                  setLevelIndex(i);
                }}
                disabled={lockedByProgress}
                style={{
                  padding: "6px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${i === levelIndex ? RED : "#e5e7eb"}`,
                  background: i === levelIndex ? "rgba(220,38,38,.1)" : "#fff",
                  fontWeight: 800,
                  opacity: lockedByProgress ? 0.5 : 1,
                  cursor: lockedByProgress ? "not-allowed" : "pointer",
                }}
                aria-pressed={i === levelIndex}
                title={lockedByProgress ? "Termine d’abord le niveau précédent" : `Aller au niveau ${LEVELS[i].id}`}
              >
                {LEVELS[i].id}
              </button>
            );
          })}

          {!running ? (
            <button
              onClick={start}
              style={{
                marginLeft: 10,
                padding: "8px 12px",
                borderRadius: 10,
                border: "none",
                background: RED,
                color: "#fff",
                fontWeight: 800,
              }}
              title="Espace pour jouer"
            >
              ▶ Play (Espace)
            </button>
          ) : (
            <button
              onClick={replay}
              style={{
                marginLeft: 10,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
              }}
            >
              Rejouer
            </button>
          )}

          <button
            onClick={stop}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              fontWeight: 700,
            }}
          >
            ⏹ Stop
          </button>

          <button
            onClick={useJoker}
            disabled={usedJoker}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${RED}`,
              background: usedJoker ? "#f3f4f6" : "rgba(220,38,38,.06)",
              color: usedJoker ? "#9ca3af" : RED_DARK,
              fontWeight: 800,
              cursor: usedJoker ? "not-allowed" : "pointer",
            }}
            title="Masque 2 mauvaises réponses (1x par niveau)"
          >
            🎟️ Joker 50/50
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
          Temps par question : <b>{level.timePerQuestion}s</b>. Raccourcis réponses : <b>1..4</b>.
        </p>
      </div>

      {/* Carte / panneau quiz */}
      <div
        style={{
          width: "min(96vw, 1100px)",
          maxWidth: 1100,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          boxShadow: "0 8px 28px rgba(0,0,0,.06)",
          background: "#fff",
          padding: 16,
        }}
      >
        {/* Timer */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4b5563" }}>
            <span>Temps</span>
            <span>
              {timeLeft}s / {level.timePerQuestion}s
            </span>
          </div>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 9999, overflow: "hidden" }}>
            <div
              style={{
                width: `${progressTime}%`,
                height: "100%",
                background: RED,
                transition: "width .2s linear",
              }}
            />
          </div>
        </div>

        {/* Question */}
        <div style={{ padding: "8px 4px 0" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
            {q.q}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {q.options.map((opt, i) => {
              const isHidden = hidden.includes(i);
              const isOk = feedback && i === q.answer;
              const isKo = feedback && i !== q.answer;

              return (
                <button
                  key={i}
                  disabled={!running || !!feedback || isHidden}
                  onClick={() => handleAnswer(i)}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px",
                    borderRadius: 12,
                    border: `1px solid ${
                      isHidden ? "#e5e7eb"
                      : isOk ? "#22c55e"
                      : isKo ? "#ef4444"
                      : "#e5e7eb"
                    }`,
                    background:
                      isHidden ? "#f9fafb"
                      : isOk ? "rgba(34,197,94,.08)"
                      : isKo ? "rgba(239,68,68,.06)"
                      : "#fff",
                    color: isHidden ? "#9ca3af" : "#111827",
                    cursor: !running || !!feedback || isHidden ? "not-allowed" : "pointer",
                    transition: "background .15s ease",
                  }}
                >
                  <span style={{ fontWeight: 700, marginRight: 6 }}>
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stat bar */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#4b5563",
          }}
        >
          <span>
            Bonnes réponses : <b style={{ color: "#111827" }}>{correct}</b> / {total}
          </span>
          <span>
            Taux actuel :{" "}
            <b style={{ color: "#111827" }}>
              {pct(correct / Math.max(1, idx + (feedback ? 1 : 0)))}%
            </b>
          </span>
          <span>
            Question : <b style={{ color: "#111827" }}>{idx + 1}</b> / {total}
          </span>
        </div>

        {/* Messages */}
        {(!running || msg) && (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${msg ? "#93c5fd" : "#fde68a"}`,
              background: msg ? "rgba(59,130,246,.06)" : "rgba(245,158,11,.06)",
              color: msg ? "#1e3a8a" : "#78350f",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
            }}
          >
            {msg || "Appuie sur Espace ou clique sur Play pour commencer."}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
        Raccourcis : <b>Espace</b> (Play) • <b>1–4</b> (réponses) • <b>Rejouer</b> / <b>⏹ Stop</b>
      </div>
    </div>
  );
}


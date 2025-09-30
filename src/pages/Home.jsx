// src/pages/Home.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProgress } from "../state/useProgress";
import personnage from "../images/personnage.png";
import bgLevels from "../images/fond2.jpg"; // fond pour la section Niveaux

const RED = "#dc2626";
const RED_BG_SOFT_1 = "rgba(220, 38, 38, .08)";
const RED_BG_SOFT_2 = "rgba(220, 38, 38, .03)";
const RED_DARK = "#991b1b";

export default function Home() {
  const navigate = useNavigate();
  const { unlocked, isUnlocked } = useProgress();

  const levels = useMemo(
    () => [
      { id: "peniche",   title: "Péniche",   desc: "Runner sur l’eau." },
      { id: "trompette", title: "Trompette", desc: "Jeu de rythme." },
      { id: "cuisine",   title: "Cuisine",   desc: "Recettes chrono." },
      { id: "parkour",   title: "Parkour",   desc: "Runner urbain." },
      { id: "cinema",    title: "Cinéma",    desc: "Mini-jeux enchaînés." },
      { id: "ken",       title: "Ken",       desc: "Combat 1v1." },
    ],
    []
  );

  return (
    <div
      style={{
        // Wrapper plein écran + padding zones sûres iOS
        minHeight: "100svh",
        width: "100vw",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "#fff",
      }}
    >
      {/* -------- HERO FULL-WIDTH (bande horizontale) -------- */}
      <section
        style={{
          margin: "0 calc(50% - 50vw)", // s'étire de gauche à droite, hors container
          width: "100vw",
          padding: "16px 0 18px",
          textAlign: "center",
          background:
            "radial-gradient(70% 60% at 50% 35%, rgba(220,38,38,.18), rgba(220,38,38,.06) 70%), linear-gradient(180deg, rgba(220,38,38,.10), rgba(220,38,38,.03))",
          borderBottom: "1px solid rgba(220,38,38,.12)",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 8vw, 56px)",
              fontWeight: 900,
              color: RED,
              lineHeight: 1.05,
              letterSpacing: ".5px",
            }}
          >
            MouchiFlex
          </h1>
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: "clamp(10px, 2.4vw, 14px)",
              letterSpacing: "2px",
              fontWeight: 800,
              color: RED_DARK,
            }}
          >
            NI DIEU NI MAITRE
          </p>
        </div>
      </section>

      {/* --------- CONTENU (prend la place restante) --------- */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ maxWidth: 980, margin: "24px auto 40px", padding: "0 16px", width: "100%" }}>
          {/* Avatar + pitch + devise */}
          <section
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            {/* Ovale vertical avec bord rouge */}
            <div
              style={{
                width: 140,
                height: 205,
                border: `3px solid ${RED}`,
                borderRadius: "60% / 75%",
                overflow: "hidden",
                flex: "0 0 auto",
              }}
            >
              <img
                src={personnage}
                alt="Portrait de MouchiFlex"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            <div style={{ minWidth: 260, flex: 1 }}>
              <p
                style={{
                  margin: "0 0 6px 0",
                  lineHeight: 1.55,
                  fontSize: "clamp(14px, 2.4vw, 16px)",
                }}
              >
                <b>MouchiFlex</b> n’est pas un héros classique… C’est un personnage{" "}
                <b>attachiant et grande gueule</b>, parfois un peu misogyne, persuadé
                d’être au-dessus de tout le monde. 🙄 Pour le mettre au défi, on lui a
                préparé une série de <b>jeux absurdes</b> qu’il devra terminer s’il veut
                continuer à faire croire qu’il est “trop fort”. Chaque univers est conçu
                pour lui mettre des bâtons dans les roues et tester sa prétendue
                supériorité. 
              </p>
              <p
                style={{
                  margin: 0,
                  opacity: 0.8,
                  fontSize: "clamp(13px, 2.2vw, 15px)",
                }}
              >
                <i>Devise :</i> « <b>Hani tamid tso dek</b> »
              </p>
            </div>

          </section>

          {/* Carte "Le concept" */}
          <section
            style={{
              background: `linear-gradient(180deg, ${RED_BG_SOFT_1}, ${RED_BG_SOFT_2})`,
              border: `1px solid rgba(220,38,38,.25)`,
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              boxShadow: "0 1px 0 rgba(0,0,0,.03)",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px 0",
                color: RED_DARK,
                fontSize: "clamp(18px, 3.6vw, 22px)",
              }}
            >
              Le concept
            </h2>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: "clamp(14px, 2.4vw, 16px)" }}>
              C’est un jeu à niveaux : termine un défi pour <b>débloquer le suivant</b>.
              Chaque niveau est un mini-jeu dans un univers différent (péniche,
              trompette, cuisine, parkour, cinéma, ken). Progresse et arrive
              au combat final.
            </p>
          </section>

          {/* Section Niveaux : fond appliqué uniquement ici */}
          <section
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,.92), rgba(255,255,255,.92)), url(${bgLevels})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              borderRadius: 16,
              padding: 16,
              border: "1px solid #eee",
            }}
            aria-label="Liste des niveaux du jeu"
          >
            <p style={{ opacity: 0.8, marginBottom: 12, fontSize: "clamp(13px, 2.2vw, 15px)" }}>
              Niveaux débloqués : {unlocked.length} / {levels.length}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))",
                gap: 16,
              }}
            >
              {levels.map((l) => {
                const locked = !isUnlocked(l.id);
                return (
                  <article
                    key={l.id}
                    style={{
                      border: "1px solid #e6e6e6",
                      borderRadius: 12,
                      padding: 14,
                      background: "rgba(255,255,255,.98)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minHeight: 118,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "clamp(14px, 2.6vw, 16px)" }}>{l.title}</div>
                        <div style={{ fontSize: "clamp(12px, 2.2vw, 13px)", opacity: 0.8 }}>{l.desc}</div>
                      </div>
                      <span aria-hidden="true" style={{ fontSize: 18 }}>
                        {locked ? "🔒" : "▶️"}
                      </span>
                    </div>

                    <button
                      style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: locked ? "#eee" : RED,
                        color: locked ? "#777" : "#fff",
                        border: "none",
                        fontWeight: 700,
                        fontSize: "clamp(13px, 2.4vw, 15px)",
                        cursor: locked ? "not-allowed" : "pointer",
                        transition: "transform .04s ease",
                      }}
                      disabled={locked}
                      onClick={() => navigate(`/play/${l.id}`)}
                      aria-label={locked ? `${l.title} verrouillé` : `Jouer à ${l.title}`}
                      onMouseDown={(e) => {
                        if (!locked) e.currentTarget.style.transform = "scale(0.98)";
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      {locked ? "Termine le niveau précédent" : `Jouer à ${l.title}`}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      {/* Footer (optionnel) */}
      <footer style={{ height: 8 }} />
    </div>
  );
}

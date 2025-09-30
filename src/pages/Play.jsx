// src/pages/Play.jsx
import { useEffect } from "react";
//import { useNavigate, useParams, Link } from "react-router-dom";
import { useProgress, getLevelsOrder } from "../state/useProgress";
import Peniche from "../levels/Peniche";
import Stub from "../levels/Stub";
import Trompette from "../levels/Trompette";
import Cuisine from "../levels/Cuisine"; 
import Parkour from "../levels/Parkour";
import Cinema from "../levels/Cinema";
import Ken from "../levels/Ken";
import { Link, useParams, useNavigate } from "react-router-dom";

const META = {
  peniche:   { title: "Péniche" },
  trompette: { title: "Trompette" },
  cuisine:   { title: "Cuisine" },
  parkour:   { title: "Parkour" },
  cinema:    { title: "Cinéma" },
  ken:       { title: "Ken" },
};

export default function Play() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isUnlocked, unlock, getNext } = useProgress();

  useEffect(() => {
    if (!id || !isUnlocked(id)) {
      navigate("/"); // si niveau non débloqué
    }
  }, [id, isUnlocked, navigate]);

  const handleWin = () => {
    const next = getNext(id);
    if (next) unlock(next);
    navigate("/"); // retour au menu
  };

  const title = META[id]?.title || id;

  // route vers composant de niveau
  let Level = null;
    switch (id) {
    case "peniche":
        Level = Peniche; 
        break;
    case "trompette":
        Level = Trompette;
        break;
    case "cuisine":
        Level = Cuisine;         
        break;
    case "parkour":
        Level = Parkour;
        break;
    case "cinema":
        Level = Cinema;
        break;  
    case "ken":
        Level = Ken;
        break;  
    default:
        Level = Stub;
    }

  return (
    <div style={{ maxWidth: 980, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <Link
          to="/"
          style={{
            textDecoration: "none",
            background: "#dc2626",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 10,
            fontWeight: 800,
            border: "1px solid #dc2626",
          }}
        >
          ⟵ Retour
        </Link>
      </div>

      <Level onComplete={handleWin} />
      {/* supprime la ligne "Ordre des niveaux : ..." */}
    </div>
  );
}

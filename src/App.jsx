// src/App.jsx
import { Routes, Route, Navigate, Link } from "react-router-dom";
import Home from "./pages/Home";
import Play from "./pages/Play";
import "./index.css";

const RED = "#dc2626"; // rouge principal

export default function App() {
  return (
    <div>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#fff",
          borderBottom: "1px solid #eee",
          padding: "14px 16px",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center" }}>
          <Link
            to="/"
            style={{
              textDecoration: "none",
              fontWeight: 800,
              color: RED,
              fontSize: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span role="img" aria-label="sport">🤸</span>
            MouchiFlex
          </Link>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play/:id" element={<Play />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}


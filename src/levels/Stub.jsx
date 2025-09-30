// src/levels/Stub.jsx
export default function Stub({ onComplete }) {
  return (
    <div style={{border: "1px dashed #aaa", borderRadius: 12, padding: 16}}>
      <p style={{margin: 0}}>
        🔧 Ce niveau est un placeholder. Tu peux coder ce mini-jeu ici.
      </p>
      <button style={{marginTop: 12}} onClick={() => onComplete?.()}>
        Terminer (débloquer le suivant)
      </button>
    </div>
  );
}

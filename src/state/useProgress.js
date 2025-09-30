// src/state/useProgress.js
const STORAGE_KEY = "gymnaste_progress_v1";

// L'ordre des niveaux (mets à jour ici si tu en ajoutes)
export function getLevelsOrder() {
  return ["peniche", "trompette", "cuisine", "shabbat", "parkour", "cinema", "ken"];
}

export function saveProgress(unlocked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unlocked));
  } catch {}
}

import { useEffect, useState, useCallback } from "react";

// ---- Tout débloqué par défaut ----
const ALL_LEVELS = getLevelsOrder();

export function useProgress() {
  // on ignore l'ancien localStorage et on force tout ouvert
  const [unlocked, setUnlocked] = useState(ALL_LEVELS);

  // on écrase aussi le localStorage pour éviter que l'ancien état ne revienne
  useEffect(() => {
    saveProgress(ALL_LEVELS);
    setUnlocked(ALL_LEVELS);
  }, []);

  // tout est considéré comme débloqué
  const isUnlocked = useCallback(() => true, []);

  // fonctions conservées pour compatibilité (ne font plus rien de spécial)
  const unlock = useCallback(() => {}, []);
  const reset = useCallback(() => setUnlocked(ALL_LEVELS), []);
  const getNext = useCallback(() => null, []);

  return { unlocked, isUnlocked, unlock, reset, getNext };
}

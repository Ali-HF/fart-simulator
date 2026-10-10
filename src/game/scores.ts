export interface ScoreEntry {
  score: number;
  date: string;
  rank: string;
}

const KEY = "fartsim.highscores.v1";

export function rankFor(score: number): string {
  if (score >= 3000) return "Legendary Gas Giant";
  if (score >= 2000) return "Methane Marshal";
  if (score >= 1200) return "Cheek Clapper";
  if (score >= 700) return "Silent But Deadly";
  if (score >= 350) return "Bean Enthusiast";
  if (score >= 120) return "Little Tooter";
  return "Holding It In";
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 5);
  } catch {
    return [];
  }
}

export function saveScore(score: number): ScoreEntry[] {
  const entry: ScoreEntry = {
    score,
    date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    rank: rankFor(score),
  };
  const list = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, 5);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function clearScores(): ScoreEntry[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}

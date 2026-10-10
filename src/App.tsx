import { useCallback, useEffect, useRef, useState } from "react";
import { FartGame, type GameState, type HudSnapshot } from "./game/engine";
import { clearScores, loadScores, rankFor, saveScore, type ScoreEntry } from "./game/scores";
import { isMuted, setMuted, triggerHaptic, unlockAudio } from "./game/audio";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<FartGame | null>(null);
  const deadAtRef = useRef(0);

  const [state, setState] = useState<GameState>("menu");
  const [hud, setHud] = useState<HudSnapshot>({ score: 0, best: 0, combo: 1, gas: 100 });
  const [finalScore, setFinalScore] = useState(0);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [muted, setMutedState] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  useEffect(() => {
    setScores(loadScores());
  }, []);

  // Engine mount
  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new FartGame(canvas);
    gameRef.current = game;
    game.best = loadScores()[0]?.score ?? 0;
    game.onHud = setHud;
    game.onState = (s, score) => {
      setState(s);
      if (s === "dead") {
        deadAtRef.current = performance.now();
        setFinalScore(score);
        const prevBest = loadScores()[0]?.score ?? 0;
        setIsNewBest(score > prevBest);
        const list = saveScore(score);
        setScores(list);
        game.best = list[0]?.score ?? 0;
      }
    };
    game.mount();

    const ro = new ResizeObserver(() => game.resize());
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      game.unmount();
      gameRef.current = null;
    };
  }, []);

  // Instant start when clicking Let It Rip or Try Again
  const launchGame = useCallback(() => {
    unlockAudio();
    triggerHaptic("medium");

    const g = gameRef.current;
    if (!g) return;

    g.start();
    g.setThrust(true);
  }, []);

  const primaryAction = useCallback(
    (down: boolean) => {
      const g = gameRef.current;
      if (!g) return;
      unlockAudio();

      if (!down) {
        g.setThrust(false);
        return;
      }

      if (g.state === "menu") {
        launchGame();
      } else if (g.state === "playing") {
        g.setThrust(true);
      } else if (g.state === "paused") {
        g.resume();
      } else if (g.state === "dead" && performance.now() - deadAtRef.current > 400) {
        launchGame();
      }
    },
    [launchGame],
  );

  // Keyboard controls
  useEffect(() => {
    const isAction = (k: string) => k === " " || k === "Spacebar" || k === "ArrowUp" || k === "w" || k === "W";
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isAction(e.key)) {
        e.preventDefault();
        primaryAction(true);
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        const g = gameRef.current;
        if (!g) return;
        if (g.state === "playing") g.pause();
        else if (g.state === "paused") g.resume();
      } else if (e.key === "m" || e.key === "M") {
        const next = !isMuted();
        setMuted(next);
        setMutedState(next);
      } else if (e.key === "r" || e.key === "R") {
        if (gameRef.current?.state !== "menu") launchGame();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isAction(e.key)) {
        e.preventDefault();
        primaryAction(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [primaryAction, launchGame]);

  // Tab blur auto-pause
  useEffect(() => {
    const onBlur = () => {
      if (gameRef.current?.state === "playing") gameRef.current?.pause();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && gameRef.current?.state === "playing") {
        gameRef.current?.pause();
      }
    });
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    triggerHaptic("light");
  };

  const gasLow = hud.gas < 25;

  return (
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden bg-[#0a110d] text-zinc-100">
      {/* Top Status Header - Dark Industrial Minimal */}
      <header className="z-20 flex h-13 shrink-0 items-center justify-between border-b border-lime-500/10 bg-[#0d140e]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-950/80 border border-lime-800/40 text-sm">
            ☣️
          </span>
          <div>
            <h1 className="text-xs font-bold tracking-wider text-lime-400 uppercase">FART SIMULATOR</h1>
            <p className="text-[9px] font-medium text-lime-300/40 tracking-tight">Biohazard Hazard Zone</p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            aria-label="Toggle Sound"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-lime-900/30 bg-black/40 text-xs active:scale-95 text-zinc-300 hover:text-white transition"
          >
            {muted ? "🔇" : "🔊"}
          </button>

          {state === "playing" && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                gameRef.current?.pause();
                triggerHaptic("light");
              }}
              aria-label="Pause Game"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-900/30 bg-amber-950/40 text-xs text-amber-300 active:scale-95"
            >
              ⏸
            </button>
          )}

          {state === "menu" && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                setShowHowTo((prev) => !prev);
              }}
              aria-label="Help"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-lime-900/30 bg-black/40 text-xs font-semibold text-zinc-300 active:scale-95"
            >
              ?
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Gaming Area */}
      <main
        className="relative flex-1 w-full h-full overflow-hidden bg-[#0c130e]"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (state === "ready") return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          primaryAction(true);
        }}
        onPointerUp={() => primaryAction(false)}
        onPointerCancel={() => primaryAction(false)}
        onPointerLeave={() => primaryAction(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" />

        {/* Low Gas Emergency Ambient Warning */}
        {state === "playing" && gasLow && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-t from-red-600/25 via-red-950/10 to-transparent" />
        )}

        {/* ---------------- MAIN MENU (Clean Industrial) ---------------- */}
        {state === "menu" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4 sm:p-8 bg-gradient-to-b from-black/80 via-[#0a120c]/85 to-black/90 backdrop-blur-sm overflow-y-auto">
            {/* Top Subtitle Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-lime-900/40 bg-lime-950/40 px-3 py-1 text-[11px] font-medium text-lime-400">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-400 animate-pulse" />
              <span>Biohazard Pipeline Simulation</span>
            </div>

            {/* Hero Section */}
            <div className="flex flex-col items-center text-center my-auto max-w-sm">
              <div className="relative mb-3 flex items-center justify-center">
                <div className="absolute -inset-3 rounded-full bg-lime-500/10 blur-lg" />
                <span className="relative text-6xl select-none">
                  🍑
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
                FART <span className="text-lime-400">SIMULATOR</span>
              </h2>
              <p className="mt-2 text-xs font-normal text-zinc-400 leading-relaxed px-4">
                Control intestinal thrust to navigate through hazardous industrial sewer pipes and collect beans.
              </p>

              {/* Best Score Record */}
              {scores.length > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-lime-900/30 bg-black/40 px-3.5 py-1.5 text-xs text-zinc-300">
                  <span className="text-zinc-400 font-medium">Record:</span>
                  <span className="text-lime-300 font-bold">{scores[0].score}</span>
                  <span className="text-zinc-500 text-[10px]">({scores[0].rank})</span>
                </div>
              )}

              {/* Start Button */}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  launchGame();
                }}
                className="mt-6 w-full max-w-xs rounded-xl border border-lime-600/30 bg-gradient-to-r from-lime-600 to-lime-500 py-3.5 text-sm font-bold uppercase tracking-wider text-black shadow-lg shadow-lime-950/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span>Launch Game</span>
                <span>💨</span>
              </button>
            </div>

            {/* Instructions Strip */}
            <div className="w-full max-w-sm rounded-xl border border-lime-950/60 bg-black/40 p-2.5 backdrop-blur-sm">
              <div className="flex items-center justify-around text-center text-[10px] text-zinc-400 font-medium">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm">👆</span>
                  <span>Hold to Float</span>
                </div>
                <div className="h-4 w-px bg-zinc-800" />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm">🫘</span>
                  <span>Refill Gas</span>
                </div>
                <div className="h-4 w-px bg-zinc-800" />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm">⚡</span>
                  <span>Graze Combo</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- HOW TO PLAY MODAL ---------------- */}
        {showHowTo && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl border border-lime-900/40 bg-[#0d140e] p-5 text-left shadow-2xl">
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                <h3 className="text-sm font-bold text-lime-400">Game Mechanics</h3>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setShowHowTo(false);
                  }}
                  className="h-7 w-7 rounded-lg bg-zinc-900 text-zinc-400 flex items-center justify-center text-xs font-bold hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3.5 space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-lime-400">1.</span>
                  <p><strong>Hold anywhere:</strong> Expels gas to propel upward against gravity.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-lime-400">2.</span>
                  <p><strong>Gas Gauge:</strong> Thrust drains fuel. Pick up beans to replenish.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-lime-400">3.</span>
                  <p><strong>Pipe Grazing:</strong> Fly close to pipe rims to build score multipliers (up to 9x).</p>
                </div>
              </div>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setShowHowTo(false);
                }}
                className="mt-5 w-full rounded-xl bg-lime-500 py-2.5 font-bold text-black uppercase tracking-wider text-xs active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ---------------- PAUSE SCREEN ---------------- */}
        {state === "paused" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-4 text-center backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-[#0d140e] p-5 shadow-2xl">
              <span className="text-3xl">⏸</span>
              <h2 className="mt-2 text-lg font-bold text-zinc-200">Game Paused</h2>
              <p className="mt-0.5 text-xs text-lime-400">Current Score: {Math.floor(hud.score)}</p>

              <div className="mt-5 space-y-2">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    gameRef.current?.resume();
                    triggerHaptic("light");
                  }}
                  className="w-full rounded-xl bg-lime-500 py-2.5 text-xs font-bold uppercase tracking-wider text-black active:scale-[0.98]"
                >
                  Resume
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    launchGame();
                  }}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 text-xs font-medium text-zinc-300 active:bg-zinc-800"
                >
                  Restart
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const g = gameRef.current;
                    if (g) {
                      g.state = "menu";
                      setState("menu");
                    }
                  }}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- GAME OVER SCREEN ---------------- */}
        {state === "dead" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-4 text-center backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#0e140f] p-5 shadow-2xl">
              <span className="text-3xl">💥</span>
              <h2 className="mt-1 text-xl font-bold text-red-400">
                Crash
              </h2>
              <p className="mt-0.5 text-xs font-medium text-zinc-400">
                {isNewBest ? "🎉 New High Score!" : rankFor(finalScore)}
              </p>
              <div className="my-2.5 flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-white tabular-nums">{finalScore}</span>
                <span className="text-xs text-zinc-500 font-medium">PTS</span>
              </div>

              {/* High Scores List */}
              <div className="my-2.5 max-h-32 overflow-y-auto rounded-xl border border-zinc-800/80 bg-black/50 p-2 text-left">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-zinc-800 text-[10px] text-zinc-500 font-medium uppercase">
                  <span>Leaderboard</span>
                  <span>Top Runs</span>
                </div>
                {scores.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-baseline justify-between py-0.5 text-xs ${
                      s.score === finalScore && isNewBest && i === 0
                        ? "text-lime-400 font-bold bg-lime-950/30 px-1 rounded"
                        : "text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 text-zinc-600 text-[10px]">{i + 1}</span>
                      <span className="truncate text-[11px] max-w-[120px]">{s.rank}</span>
                    </div>
                    <span className="tabular-nums font-mono text-zinc-300 text-xs">{s.score}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mt-3.5">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    launchGame();
                  }}
                  className="w-full rounded-xl bg-lime-500 py-3 text-xs font-bold uppercase tracking-wider text-black active:scale-[0.98] transition"
                >
                  Try Again
                </button>
                <div className="flex gap-2">
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const g = gameRef.current;
                      if (g) {
                        g.state = "menu";
                        setState("menu");
                      }
                    }}
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2 text-xs font-medium text-zinc-300 active:bg-zinc-800"
                  >
                    Main Menu
                  </button>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setScores(clearScores());
                    }}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-[11px] text-zinc-500 hover:text-red-400"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer hint */}
      <footer className="z-10 flex h-9 shrink-0 items-center justify-center border-t border-zinc-900 bg-black/60 px-2 text-center">
        <p className="text-[10px] font-medium text-zinc-500">
          {state === "playing" ? "Touch & Hold to Thrust Upward" : "Touch / Spacebar to Fly"}
        </p>
      </footer>

      {/* Minimal Keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}

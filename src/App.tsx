import { useCallback, useEffect, useRef, useState } from "react";
import { FartGame, type GameState, type HudSnapshot } from "./game/engine";
import { clearScores, loadScores, rankFor, saveScore, type ScoreEntry } from "./game/scores";
import { isMuted, playFart, setMuted, triggerHaptic, unlockAudio } from "./game/audio";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<FartGame | null>(null);
  const deadAtRef = useRef(0);
  const getReadyTimerRef = useRef<number | null>(null);

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
      if (getReadyTimerRef.current) clearTimeout(getReadyTimerRef.current);
      game.unmount();
      gameRef.current = null;
    };
  }, []);

  // Smooth brief "Get Ready" pause (short ~500ms breather so user can position finger)
  const launchGame = useCallback(() => {
    unlockAudio();
    triggerHaptic("medium");
    if (getReadyTimerRef.current) clearTimeout(getReadyTimerRef.current);

    const g = gameRef.current;
    if (!g) return;

    g.startCountdown();

    getReadyTimerRef.current = window.setTimeout(() => {
      getReadyTimerRef.current = null;
      g.start();
    }, 450);
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
      } else if (g.state === "dead" && performance.now() - deadAtRef.current > 600) {
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
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden bg-[#0a100a] text-white">
      {/* Top Status Header */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-lime-500/15 bg-black/60 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-lime-500/20 text-lg shadow-[inset_0_0_8px_rgba(163,230,53,0.3)]">
            💨
          </span>
          <div>
            <h1 className="text-sm font-black tracking-wide text-lime-400">FART SIMULATOR</h1>
            <p className="text-[10px] font-bold text-lime-200/60">Hold to Toot &amp; Float</p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            aria-label="Toggle Sound"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-lime-500/25 bg-lime-950/40 text-base active:scale-95"
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-950/40 text-base text-amber-300 active:scale-95"
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-lime-500/20 bg-lime-900/30 text-sm font-bold text-lime-300 active:scale-95"
            >
              ❓
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Gaming Area */}
      <main
        className="relative flex-1 w-full h-full overflow-hidden bg-[#131d14]"
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
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-t from-red-600/30 via-red-900/10 to-transparent" />
        )}

        {/* ---------------- GET READY BRIEF BREATHER OVERLAY ---------------- */}
        {state === "ready" && (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in">
            <div className="flex flex-col items-center">
              <span className="text-4xl sm:text-5xl font-black text-lime-300 tracking-wider drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] animate-pulse">
                GET READY! 💨
              </span>
              <p className="mt-2 text-xs font-bold text-lime-200/80">Hold screen to float</p>
            </div>
          </div>
        )}

        {/* ---------------- MAIN MENU ---------------- */}
        {state === "menu" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4 sm:p-8 bg-gradient-to-b from-black/75 via-[#0e180d]/85 to-black/90 backdrop-blur-md overflow-y-auto">
            {/* Top Badge */}
            <div className="mt-2 flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-950/60 px-4 py-1.5 shadow-[0_4px_15px_rgba(132,204,22,0.15)]">
              <span className="h-2 w-2 rounded-full bg-lime-400 animate-ping" />
              <span className="text-xs font-extrabold tracking-widest text-lime-300 uppercase">
                Arcade Simulator
              </span>
            </div>

            {/* Hero Title & Mascot */}
            <div className="flex flex-col items-center text-center my-auto max-w-sm">
              <div className="relative mb-3 flex items-center justify-center">
                <div className="absolute -inset-4 rounded-full bg-lime-500/20 blur-xl animate-pulse" />
                <span className="relative text-7xl select-none drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
                  🍑
                </span>
              </div>

              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
                FART <span className="text-lime-400">SIMULATOR</span>
              </h2>
              <p className="mt-2 text-xs sm:text-sm font-medium text-lime-200/80 leading-relaxed px-4">
                Tap &amp; hold to blast gas through treacherous pipelines. Munch beans to stay airborne and rack up insane combos!
              </p>

              {/* Best Score Pill */}
              {scores.length > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-lime-500/30 bg-lime-900/30 px-4 py-2 text-xs font-bold text-lime-300">
                  <span>🏆 High Score:</span>
                  <span className="text-amber-300 font-extrabold text-sm">{scores[0].score}</span>
                  <span className="text-lime-400/60 text-[10px]">({scores[0].rank})</span>
                </div>
              )}

              {/* Primary Start Button */}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  launchGame();
                }}
                className="mt-6 w-full max-w-xs rounded-2xl border-b-[5px] border-lime-700 bg-gradient-to-r from-lime-400 via-lime-500 to-lime-400 py-4 text-base font-black uppercase tracking-wider text-lime-950 shadow-[0_12px_30px_rgba(132,204,22,0.4)] active:translate-y-1 active:border-b-2 active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <span>LET IT RIP</span>
                <span className="text-xl">💨</span>
              </button>
            </div>

            {/* Quick Controls Bar */}
            <div className="w-full max-w-sm rounded-2xl border border-lime-500/20 bg-black/40 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-around text-center text-[11px] font-bold text-lime-200/80">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">👆</span>
                  <span>Hold to Float</span>
                </div>
                <div className="h-6 w-px bg-lime-500/20" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">🫘</span>
                  <span>Eat Beans</span>
                </div>
                <div className="h-6 w-px bg-lime-500/20" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">⚡</span>
                  <span>Graze for Combo</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- HOW TO PLAY MODAL ---------------- */}
        {showHowTo && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl border border-lime-500/30 bg-[#0e170e] p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-lime-500/20">
                <h3 className="text-lg font-black text-lime-300">How to Play</h3>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setShowHowTo(false);
                  }}
                  className="h-8 w-8 rounded-full bg-lime-950/60 text-lime-300 font-bold flex items-center justify-center border border-lime-500/30"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 space-y-3 text-xs text-lime-100/90 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="text-lg">1.</span>
                  <p><strong>Hold anywhere:</strong> Squeezes gas to propel you upward against gravity.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">2.</span>
                  <p><strong>Watch the gas meter:</strong> Tooting drains intestinal gas. Collecting beans refills it!</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">3.</span>
                  <p><strong>Combo multipliers:</strong> Graze near pipe rims to multiply your score up to 9x.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">4.</span>
                  <p><strong>Dynamic Haptics:</strong> Feel the rumble with every burst and bean pickup!</p>
                </div>
              </div>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setShowHowTo(false);
                }}
                className="mt-6 w-full rounded-xl bg-lime-500 py-3 font-black text-black uppercase tracking-wider text-xs active:scale-95"
              >
                Got It, Let's Play!
              </button>
            </div>
          </div>
        )}

        {/* ---------------- PAUSE SCREEN ---------------- */}
        {state === "paused" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-4 text-center backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-xs rounded-3xl border border-lime-500/30 bg-[#0f190e] p-6 shadow-2xl">
              <span className="text-4xl">🧘‍♂️</span>
              <h2 className="mt-2 text-2xl font-black text-lime-200">HOLDING IT IN…</h2>
              <p className="mt-1 text-xs font-bold text-lime-400/80">Current Score: {Math.floor(hud.score)}</p>

              <div className="mt-6 space-y-3">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    gameRef.current?.resume();
                    triggerHaptic("light");
                  }}
                  className="w-full rounded-2xl border-b-[4px] border-lime-700 bg-lime-400 py-3 text-sm font-black uppercase tracking-wider text-lime-950 active:translate-y-1 active:border-b-0"
                >
                  RESUME
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    launchGame();
                  }}
                  className="w-full rounded-2xl border border-lime-500/30 bg-lime-950/40 py-3 text-xs font-black uppercase tracking-wider text-lime-300 active:bg-lime-900/60"
                >
                  RESTART
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
                  className="w-full text-xs font-bold text-lime-500/70 hover:text-lime-300 py-1"
                >
                  Quit to Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- GAME OVER SCREEN ---------------- */}
        {state === "dead" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-4 text-center backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl border border-red-500/30 bg-[#160f0f]/90 p-5 sm:p-6 shadow-[0_15px_40px_rgba(239,68,68,0.2)]">
              <span className="text-4xl animate-bounce">💥</span>
              <h2 className="mt-1 text-3xl font-black text-red-400 drop-shadow-[0_2px_8px_rgba(239,68,68,0.4)]">
                SPLAT!
              </h2>
              <p className="mt-1 text-xs font-black uppercase tracking-widest text-lime-400">
                {isNewBest ? "🎉 NEW HIGH SCORE!" : rankFor(finalScore)}
              </p>
              <div className="my-3 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-black text-white tabular-nums">{finalScore}</span>
                <span className="text-xs font-bold text-lime-400/80">PTS</span>
              </div>

              {/* High Scores List */}
              <div className="my-3 max-h-36 overflow-y-auto rounded-2xl border border-lime-500/20 bg-black/50 p-2.5 text-left">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-lime-500/20">
                  <span className="text-[10px] font-black uppercase tracking-widest text-lime-400">
                    Leaderboard
                  </span>
                  <span className="text-[10px] font-semibold text-lime-200/50">Top Runs</span>
                </div>
                {scores.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-baseline justify-between py-1 text-xs font-bold ${
                      s.score === finalScore && isNewBest && i === 0
                        ? "text-amber-300 bg-amber-500/10 px-1 rounded"
                        : "text-lime-100/80"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 text-lime-500 text-[11px]">{i + 1}</span>
                      <span className="truncate text-[11px] max-w-[120px]">{s.rank}</span>
                    </div>
                    <span className="tabular-nums font-mono text-lime-300">{s.score}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mt-4">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    launchGame();
                  }}
                  className="w-full rounded-2xl border-b-[5px] border-lime-700 bg-gradient-to-r from-lime-400 via-lime-500 to-lime-400 py-3.5 text-base font-black uppercase tracking-wider text-lime-950 shadow-[0_8px_25px_rgba(132,204,22,0.4)] active:translate-y-1 active:border-b-2 active:shadow-none"
                >
                  TRY AGAIN
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
                    className="flex-1 rounded-xl border border-lime-500/30 bg-black/40 py-2.5 text-xs font-bold text-lime-300 active:bg-lime-950/40"
                  >
                    Main Menu
                  </button>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setScores(clearScores());
                    }}
                    className="rounded-xl border border-red-500/20 bg-red-950/30 px-3 py-2.5 text-[11px] font-bold text-red-300 hover:text-red-200"
                  >
                    Reset Scores
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Touch Hint */}
      <footer className="z-10 flex h-10 shrink-0 items-center justify-center border-t border-lime-500/10 bg-black/60 px-2 text-center backdrop-blur-sm">
        <p className="text-[11px] font-semibold text-lime-300/70">
          🎮 {state === "playing" ? "Touch & Hold Anywhere to Toot Upward" : "Touch / Click & Hold to Float"}
        </p>
      </footer>

      {/* Custom Keyframe animations */}
      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scale-animation {
          animation: scaleIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

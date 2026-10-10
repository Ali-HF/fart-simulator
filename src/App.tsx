import { useCallback, useEffect, useRef, useState } from "react";
import { FartGame, type GameState, type HudSnapshot, type PaletteMode, THEMES } from "./game/engine";
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
  const [palette, setPalette] = useState<PaletteMode>("pastel");
  const [showHowTo, setShowHowTo] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    setScores(loadScores());
  }, []);

  // Engine mount
  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new FartGame(canvas);
    gameRef.current = game;
    game.setTheme(palette);
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

  const changePalette = (mode: PaletteMode) => {
    setPalette(mode);
    if (gameRef.current) {
      gameRef.current.setTheme(mode);
    }
    triggerHaptic("light");
    setShowThemePicker(false);
  };

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
    <div
      className={`relative flex h-full w-full select-none flex-col overflow-hidden text-slate-100 transition-colors duration-300 ${
        palette === "pastel"
          ? "bg-[#1e293b]"
          : palette === "cozy"
          ? "bg-[#271d18]"
          : palette === "peach"
          ? "bg-[#2b1f28]"
          : "bg-[#0d140e]"
      }`}
    >
      {/* Top Status Header */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-lg shadow-sm">
            🍑
          </span>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">FART SIMULATOR</h1>
            <p className="text-[10px] font-medium text-slate-300/70">{THEMES[palette].name}</p>
          </div>
        </div>

        {/* Action icons & Theme Switcher */}
        <div className="flex items-center gap-2">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              setShowThemePicker((prev) => !prev);
            }}
            aria-label="Select Palette"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-slate-200 active:scale-95 hover:bg-white/15 transition"
          >
            <span>🎨</span>
            <span className="hidden sm:inline">Theme</span>
          </button>

          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            aria-label="Toggle Sound"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm active:scale-95"
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
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-500/20 text-sm text-amber-200 active:scale-95"
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
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-xs font-bold text-slate-300 active:scale-95"
            >
              ❓
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Gaming Area */}
      <main
        className="relative flex-1 w-full h-full overflow-hidden"
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
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-t from-red-500/25 via-red-900/10 to-transparent" />
        )}

        {/* ---------------- MAIN MENU (Pastel Modern) ---------------- */}
        {state === "menu" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4 sm:p-8 bg-gradient-to-b from-slate-900/70 via-slate-900/80 to-slate-950/90 backdrop-blur-md overflow-y-auto">
            {/* Top Palette Mode Pill Selector */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
              {(["pastel", "peach", "cozy", "toxic"] as PaletteMode[]).map((mode) => (
                <button
                  key={mode}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    changePalette(mode);
                  }}
                  className={`rounded-xl px-3 py-1 text-xs font-medium transition ${
                    palette === mode
                      ? "bg-white/20 text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {THEMES[mode].name}
                </button>
              ))}
            </div>

            {/* Hero Title & Mascot */}
            <div className="flex flex-col items-center text-center my-auto max-w-sm">
              <div className="relative mb-3 flex items-center justify-center">
                <div className="absolute -inset-4 rounded-full bg-rose-400/20 blur-xl animate-pulse" />
                <span className="relative text-7xl select-none drop-shadow-md">
                  🍑
                </span>
              </div>

              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">
                Fart <span className="text-rose-300 font-serif italic">Simulator</span>
              </h2>
              <p className="mt-2 text-xs sm:text-sm font-normal text-slate-300/85 leading-relaxed px-4">
                Tap and hold to glide gently with sheer intestinal power. Squeeze through the pipes and snack on beans!
              </p>

              {/* Best Score Pill */}
              {scores.length > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-200">
                  <span>🏆 Best Score:</span>
                  <span className="text-amber-300 font-bold text-sm">{scores[0].score}</span>
                  <span className="text-slate-400 text-[10px]">({scores[0].rank})</span>
                </div>
              )}

              {/* Primary Start Button */}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  launchGame();
                }}
                className="mt-6 w-full max-w-xs rounded-2xl border-b-[4px] border-slate-700/80 bg-gradient-to-r from-rose-400 via-pink-400 to-amber-300 py-3.5 text-base font-bold uppercase tracking-wider text-slate-900 shadow-[0_10px_25px_rgba(244,114,182,0.3)] active:translate-y-1 active:border-b-0 active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <span>LET IT RIP</span>
                <span className="text-lg">💨</span>
              </button>
            </div>

            {/* Quick Controls Bar */}
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-around text-center text-[11px] font-medium text-slate-300">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-base">👆</span>
                  <span>Hold to Float</span>
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-base">🫘</span>
                  <span>Eat Beans</span>
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-base">⚡</span>
                  <span>Graze for Combo</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- THEME PICKER MODAL ---------------- */}
        {showThemePicker && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900/95 p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white">Color Palette &amp; Theme</h3>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setShowThemePicker(false);
                  }}
                  className="h-8 w-8 rounded-full bg-white/10 text-slate-300 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {(["pastel", "peach", "cozy", "toxic"] as PaletteMode[]).map((mode) => (
                  <button
                    key={mode}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      changePalette(mode);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition ${
                      palette === mode
                        ? "border-rose-400/60 bg-rose-500/20 text-white font-bold"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-sm">{THEMES[mode].name}</span>
                    <span className="text-xs text-slate-400">
                      {mode === "pastel"
                        ? "Soft lavender & slate"
                        : mode === "peach"
                        ? "Warm rose & apricot"
                        : mode === "cozy"
                        ? "Earthy warm tones"
                        : "Vibrant neon biohazard"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- HOW TO PLAY MODAL ---------------- */}
        {showHowTo && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900/95 p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white">How to Play</h3>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setShowHowTo(false);
                  }}
                  className="h-8 w-8 rounded-full bg-white/10 text-slate-300 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 space-y-3 text-xs text-slate-200/90 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-rose-300">1.</span>
                  <p><strong>Hold anywhere:</strong> Squeezes gas to propel you upward against gravity.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-rose-300">2.</span>
                  <p><strong>Watch the gas meter:</strong> Tooting drains gas. Collecting beans refills it!</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-rose-300">3.</span>
                  <p><strong>Combo multipliers:</strong> Graze near pipe rims to multiply your score up to 9x.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-rose-300">4.</span>
                  <p><strong>Color Palette:</strong> Switch between Pastel, Soft Peach, Cozy, and Classic Neon anytime!</p>
                </div>
              </div>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setShowHowTo(false);
                }}
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-rose-400 to-amber-300 py-3 font-bold text-slate-900 uppercase tracking-wider text-xs active:scale-95"
              >
                Got It!
              </button>
            </div>
          </div>
        )}

        {/* ---------------- PAUSE SCREEN ---------------- */}
        {state === "paused" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-4 text-center backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-xs rounded-3xl border border-white/15 bg-slate-900/90 p-6 shadow-2xl">
              <span className="text-4xl">🧘‍♂️</span>
              <h2 className="mt-2 text-xl font-bold text-white">Holding It In…</h2>
              <p className="mt-1 text-xs text-slate-300">Current Score: {Math.floor(hud.score)}</p>

              <div className="mt-6 space-y-2.5">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    gameRef.current?.resume();
                    triggerHaptic("light");
                  }}
                  className="w-full rounded-2xl border-b-[3px] border-slate-700 bg-gradient-to-r from-rose-400 to-amber-300 py-3 text-xs font-bold uppercase tracking-wider text-slate-900 active:translate-y-0.5 active:border-b-0"
                >
                  RESUME
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    launchGame();
                  }}
                  className="w-full rounded-2xl border border-white/15 bg-white/5 py-2.5 text-xs font-semibold text-slate-200 active:bg-white/10"
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
                  className="w-full text-xs font-medium text-slate-400 hover:text-slate-200 py-1"
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
            <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900/90 p-5 sm:p-6 shadow-2xl">
              <span className="text-4xl animate-bounce">💥</span>
              <h2 className="mt-1 text-2xl font-black text-rose-300 drop-shadow-sm">
                SPLAT!
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-300">
                {isNewBest ? "🎉 New Personal Best!" : rankFor(finalScore)}
              </p>
              <div className="my-3 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-black text-white tabular-nums">{finalScore}</span>
                <span className="text-xs font-semibold text-slate-400">PTS</span>
              </div>

              {/* High Scores List */}
              <div className="my-3 max-h-36 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-2.5 text-left">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                    Leaderboard
                  </span>
                  <span className="text-[10px] text-slate-500">Top Runs</span>
                </div>
                {scores.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-baseline justify-between py-1 text-xs ${
                      s.score === finalScore && isNewBest && i === 0
                        ? "text-amber-300 font-bold bg-amber-500/10 px-1 rounded"
                        : "text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 text-slate-500 text-[11px]">{i + 1}</span>
                      <span className="truncate text-[11px] max-w-[120px]">{s.rank}</span>
                    </div>
                    <span className="tabular-nums font-mono text-slate-200">{s.score}</span>
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
                  className="w-full rounded-2xl border-b-[4px] border-slate-700 bg-gradient-to-r from-rose-400 via-pink-400 to-amber-300 py-3 text-sm font-bold uppercase tracking-wider text-slate-900 shadow-md active:translate-y-1 active:border-b-0"
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
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-semibold text-slate-300 active:bg-white/10"
                  >
                    Main Menu
                  </button>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setScores(clearScores());
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-400 hover:text-rose-300"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Touch Hint */}
      <footer className="z-10 flex h-10 shrink-0 items-center justify-center border-t border-white/10 bg-black/40 px-2 text-center backdrop-blur-sm">
        <p className="text-[11px] font-medium text-slate-400">
          🎮 {state === "playing" ? "Touch & Hold Screen to Glide" : "Touch / Click & Hold to Float"}
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

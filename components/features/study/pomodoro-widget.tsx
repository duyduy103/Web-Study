"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getNextPomodoroPhase,
  isLateNightStudyTime,
  KIDS_POMODORO_SETTINGS,
  STANDARD_POMODORO_SETTINGS,
  type PomodoroPhase,
  type PomodoroSettings,
} from "@/lib/srs";

function playGentleChime(muted: boolean) {
  if (muted || typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(528, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch {
    // Bỏ qua nếu trình duyệt chặn phát âm thanh tự động
  }
}

function formatTimerClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function PomodoroWidget() {
  const [preset, setPreset] = React.useState<"standard" | "kids" | "custom">(
    "standard"
  );
  const [settings, setSettings] = React.useState<PomodoroSettings>(
    STANDARD_POMODORO_SETTINGS
  );
  const [phase, setPhase] = React.useState<PomodoroPhase>("work");
  const [completedWorkCycles, setCompletedWorkCycles] = React.useState(0);
  const [isRunning, setIsRunning] = React.useState(true);
  const [isMuted, setIsMuted] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [showBreakModal, setShowBreakModal] = React.useState(false);

  // Tính theo mốc thời gian thực (phaseEndAtMs) để không lệch khi học sinh đổi tab
  const [phaseEndAtMs, setPhaseEndAtMs] = React.useState<number>(
    () => Date.now() + STANDARD_POMODORO_SETTINGS.workMinutes * 60000
  );
  const [pausedRemainingSec, setPausedRemainingSec] = React.useState<number>(
    STANDARD_POMODORO_SETTINGS.workMinutes * 60
  );
  const [displaySeconds, setDisplaySeconds] = React.useState<number>(
    STANDARD_POMODORO_SETTINGS.workMinutes * 60
  );

  // Nhắc ngủ đủ giấc nếu mở phiên ôn sau 22:00 giờ Việt Nam
  const [showLateNightBanner, setShowLateNightBanner] = React.useState(false);

  React.useEffect(() => {
    if (isLateNightStudyTime(new Date(), 22)) {
      setShowLateNightBanner(true);
    }
  }, []);

  React.useEffect(() => {
    if (!isRunning) {
      setDisplaySeconds(pausedRemainingSec);
      return;
    }

    function onTick() {
      const remSec = Math.ceil((phaseEndAtMs - Date.now()) / 1000);
      if (remSec <= 0) {
        playGentleChime(isMuted);
        const next = getNextPomodoroPhase({
          currentPhase: phase,
          completedWorkCycles,
          settings,
        });
        setPhase(next.nextPhase);
        setCompletedWorkCycles(next.nextCompletedWorkCycles);
        setPhaseEndAtMs(Date.now() + next.durationSeconds * 1000);
        setPausedRemainingSec(next.durationSeconds);
        setDisplaySeconds(next.durationSeconds);
        setShowBreakModal(next.nextPhase !== "work");
      } else {
        setDisplaySeconds(remSec);
      }
    }

    onTick();
    const id = window.setInterval(onTick, 500);
    return () => window.clearInterval(id);
  }, [isRunning, phaseEndAtMs, pausedRemainingSec, phase, completedWorkCycles, settings, isMuted]);

  function applyNewSettings(nextSettings: PomodoroSettings) {
    setSettings(nextSettings);
    setPhase("work");
    const sec = Math.max(1, nextSettings.workMinutes) * 60;
    setPhaseEndAtMs(Date.now() + sec * 1000);
    setPausedRemainingSec(sec);
    setDisplaySeconds(sec);
    setShowBreakModal(false);
  }

  function togglePlayPause() {
    if (isRunning) {
      const rem = Math.max(1, Math.ceil((phaseEndAtMs - Date.now()) / 1000));
      setPausedRemainingSec(rem);
      setIsRunning(false);
    } else {
      setPhaseEndAtMs(Date.now() + pausedRemainingSec * 1000);
      setIsRunning(true);
    }
  }

  function skipBreakToWork() {
    const sec = Math.max(1, settings.workMinutes) * 60;
    setPhase("work");
    setPhaseEndAtMs(Date.now() + sec * 1000);
    setPausedRemainingSec(sec);
    setDisplaySeconds(sec);
    setShowBreakModal(false);
    setIsRunning(true);
  }

  return (
    <>
      {showLateNightBanner ? (
        <div
          role="status"
          className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/90 p-4 text-xs text-indigo-950 sm:flex-row sm:items-center sm:text-sm"
        >
          <div className="space-y-0.5">
            <p className="font-bold">
              {vi.study.pomodoro.lateNightReminderTitle}
            </p>
            <p className="text-indigo-900">
              {vi.study.pomodoro.lateNightReminderBody}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowLateNightBanner(false)}
            className="shrink-0"
          >
            {vi.study.pomodoro.dismissReminderButton}
          </Button>
        </div>
      ) : null}

      {/* Thanh đồng hồ Pomodoro nổi */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={`rounded-xl px-2.5 py-1 font-mono text-sm font-extrabold ${
                phase === "work"
                  ? "bg-teal-50 text-teal-900"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              🍅 {formatTimerClock(displaySeconds)}
            </span>
            <div className="text-xs">
              <span className="font-bold text-slate-800">
                {phase === "work"
                  ? vi.study.pomodoro.workPhaseLabel
                  : phase === "short_break"
                    ? vi.study.pomodoro.shortBreakLabel
                    : vi.study.pomodoro.longBreakLabel}
              </span>
              <span className="ml-1.5 text-slate-500">
                ({vi.study.pomodoro.cyclePrefix} {(completedWorkCycles % 4) + 1}
                /4)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={togglePlayPause}
              className="h-9 px-3 text-xs"
            >
              {isRunning
                ? vi.study.pomodoro.pauseButton
                : vi.study.pomodoro.startButton}
            </Button>
            {phase !== "work" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={skipBreakToWork}
                className="h-9 px-2.5 text-xs"
              >
                {vi.study.pomodoro.skipBreakButton}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={
                isMuted
                  ? vi.study.pomodoro.unmuteSoundLabel
                  : vi.study.pomodoro.muteSoundLabel
              }
              className="min-h-[36px] cursor-pointer rounded-xl border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              {isMuted ? "🔇" : "🔔"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="min-h-[36px] cursor-pointer rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ⚙
            </button>
          </div>
        </div>

        {expanded ? (
          <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreset("standard");
                  applyNewSettings(STANDARD_POMODORO_SETTINGS);
                }}
                className={`min-h-[38px] cursor-pointer rounded-xl border px-3 py-1.5 font-semibold ${
                  preset === "standard"
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {vi.study.pomodoro.modeStandard}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreset("kids");
                  applyNewSettings(KIDS_POMODORO_SETTINGS);
                }}
                className={`min-h-[38px] cursor-pointer rounded-xl border px-3 py-1.5 font-semibold ${
                  preset === "kids"
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {vi.study.pomodoro.modeKids}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex items-center gap-1.5">
                <span>{vi.study.pomodoro.workMinLabel}</span>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={settings.workMinutes}
                  onChange={(e) => {
                    setPreset("custom");
                    applyNewSettings({
                      ...settings,
                      workMinutes: Number.parseInt(e.target.value, 10) || 25,
                    });
                  }}
                  className="h-9 w-16 px-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span>{vi.study.pomodoro.breakMinLabel}</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.shortBreakMinutes}
                  onChange={(e) => {
                    setPreset("custom");
                    applyNewSettings({
                      ...settings,
                      shortBreakMinutes:
                        Number.parseInt(e.target.value, 10) || 5,
                    });
                  }}
                  className="h-9 w-16 px-2 text-xs"
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {/* Màn hình gợi ý nghỉ giải lao */}
      {showBreakModal && phase !== "work" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-teal-200 bg-white p-6 text-center shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {vi.study.pomodoro.breakOverlayTitle}
            </h3>
            <div className="my-4 font-mono text-3xl font-extrabold text-teal-800">
              {formatTimerClock(displaySeconds)}
            </div>
            <ul className="space-y-2 rounded-2xl bg-teal-50/70 p-4 text-left text-xs leading-relaxed text-teal-950 sm:text-sm">
              {vi.study.pomodoro.breakOverlaySuggestions.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <div className="mt-5 flex justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBreakModal(false)}
              >
                Ẩn thông báo
              </Button>
              <Button type="button" onClick={skipBreakToWork}>
                {vi.study.pomodoro.skipBreakButton}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

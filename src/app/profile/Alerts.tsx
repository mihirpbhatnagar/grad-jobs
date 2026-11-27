"use client";

import { useState, useTransition } from "react";
import { checkTelegram, saveAlerts } from "./actions";

type Prefs = { emailDigest: boolean; telegram: boolean };

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// Alerts on the profile page: the daily email digest and Telegram instant alerts.
export function Alerts({ initial, connected, botUsername, linkCode }: { initial: Prefs; connected: boolean; botUsername: string | null; linkCode: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [isConnected, setConnected] = useState(connected);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const update = (changes: Partial<Prefs>) => {
    const next = { ...prefs, ...changes };
    setPrefs(next);
    start(async () => {
      await saveAlerts(next);
    });
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="font-semibold tracking-tight">Alerts</h2>
      <p className="mt-1 text-sm text-muted">Deadline countdowns (7, 3 and 1 days, and closing day), closed-role warnings, a nudge for saved roles with no deadline, and new For you matches. Sent each morning.</p>

      <div className="mt-5 flex items-start justify-between gap-4 border-t border-border pt-5">
        <div>
          <p className="font-medium">Daily email digest</p>
          <p className="text-sm text-muted">One email each morning, only when there&apos;s something new.</p>
        </div>
        <Switch on={prefs.emailDigest} onChange={(v) => update({ emailDigest: v })} label="Daily email digest" />
      </div>

      <div className="mt-5 flex items-start justify-between gap-4 border-t border-border pt-5">
        <div className="min-w-0">
          <p className="font-medium">Telegram alerts</p>
          {!botUsername ? (
            <p className="text-sm text-muted">Being set up: the Telegram bot isn&apos;t connected to the app yet.</p>
          ) : isConnected ? (
            <p className="text-sm text-success">Connected. Alerts arrive in your Telegram chat with the bot.</p>
          ) : (
            <div className="text-sm text-muted">
              <p>1. Open the bot and press <span className="font-semibold text-foreground">Start</span>.</p>
              <p>2. Come back and press <span className="font-semibold text-foreground">I&apos;ve pressed Start</span>.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`https://t.me/${botUsername}?start=${linkCode}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent">
                  Open Telegram ↗
                </a>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const ok = await checkTelegram();
                      setConnected(ok);
                      setNote(ok ? "" : "Not found yet. Press Start in the bot chat, then try again.");
                    })
                  }
                  className="rounded-lg border border-border px-4 py-2 font-semibold text-foreground hover:border-accent/50"
                >
                  I&apos;ve pressed Start
                </button>
              </div>
              {note && <p className="mt-2 text-amber">{note}</p>}
            </div>
          )}
        </div>
        {botUsername && isConnected && <Switch on={prefs.telegram} onChange={(v) => update({ telegram: v })} label="Telegram alerts" />}
      </div>
    </section>
  );
}

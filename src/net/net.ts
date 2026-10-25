import type { ClientMsg, HatStyle, ServerMsg, Theme } from "../../shared/protocol";

export const COLORS = ["#4a5bb5", "#7db65a", "#e07a9a", "#e0a84a", "#5aa7c8", "#9a6ad0"];
export const THEMES: Theme[] = ["meadow", "blossom", "autumn", "mint"];

/** Before accounts, a browser was a witch: an id and a secret token that proved it. */
const OLD_PROFILE = "af.profile.v1";
type OldProfile = { id: string; token: string; color?: string; hat?: HatStyle; theme?: Theme };

/** The witch this browser was before accounts, if it hasn't been brought into an account yet. */
export function oldProfile(): OldProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(OLD_PROFILE) ?? "null") as OldProfile | null;
    return p?.id && p.token ? p : null;
  } catch {
    return null;
  }
}

export function forgetOldProfile() {
  try {
    localStorage.removeItem(OLD_PROFILE);
  } catch {
    // nothing to forget
  }
}

type Handler<T extends ServerMsg["t"]> = (m: Extract<ServerMsg, { t: T }>) => void;

/**
 * One WebSocket to the island hub, signed in by the session cookie. The game keeps working when it
 * is down; it just stays solo.
 */
export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ((m: ServerMsg) => void)[]>();
  /** messages that arrived before anyone listened (the world is still loading) */
  private unheard: ServerMsg[] = [];
  private island: string | null = null;
  private retry = 1000;
  online = false;
  onStatus: (online: boolean) => void = () => {};

  constructor() {
    this.connect();
  }

  private connect() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/net`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.online = true;
      if (this.island) this.raw({ t: "enter", island: this.island });
      this.onStatus(true);
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data as string) as ServerMsg;
      } catch {
        return;
      }
      const hs = this.handlers.get(m.t) ?? [];
      if (!hs.length) this.unheard.push(m);
      for (const h of hs) h(m);
    };
    ws.onclose = () => {
      // signed out elsewhere, or the session ran out: back to the sign-in page
      if (!this.online) void fetch("/api/me", { cache: "no-store" }).then((r) => r.status === 401 && location.reload(), () => {});
      const was = this.online;
      this.online = false;
      if (was) this.onStatus(false);
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 15000);
    };
  }

  private raw(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  send(m: ClientMsg) {
    if (m.t === "enter") this.island = m.island;
    this.raw(m);
  }

  /** Listen for a message type; returns a function that stops listening. */
  on<T extends ServerMsg["t"]>(t: T, h: Handler<T>): () => void {
    const list = this.handlers.get(t) ?? [];
    const fn = h as (m: ServerMsg) => void;
    list.push(fn);
    this.handlers.set(t, list);
    const missed = this.unheard.filter((m) => m.t === t);
    if (missed.length) {
      this.unheard = this.unheard.filter((m) => m.t !== t);
      queueMicrotask(() => missed.forEach(fn));
    }
    return () => this.handlers.set(t, (this.handlers.get(t) ?? []).filter((x) => x !== fn));
  }

  /** Resolve with the next message of a type, or null after `ms`. */
  next<T extends ServerMsg["t"]>(t: T, ms: number): Promise<Extract<ServerMsg, { t: T }> | null> {
    return new Promise((resolve) => {
      const off = this.on(t, (m) => {
        off();
        clearTimeout(timer);
        resolve(m);
      });
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, ms);
    });
  }
}

import type { ClientMsg, Profile, ServerMsg, Theme } from "../../shared/protocol";

const KEY = "af.profile.v1";
const FIRST = ["Mossy", "Little", "Sleepy", "Bright", "Quiet", "Honey", "Misty", "Clover", "Amber", "Velvet"];
const LAST = ["Wren", "Fern", "Sage", "Moth", "Robin", "Juniper", "Sparrow", "Willow", "Thistle", "Plum"];
export const COLORS = ["#4a5bb5", "#7db65a", "#e07a9a", "#e0a84a", "#5aa7c8", "#9a6ad0"];
export const THEMES: Theme[] = ["meadow", "blossom", "autumn", "mint"];

export interface Me extends Profile { token: string; theme: Theme }

function randomId(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, n);
}

/** Who this browser is: an id, a secret token that proves it, a name, a hat colour, an island theme. */
export function loadMe(): Me {
  try {
    const me = JSON.parse(localStorage.getItem(KEY) ?? "null") as Me | null;
    if (me?.id && me.token) return me;
  } catch {
    // fall through to a new profile
  }
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const me: Me = {
    id: `w-${randomId(10)}`,
    token: randomId(24),
    name: `${pick(FIRST)} ${pick(LAST)}`,
    color: pick(COLORS),
    theme: pick(THEMES),
  };
  saveMe(me);
  return me;
}

export function saveMe(me: Me) {
  try {
    localStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    // unsaved profile: a new one next time
  }
}

type Handler<T extends ServerMsg["t"]> = (m: Extract<ServerMsg, { t: T }>) => void;

/** One WebSocket to the island hub. The game keeps working when it is down; it just stays solo. */
export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ((m: ServerMsg) => void)[]>();
  /** messages that arrived before anyone listened (the world is still loading) */
  private unheard: ServerMsg[] = [];
  private island: string | null = null;
  private retry = 1000;
  online = false;
  onStatus: (online: boolean) => void = () => {};

  constructor(private me: Me) {
    this.connect();
  }

  private connect() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/net`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.online = true;
      this.raw({ t: "hello", profile: { id: this.me.id, name: this.me.name, color: this.me.color, hat: this.me.hat }, token: this.me.token });
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

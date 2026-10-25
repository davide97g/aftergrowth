import { createAuthClient } from "better-auth/client";
import type { Profile, Theme } from "../../shared/protocol";

const auth = createAuthClient({ baseURL: location.origin });

/** You: your account's witch, as the server keeps it. */
export interface Me extends Profile { theme: Theme; code: string }
export interface Account { me: Me; save: unknown; updated: number }

/** The signed-in account, or null when nobody is signed in on this browser. */
export async function whoAmI(): Promise<Account | null> {
  const r = await fetch("/api/me", { cache: "no-store" });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`/api/me answered ${r.status}`);
  const { profile, save, updated } = (await r.json()) as { profile: Me; save: unknown; updated: number };
  return { me: profile, save, updated };
}

export async function signOut() {
  await auth.signOut();
  location.href = "/";
}

/** Show the sign-in page until someone signs in or makes a new witch. */
export function signIn(): Promise<Account> {
  const page = document.getElementById("auth")!;
  const form = page.querySelector("form")!;
  const name = form.querySelector<HTMLInputElement>("#auth-name")!;
  const email = form.querySelector<HTMLInputElement>("#auth-email")!;
  const password = form.querySelector<HTMLInputElement>("#auth-password")!;
  const error = page.querySelector<HTMLElement>(".error")!;
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  let mode: "in" | "up" = "in";
  const show = (m: typeof mode) => {
    mode = m;
    page.dataset.mode = m;
    for (const b of page.querySelectorAll<HTMLButtonElement>("[data-mode]")) b.setAttribute("aria-selected", String(b.dataset.mode === m));
    name.required = m === "up";
    password.autocomplete = m === "up" ? "new-password" : "current-password";
    submit.textContent = m === "up" ? "Begin your apprenticeship" : "Enter";
    error.hidden = true;
  };
  for (const b of page.querySelectorAll<HTMLButtonElement>("[data-mode]")) b.addEventListener("click", () => show(b.dataset.mode as typeof mode));
  show("in");
  page.hidden = false;
  document.getElementById("loading")!.classList.add("done");
  email.focus();

  return new Promise((resolve) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.hidden = true;
      const r = mode === "up"
        ? await auth.signUp.email({ name: name.value.trim().slice(0, 24) || "Witch", email: email.value.trim(), password: password.value })
        : await auth.signIn.email({ email: email.value.trim(), password: password.value });
      const account = r.error ? null : await whoAmI().catch(() => null);
      submit.disabled = false;
      if (!account) {
        error.textContent = r.error?.message ?? "The way in is blocked right now. Try again in a moment.";
        error.hidden = false;
        return;
      }
      page.hidden = true;
      document.getElementById("loading")!.classList.remove("done");
      resolve(account);
    });
  });
}

/** Familiars: the little companion every witch has. Shared with the server, which checks published ones. */
export type FamiliarKind = "cat" | "fox" | "frog";
export const FAMILIAR_KINDS: FamiliarKind[] = ["cat", "fox", "frog"];
export const FAMILIAR_NAMES: Record<FamiliarKind, string> = { cat: "Cat", fox: "Fox", frog: "Frog" };
/** your familiar: what it is and what you call it (kept in the save) */
export interface FamiliarSave { kind: FamiliarKind; name: string }
export const DEFAULT_FAMILIAR: FamiliarSave = { kind: "cat", name: "Mochi" };

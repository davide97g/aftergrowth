import type { CameraRig } from "../core/camera";
import { quote } from "../island/costs";
import { IslandEditor } from "../island/editor";
import { type IslandLayout, screen } from "../island/layout";
import type { IslandWorld } from "../world/world";

/**
 * The B key / Edit button on your own island. Done pays for the edit, saves the layout and reloads
 * the page so every system rebuilds from it; Discard just reloads.
 */
export function setupEditor(o: {
  world: IslandWorld;
  rig: CameraRig;
  canvas: HTMLCanvasElement;
  canEdit: boolean;
  /** true when something else has the screen (drawing, indoors) */
  blocked: () => boolean;
  /** the coins, shed and paid-for land the edit is charged to */
  wallet: { coins: number; shed: Record<string, number>; land: number };
  /** the layout as it was before editing */
  before: IslandLayout;
  save: () => void;
}): IslandEditor {
  const editor = new IslandEditor(o.world, o.rig.camera, o.canvas);
  editor.quote = () => quote(o.before, o.world.layout, o.wallet);
  editor.coins = () => o.wallet.coins;
  const button = document.getElementById("btn-edit")!;
  button.hidden = !o.canEdit;
  const open = () => {
    if (!o.canEdit || editor.active || o.blocked()) return;
    // shift the view so the island isn't hidden behind the editor panel
    const [x, z] = screen(-4.5, 0);
    editor.focus.set(x, 0, z);
    editor.open();
    o.rig.snap(0.75, editor.focus);
  };
  const leave = (keep: boolean) => {
    editor.close();
    const loading = document.getElementById("loading")!;
    loading.textContent = keep ? "Settling your island…" : "Putting things back…";
    loading.classList.remove("done");
    if (keep) {
      const q = quote(o.before, o.world.layout, o.wallet);
      o.wallet.coins -= q.cost;
      o.wallet.shed = q.shed;
      o.wallet.land = q.land;
      o.save();
    }
    setTimeout(() => location.reload(), 300);
  };
  editor.onDone = () => leave(true);
  editor.onDiscard = () => leave(false);
  button.addEventListener("click", open);
  addEventListener("keydown", (e) => {
    if (e.code === "KeyB" && (e.target as HTMLElement).tagName !== "INPUT") open();
  });
  return editor;
}

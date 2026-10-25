import type { CameraRig } from "../core/camera";
import { IslandEditor } from "../island/editor";
import { screen } from "../island/layout";
import type { IslandWorld } from "../world/world";

/**
 * The B key / Edit button on your own island. Done saves the layout and reloads the page so every
 * system rebuilds from it; Discard just reloads.
 */
export function setupEditor(o: {
  world: IslandWorld;
  rig: CameraRig;
  canvas: HTMLCanvasElement;
  canEdit: boolean;
  /** true when something else has the screen (drawing, indoors) */
  blocked: () => boolean;
  save: () => void;
}): IslandEditor {
  const editor = new IslandEditor(o.world, o.rig.camera, o.canvas);
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
    if (keep) o.save();
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

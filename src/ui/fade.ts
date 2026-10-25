/** Fade the screen to plum, do something while it's hidden, fade back. */
export function fadeThrough(then: () => void) {
  const fade = document.getElementById("fade")!;
  fade.classList.add("on");
  setTimeout(() => {
    then();
    fade.classList.remove("on");
  }, 380);
}

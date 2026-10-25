import { startGame } from "./game/game";

startGame().catch((err) => {
  console.error(err);
  document.getElementById("loading")!.textContent = "The island failed to load. See the console.";
});

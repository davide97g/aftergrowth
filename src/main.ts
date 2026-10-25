import { startGame } from "./game/game";
import { signIn, whoAmI } from "./net/account";

async function main() {
  // nobody plays signed out: the sign-in page first, then the island
  const account = (await whoAmI()) ?? (await signIn());
  await startGame(account);
}

main().catch((err) => {
  console.error(err);
  document.getElementById("loading")!.textContent = "The island failed to load. See the console.";
});

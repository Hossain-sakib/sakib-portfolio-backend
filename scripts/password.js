import { hashPassword } from "../src/password.js";
if (!process.stdin.isTTY) {
  console.error("Use an interactive terminal to set a password.");
  process.exit(1);
}
process.stdout.write("New admin password (12+ characters, hidden): ");
process.stdin.setRawMode(true);
process.stdin.resume();
let password = "";
process.stdin.on("data", (bytes) => {
  for (const c of bytes.toString()) {
    if (c === "\u0003") process.exit(1);
    if (c === "\r" || c === "\n") {
      process.stdin.setRawMode(false);
      if (password.length < 12) {
        console.error("\nUse at least 12 characters.");
        process.exit(1);
      }
      console.log("\nADMIN_PASSWORD_HASH=" + hashPassword(password));
      process.exit(0);
    } else if (c === "\u007f") password = password.slice(0, -1);
    else password += c;
  }
});

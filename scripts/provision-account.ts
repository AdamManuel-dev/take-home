import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { AccountStore } from "../server/auth/accounts.js";
import { hashPassword } from "../server/auth/passwords.js";
import { roleSchema } from "../shared/contracts/auth.js";
import { Store } from "../server/store.js";

if (process.argv.length > 2)
  throw new Error(
    "Provisioning takes no command arguments; use the interactive prompts",
  );
if (!stdin.isTTY || !stdout.isTTY)
  throw new Error(
    "Provisioning requires an interactive terminal for hidden password input",
  );

let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) stdout.write(chunk);
    callback();
  },
});
const prompt = createInterface({ input: stdin, output, terminal: true });
prompt.on("SIGINT", () => {
  prompt.close();
  process.exitCode = 130;
});
try {
  const username = await prompt.question("Username: ");
  const displayName = await prompt.question("Display name: ");
  const role = roleSchema.parse(await prompt.question("Role (user/manager): "));
  const email =
    (await prompt.question("Email (required for manager): ")).trim() ||
    undefined;
  const staffId =
    (await prompt.question("Staff ID (required for user): ")).trim() ||
    undefined;
  stdout.write("Password (at least 12 characters): ");
  hidden = true;
  const password = await prompt.question("");
  hidden = false;
  stdout.write("\nConfirm password: ");
  hidden = true;
  const confirmation = await prompt.question("");
  hidden = false;
  stdout.write("\n");
  if (password !== confirmation) throw new Error("Passwords do not match");
  const schedules = new Store();
  const accounts = new AccountStore((id) => Boolean(schedules.get(id)));
  const account = accounts.create({
    username,
    displayName,
    role,
    email,
    staffId,
    active: true,
    passwordHash: await hashPassword(password),
  });
  stdout.write(
    `Created ${account.role} account ${account.username} (${account.id})\n`,
  );
} finally {
  hidden = false;
  prompt.close();
}

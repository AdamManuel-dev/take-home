import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { roleSchema } from "../../shared/contracts/auth.js";
import { passwordHashSchema } from "./passwords.js";

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}
const usernameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._@+-]*$/);
export const accountSchema = z
  .object({
    id: z.string().min(1),
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(100),
    email: z.email().optional(),
    role: roleSchema,
    staffId: z.string().min(1).optional(),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    passwordHash: passwordHashSchema,
  })
  .strict()
  .refine(
    (account) => account.role !== "user" || Boolean(account.staffId),
    "Users require a staff link",
  )
  .refine(
    (account) => account.role !== "manager" || Boolean(account.email),
    "Managers require a valid email",
  );
export type Account = z.infer<typeof accountSchema>;
export const accountsDataSchema = z
  .object({ version: z.literal(1), users: z.array(accountSchema) })
  .strict()
  .refine(
    (data) =>
      new Set(data.users.map((user) => user.id)).size === data.users.length,
    "Duplicate account IDs",
  )
  .refine(
    (data) =>
      new Set(data.users.map((user) => user.username)).size ===
      data.users.length,
    "Duplicate usernames",
  );
type AccountsData = z.infer<typeof accountsDataSchema>;
export type NewAccount = Omit<Account, "id" | "createdAt">;

export interface AccountRepository {
  list(): Account[];
  get(id: string): Account | undefined;
  findByUsername(username: string): Account | undefined;
}

/** One-process repository; detached reads and atomic writes keep credentials isolated. */
export class AccountStore implements AccountRepository {
  private data: AccountsData;
  constructor(
    private readonly staffExists: (id: string) => boolean,
    private readonly path = resolve(
      process.env.USERS_FILE || "data/users.json",
    ),
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.data = this.validate(
      existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : { version: 1, users: [] },
    );
    if (existsSync(path)) chmodSync(path, 0o600);
  }

  private validate(value: unknown) {
    const data = accountsDataSchema.parse(value);
    for (const user of data.users) {
      if (user.staffId && !this.staffExists(user.staffId))
        throw new Error(`Account ${user.id} references unknown staff`);
    }
    return data;
  }

  list() {
    return structuredClone(this.data.users);
  }
  get(id: string) {
    return structuredClone(this.data.users.find((user) => user.id === id));
  }
  findByUsername(username: string) {
    return structuredClone(
      this.data.users.find(
        (user) => user.username === normalizeUsername(username),
      ),
    );
  }

  create(input: NewAccount) {
    const account = accountSchema.parse({
      ...input,
      username: normalizeUsername(input.username),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    this.commit({ ...this.data, users: [...this.data.users, account] });
    return structuredClone(account);
  }

  update(id: string, change: (account: Account) => void) {
    const data = structuredClone(this.data);
    const account = data.users.find((user) => user.id === id);
    if (!account) throw new Error("Unknown account");
    change(account);
    if (account.id !== id) throw new Error("Account ID cannot change");
    account.username = normalizeUsername(account.username);
    this.commit(data);
    return structuredClone(account);
  }

  private commit(value: AccountsData) {
    const data = this.validate(value);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(data, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      renameSync(temporary, this.path);
    } catch (error) {
      try {
        rmSync(temporary, { force: true });
      } catch {
        /* Keep original failure. */
      }
      throw error;
    }
    this.data = data;
  }
}

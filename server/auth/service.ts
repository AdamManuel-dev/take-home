import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { accountProfileSchema } from "../../shared/contracts/auth.js";
import type { AccountRepository } from "./accounts.js";
import { hashPassword, verifyPassword } from "./passwords.js";

export const SESSION_COOKIE = "open_hours_session";
const SESSION_MS = 8 * 60 * 60 * 1000;
type Session = { accountId: string; csrfToken: string; expiresAt: number };
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class AuthService {
  private sessions = new Map<string, Session>();
  private attempts = new Map<string, { count: number; expiresAt: number }>();
  private inFlight = 0;
  private dummyHash = hashPassword(randomBytes(32).toString("hex"));
  constructor(
    private accounts: AccountRepository,
    private now: () => number = Date.now,
  ) {}

  async login(username: string, password: string, address: string) {
    const now = this.now();
    for (const [key, entry] of this.attempts)
      if (entry.expiresAt <= now) this.attempts.delete(key);
    const entry = this.attempts.get(address) ?? {
      count: 0,
      expiresAt: now + 15 * 60_000,
    };
    if (
      entry.count >= 10 ||
      this.inFlight >= 4 ||
      (!this.attempts.has(address) && this.attempts.size >= 1000)
    )
      return { limited: true } as const;
    entry.count += 1;
    this.attempts.set(address, entry);
    this.inFlight += 1;
    try {
      const account = this.accounts.findByUsername(username);
      const valid = await verifyPassword(
        password,
        account?.passwordHash ?? (await this.dummyHash),
      );
      // Re-read after asynchronous verification to honor intervening deactivation or credential changes.
      const current = account && this.accounts.get(account.id);
      if (
        !valid ||
        !current?.active ||
        current.passwordHash.hash !== account?.passwordHash.hash
      )
        return { limited: false } as const;
      return { limited: false, account: current } as const;
    } finally {
      this.inFlight -= 1;
    }
  }

  startSession(accountId: string) {
    for (const [key, session] of this.sessions)
      if (session.expiresAt <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 10_000)
      throw new Error("Session capacity reached");
    const token = randomBytes(32).toString("hex");
    const session = {
      accountId,
      csrfToken: randomBytes(32).toString("hex"),
      expiresAt: this.now() + SESSION_MS,
    };
    this.sessions.set(digest(token), session);
    return { token, ...session };
  }
  resolve(token: string | undefined) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const session = this.sessions.get(digest(token));
    if (!session) return undefined;
    const account = this.accounts.get(session.accountId);
    if (session.expiresAt <= this.now() || !account?.active) {
      this.logout(token);
      return undefined;
    }
    return {
      profile: accountProfileSchema.parse(account),
      csrfToken: session.csrfToken,
    };
  }
  logout(token: string | undefined) {
    if (token) this.sessions.delete(digest(token));
  }
}

export function validCsrf(actual: string | undefined, expected: string) {
  return Boolean(
    actual &&
    /^[a-f0-9]{64}$/.test(actual) &&
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected)),
  );
}

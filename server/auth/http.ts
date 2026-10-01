import type { Express, Request, Response, NextFunction } from "express";
import {
  accountProfileSchema,
  canEditSchedule,
  loginInputSchema,
  type SessionResponse,
} from "../../shared/contracts/auth.js";
import { AuthService, SESSION_COOKIE, validCsrf } from "./service.js";

export interface AuthOptions {
  service: AuthService;
  allowedOrigins: string[];
  secureCookies?: boolean;
}
export function sessionProfile(res: Response) {
  return (res.locals.auth as SessionResponse).profile;
}
function token(req: Request) {
  return req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
export function requireScheduleEdit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    (req.method === "POST" && /^\/availability\/?$/.test(req.path))
  )
    return next();
  if (!canEditSchedule(sessionProfile(res), String(req.params.id))) {
    res.status(403).json({ error: "Permission denied" });
    return;
  }
  next();
}

export function registerAuthentication(app: Express, options: AuthOptions) {
  const { service } = options;
  const origins = new Set(
    options.allowedOrigins.map((origin) => {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        (options.secureCookies && url.protocol !== "https:")
      )
        throw new Error(
          "Trusted origins must use HTTP, or HTTPS with secure cookies",
        );
      return url.origin;
    }),
  );
  if (origins.size === 0)
    throw new Error("At least one trusted application origin is required");
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: Boolean(options.secureCookies),
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
  const sameOrigin = (req: Request) => {
    const origin = req.get("origin");
    return Boolean(origin && origins.has(origin));
  };
  app.post("/api/auth/login", async (req, res) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: "Untrusted request origin" });
      return;
    }
    const input = loginInputSchema.safeParse(req.body);
    if (!input.success) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    const result = await service.login(
      input.data.username,
      input.data.password,
      req.ip || "unknown",
    );
    if (result.limited) {
      res.status(429).json({ error: "Too many login attempts" });
      return;
    }
    if (!result.account) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    service.logout(token(req));
    const session = service.startSession(result.account.id);
    res.cookie(SESSION_COOKIE, session.token, cookie).json({
      profile: accountProfileSchema.parse(result.account),
      csrfToken: session.csrfToken,
    });
  });
  app.use("/api", (req, res, next) => {
    const auth = service.resolve(token(req));
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.locals.auth = auth;
    const read =
      req.method === "GET" ||
      req.method === "HEAD" ||
      (req.method === "POST" &&
        /^\/staff\/[^/]+\/availability\/?$/.test(req.path));
    if (
      !read &&
      (!sameOrigin(req) || !validCsrf(req.get("x-csrf-token"), auth.csrfToken))
    ) {
      res.status(403).json({ error: "Invalid request origin or CSRF token" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/auth/me", (_req, res) => res.json(res.locals.auth));
  app.post("/api/auth/logout", (req, res) => {
    service.logout(token(req));
    res.clearCookie(SESSION_COOKIE, { ...cookie, maxAge: undefined });
    res.sendStatus(204);
  });
}

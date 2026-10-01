import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Fixed parameters bound memory (~32 MiB) and prevent hostile records requesting work.
export const passwordHashSchema = z
  .object({
    algorithm: z.literal("scrypt"),
    N: z.literal(32768),
    r: z.literal(8),
    p: z.literal(1),
    keyLength: z.literal(64),
    salt: z.string().regex(/^[a-f0-9]{32}$/),
    hash: z.string().regex(/^[a-f0-9]{128}$/),
  })
  .strict();
export type PasswordHash = z.infer<typeof passwordHashSchema>;
const passwordSchema = z.string().min(12).max(1024);

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(password, salt)).toString("hex");
  return {
    algorithm: "scrypt",
    N: 32768,
    r: 8,
    p: 1,
    keyLength: 64,
    salt,
    hash,
  };
}

export async function verifyPassword(password: string, record: PasswordHash) {
  const validated = passwordHashSchema.parse(record);
  if (password.length === 0 || password.length > 1024) return false;
  return timingSafeEqual(
    await derive(password, validated.salt),
    Buffer.from(validated.hash, "hex"),
  );
}

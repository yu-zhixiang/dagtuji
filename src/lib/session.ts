import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionUser } from "@/types";

const COOKIE_NAME = "dagtuji_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "dagtuji-dev-secret-change-in-prod";
  return new TextEncoder().encode(secret);
}

/** 签发 JWT */
export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** 校验 JWT */
export async function verifySession(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const p = payload as unknown as SessionUser;
    if (!p || typeof p.id !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

/** 从 cookie 读取会话 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** 写入会话 cookie */
export async function setSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** 清除会话 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

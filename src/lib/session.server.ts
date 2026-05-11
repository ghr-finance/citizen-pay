import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "ghr_session";
const ALG = "HS256";

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: "admin" | "bendahara";
  fullName: string;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as "admin" | "bendahara",
      fullName: payload.fullName as string,
    };
  } catch {
    return null;
  }
}

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

import { createHash, randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  COLLECTIONS,
  DEVICE_ID_COOKIE,
  DEVICE_ID_MAX_AGE,
  RISK_DEVICE_USER_LIMIT,
  RISK_IP_REGISTER_LIMIT,
  RISK_SCORE_NORMAL,
  RISK_SCORE_REVIEW,
} from "@/lib/constants";
import { getCmd, getDb } from "@/lib/cloudbase";
import { ApiError } from "@/lib/server/api";

/** 提取客户端真实 IP（处理 x-forwarded-for 多级代理） */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first && first !== "unknown") return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return "unknown";
}

/** 计算设备 ID 的 SHA-256 哈希（服务端只保存哈希） */
export function hashDeviceId(raw: string): string {
  return createHash("sha256").update(`dagtuji:device:${raw}`).digest("hex");
}

/** 读取请求中的设备哈希，无 cookie 时返回 null */
export function getDeviceHash(req: NextRequest): string | null {
  const raw = req.cookies.get(DEVICE_ID_COOKIE)?.value;
  return raw ? hashDeviceId(raw) : null;
}

/** 在响应上写入（或刷新）HttpOnly 长期 device_id Cookie，返回设备哈希 */
export function setDeviceIdCookie(res: NextResponse, existingRaw?: string | null): string {
  const raw = existingRaw || randomUUID();
  res.cookies.set(DEVICE_ID_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_ID_MAX_AGE,
  });
  return hashDeviceId(raw);
}

/** Turnstile 服务端验证：未配置密钥时开发环境放行 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // 本地开发未配置时放行，生产环境必须配置
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await resp.json().catch(() => null);
  return data?.success === true;
}

/**
 * 简单频率限制：写 rate_limits 集合。
 * 同 key 在窗口期内计数，超过 limit 抛 429。
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const db = getDb();
  const cmd = getCmd();
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  // 清理过期记录（低频执行，避免集合膨胀）
  try {
    await db
      .collection(COLLECTIONS.RATE_LIMITS)
      .where({ createdAt: cmd.lt(new Date(now - 7 * 24 * 3600 * 1000)) })
      .remove();
  } catch {
    // 忽略清理失败
  }

  const res = await db
    .collection(COLLECTIONS.RATE_LIMITS)
    .where({ key, windowStart: cmd.gte(windowStart) })
    .orderBy("windowStart", "desc")
    .limit(1)
    .get();
  const rec = (res.data || [])[0] as Record<string, unknown> | undefined;

  if (rec) {
    const count = Number(rec.count || 0) + 1;
    await db
      .collection(COLLECTIONS.RATE_LIMITS)
      .doc(rec._id as string)
      .update({ count });
    if (count > limit) {
      throw new ApiError(429, "操作过于频繁，请稍后再试");
    }
    return;
  }

  await db.collection(COLLECTIONS.RATE_LIMITS).add({
    key,
    count: 1,
    windowStart: new Date(now),
    createdAt: new Date(now),
  });
}

/** 记录一条风控事件（用于评估风险分） */
export async function addRiskEvent(params: {
  userId?: string;
  deviceHash?: string | null;
  ip?: string;
  email?: string;
  eventType: string;
  score: number;
  detail?: string;
}): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTIONS.RISK_EVENTS).add({
    userId: params.userId || "",
    deviceHash: params.deviceHash || null,
    ip: params.ip || "",
    email: params.email || "",
    eventType: params.eventType,
    score: params.score,
    detail: params.detail || "",
    createdAt: db.serverDate(),
  });
}

/** 计算某用户近 7 天累计风险分 */
export async function getUserRiskScore(userId: string): Promise<number> {
  const db = getDb();
  const cmd = getCmd();
  const res = await db
    .collection(COLLECTIONS.RISK_EVENTS)
    .where({ userId, createdAt: cmd.gte(new Date(Date.now() - 7 * 24 * 3600 * 1000)) })
    .limit(1000)
    .get();
  const list = (res.data || []) as Array<{ score?: number }>;
  return list.reduce((sum, e) => sum + Number(e.score || 0), 0);
}

/**
 * 注册前风控评估：综合设备重复、IP 批量注册、邮箱一次性域名等。
 * 返回风险分与建议等级（normal 直接发、review 人工审核、reject 拒绝赠送）。
 */
export async function evaluateRegisterRisk(params: {
  deviceHash: string | null;
  ip: string;
  email: string;
}): Promise<{ score: number; level: "normal" | "review" | "reject" }> {
  const db = getDb();
  const cmd = getCmd();
  let score = 0;
  const detail: string[] = [];

  // 1. 设备是否已关联多个账号（批量注册）
  if (params.deviceHash) {
    const deviceRes = await db
      .collection(COLLECTIONS.USERS)
      .where({ deviceHash: params.deviceHash })
      .limit(RISK_DEVICE_USER_LIMIT)
      .get();
    const deviceUsers = (deviceRes.data || []).length;
    if (deviceUsers >= RISK_DEVICE_USER_LIMIT) {
      score += 50;
      detail.push(`设备关联 ${deviceUsers} 个账号`);
    } else if (deviceUsers >= 1) {
      score += 20;
      detail.push(`设备已注册过账号`);
    }
  }

  // 2. 同 IP 近 24h 批量注册
  if (params.ip && params.ip !== "unknown") {
    const ipRes = await db
      .collection(COLLECTIONS.USERS)
      .where({
        registerIp: params.ip,
        createdAt: cmd.gte(new Date(Date.now() - 24 * 3600 * 1000)),
      })
      .limit(RISK_IP_REGISTER_LIMIT)
      .get();
    const ipUsers = (ipRes.data || []).length;
    if (ipUsers >= RISK_IP_REGISTER_LIMIT) {
      score += 60;
      detail.push(`同 IP 近 24h 注册 ${ipUsers} 个账号`);
    } else if (ipUsers >= 2) {
      score += 25;
      detail.push(`同 IP 近 24h 注册 ${ipUsers} 个账号`);
    }
  }

  // 3. 一次性邮箱域名
  const domain = params.email.split("@")[1]?.toLowerCase() || "";
  const disposableDomains = [
    "mailinator.com",
    "yopmail.com",
    "guerrillamail.com",
    "sharklasers.com",
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "mailnesia.com",
  ];
  if (domain && disposableDomains.includes(domain)) {
    score += 30;
    detail.push("使用一次性邮箱");
  }

  const level = score >= RISK_SCORE_REVIEW ? "reject" : score >= RISK_SCORE_NORMAL ? "review" : "normal";

  // 记录本次评估事件（无用户时也记录，用于审计）
  await addRiskEvent({
    deviceHash: params.deviceHash,
    ip: params.ip,
    email: params.email,
    eventType: "register_evaluate",
    score,
    detail: detail.join("；"),
  }).catch(() => undefined);

  return { score, level };
}

/** 查询某设备是否已领取过注册赠送 */
export async function hasDeviceClaimedBonus(deviceHash: string): Promise<boolean> {
  const db = getDb();
  const res = await db
    .collection(COLLECTIONS.BONUS_CLAIMS)
    .where({ deviceHash, status: "granted" })
    .limit(1)
    .get();
  return (res.data || []).length > 0;
}

/** 查询某邮箱是否已领取过注册赠送 */
export async function hasEmailClaimedBonus(email: string): Promise<boolean> {
  const db = getDb();
  const res = await db
    .collection(COLLECTIONS.BONUS_CLAIMS)
    .where({ email, status: "granted" })
    .limit(1)
    .get();
  return (res.data || []).length > 0;
}

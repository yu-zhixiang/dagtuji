import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { setSession } from "@/lib/session";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import {
  addRiskEvent,
  evaluateRegisterRisk,
  getClientIp,
  hashDeviceId,
  rateLimit,
  verifyTurnstile,
  setDeviceIdCookie,
} from "@/lib/server/fraud";
import { isValidUsername } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * Body JSON:
 *   username (required): 用户名，2-32 位字母、数字或中文
 *   password (required): 明文密码，6-64 位
 *   nickname (optional): 昵称，最大 32 字符
 *   turnstileToken (required if TURNSTILE_SITE_KEY configured): 人机验证 token
 *
 * 邮箱相关处理完全移除：注册不再接受邮箱，积分中心邮箱验证奖励由 /api/my/verify-email 单独发放。
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApiError(async () => {
    const body = await req.json().catch(() => null);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const nickname = String(body?.nickname || "").trim() || undefined;
    const turnstileToken = String(body?.turnstileToken || "");

    if (!isValidUsername(username)) {
      throw new ApiError(400, "用户名需为 2-32 位字母、数字或中文");
    }
    if (password.length < 6 || password.length > 64) {
      throw new ApiError(400, "密码长度需为 6-64 位");
    }

    const ip = getClientIp(req);

    // Turnstile 服务端验证（未配置时开发环境放行）
    const pass = await verifyTurnstile(turnstileToken, ip);
    if (!pass) {
      throw new ApiError(400, "人机验证失败，请刷新后重试");
    }

    // 注册频率限制：同 IP 每小时 5 次
    await rateLimit(`register_ip:${ip}`, 5, 60 * 60 * 1000);

    const db = getDb();

    // 检查用户名唯一
    const dup = await db
      .collection(COLLECTIONS.USERS)
      .where({ username })
      .limit(1)
      .get();
    if ((dup.data || []).length > 0) {
      throw new ApiError(400, "该用户名已被注册");
    }

    // 设备识别（HttpOnly Cookie，库中只存哈希）
    const rawDeviceId = req.cookies.get("dagtuji_device_id")?.value || null;
    const deviceHash = rawDeviceId ? hashDeviceId(rawDeviceId) : null;

    // 注册前风控评估（设备重复 / IP 批量注册，不包含邮箱维度）
    const { score: riskScore, level: riskLevel } = await evaluateRegisterRisk({
      deviceHash,
      ip,
      email: "",
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = username === (process.env.ADMIN_USERNAME || "admin");

    const res = await db.collection(COLLECTIONS.USERS).add({
      username,
      nickname,
      email: undefined,
      emailVerified: false,
      passwordHash,
      points: 0,
      paidPoints: 0,
      bonusPoints: 0,
      registerBonusGranted: false,
      emailVerifyBonusGranted: false,
      // bonusStatus 字段保留在数据库 Schema 中（历史数据兼容），但注册时不再写入
      riskScore,
      riskLevel,
      deviceHash: deviceHash || null,
      registerIp: ip,
      isAdmin,
      createdAt: db.serverDate(),
    });

    const userId = res.id as string;

    // 记录注册风控事件（关联到用户）
    await addRiskEvent({
      userId,
      deviceHash,
      ip,
      eventType: "register",
      score: riskScore,
      detail: `注册风控评估：风险分 ${riskScore}，等级 ${riskLevel}`,
    });

    // 注册不再自动发放任何积分
    await setSession({
      id: userId,
      username,
      nickname,
      email: "",
      isAdmin,
      points: 0,
      paidPoints: 0,
      bonusPoints: 0,
    });

    // 写入 HttpOnly 长期 device_id Cookie
    const resp = json({
      success: true,
      user: {
        id: userId,
        username,
        nickname,
        email: "",
        isAdmin,
        points: 0,
        paidPoints: 0,
        bonusPoints: 0,
      },
    });
    setDeviceIdCookie(resp, rawDeviceId);
    return resp;
  });
}

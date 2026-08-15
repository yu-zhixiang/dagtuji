import { NextRequest } from "next/server";
import { sendEmailCode } from "@/lib/email";
import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { getClientIp, rateLimit, verifyTurnstile } from "@/lib/server/fraud";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { createHash } from "crypto";

/** 对规范化邮箱生成 SHA-256 哈希，与 verify-email 保持一致 */
function emailHash(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail, "utf8").digest("hex");
}

/**
 * POST /api/my/email-code
 * 为已登录用户发送邮箱验证码（用于积分中心邮箱验证奖励流程）。
 * 需要 Turnstile 人机验证 + IP 频率限制。
 *
 * 并发控制（迁移窗口期）：
 *   1. 检查 verified_emails 集合（新流程标准路径）
 *   2. 检查 users.emailVerified=true 历史用户（迁移窗口补充保护）
 *   任一命中且非本用户 → 拒绝发送
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApiError(async () => {
    const session = await requireUser();
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const turnstileToken = String(body?.turnstileToken || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ApiError(400, "请输入正确的邮箱地址");
    }

    const db = getDb();
    const hash = emailHash(email);

    // ── 迁移窗口检查：防止历史 verified 邮箱被重复注册领取 ─────────
    // 1. verified_emails 集合检查（新流程）
    const verifiedRes = await db
      .collection(COLLECTIONS.VERIFIED_EMAILS)
      .doc(hash)
      .get();
    const verifiedDoc = verifiedRes.data as { userId?: string } | undefined;
    if (verifiedDoc && verifiedDoc.userId && String(verifiedDoc.userId) !== session.id) {
      throw new ApiError(400, "该邮箱已被其他账号验证使用");
    }

    // 2. users 历史用户检查（迁移窗口补充：防止绕过 verified_emails 集合）
    const histRes = await db
      .collection(COLLECTIONS.USERS)
      .where({ email, emailVerified: true })
      .limit(10)
      .get();
    const histUsers = (histRes.data || []) as Array<{ _id: string }>;
    const otherHist = histUsers.filter((u) => String(u._id) !== session.id);
    if (otherHist.length > 0) {
      throw new ApiError(
        400,
        "该邮箱已被其他账号验证使用"
      );
    }

    const ip = getClientIp(req);

    // Turnstile 服务端验证（未配置时开发环境放行）
    const pass = await verifyTurnstile(turnstileToken, ip);
    if (!pass) {
      throw new ApiError(400, "人机验证失败，请刷新后重试");
    }

    // IP 频率限制：每小时 5 次
    await rateLimit(`email_code_my_ip:${ip}`, 5, 60 * 60 * 1000);

    const result = await sendEmailCode(email);
    if (!result.ok) {
      throw new ApiError(429, result.message);
    }

    return json({
      success: true,
      message: result.message,
      verificationId: result.verificationId,
      devCode: result.devCode,
    });
  });
}

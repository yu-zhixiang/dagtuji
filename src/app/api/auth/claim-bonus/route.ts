import { NextRequest } from "next/server";
import { COLLECTIONS, REGISTER_BONUS_POINTS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { getSession } from "@/lib/session";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import {
  getClientIp,
  hashDeviceId,
  rateLimit,
  setDeviceIdCookie,
  verifyTurnstile,
} from "@/lib/server/fraud";
import { claimRegisterBonus } from "@/lib/server/points";

/** 领取注册赠送积分（登录后可调用，服务端防重复） */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new ApiError(401, "请先登录");
    }

    const body = await req.json().catch(() => null);
    const turnstileToken = String(body?.turnstileToken || "");
    const ip = getClientIp(req);

    // Turnstile 服务端验证
    const pass = await verifyTurnstile(turnstileToken, ip);
    if (!pass) {
      throw new ApiError(400, "人机验证失败，请刷新后重试");
    }

    // 领取频率限制：同用户每 5 分钟一次
    await rateLimit(`claim_bonus:${session.id}`, 5, 5 * 60 * 1000);

    const db = getDb();
    const userRes = await db.collection(COLLECTIONS.USERS).doc(session.id).get();
    const user = userRes.data as Record<string, unknown> | undefined;
    if (!user) throw new ApiError(404, "用户不存在");

    // 设备哈希
    const rawDeviceId = req.cookies.get("dagtuji_device_id")?.value || null;
    const deviceHash = rawDeviceId ? hashDeviceId(rawDeviceId) : null;

    const result = await claimRegisterBonus({
      userId: session.id,
      bonus: REGISTER_BONUS_POINTS,
      email: String(user.email || ""),
      deviceHash,
      ip,
    });

    if (result === "rejected") {
      throw new ApiError(403, "该账号注册赠送已被拒绝");
    }
    if (result === "duplicate") {
      throw new ApiError(400, "注册赠送已领取，请勿重复领取");
    }

    const resp = json({ success: true, message: "领取成功" });
    setDeviceIdCookie(resp, rawDeviceId);
    return resp;
  } catch (e) {
    return handleApiError(e);
  }
}

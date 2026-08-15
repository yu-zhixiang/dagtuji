import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { COLLECTIONS, REGISTER_BONUS_POINTS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { setSession } from "@/lib/session";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { verifyEmailCode } from "@/lib/email";
import {
  addRiskEvent,
  evaluateRegisterRisk,
  getClientIp,
  hashDeviceId,
  rateLimit,
  setDeviceIdCookie,
  verifyTurnstile,
} from "@/lib/server/fraud";
import { claimRegisterBonus } from "@/lib/server/points";
import { isValidUsername } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const nickname = String(body?.nickname || "").trim() || undefined;
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "").trim();
    const verificationId = String(body?.verificationId || "");
    const turnstileToken = String(body?.turnstileToken || "");

    if (!isValidUsername(username)) {
      throw new ApiError(400, "用户名需为 2-32 位字母、数字或中文");
    }
    if (password.length < 6 || password.length > 64) {
      throw new ApiError(400, "密码长度需为 6-64 位");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ApiError(400, "请输入正确的邮箱地址");
    }
    if (!code) {
      throw new ApiError(400, "请输入邮箱验证码");
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

    // 校验邮箱验证码
    const verified = await verifyEmailCode({ email, code, verificationId });
    if (!verified) {
      throw new ApiError(400, "验证码错误或已过期，请重新获取");
    }

    // 检查用户名唯一
    const dup = await db
      .collection(COLLECTIONS.USERS)
      .where({ username })
      .limit(1)
      .get();
    if ((dup.data || []).length > 0) {
      throw new ApiError(400, "该用户名已被注册");
    }

    // 检查邮箱唯一
    const dupEmail = await db
      .collection(COLLECTIONS.USERS)
      .where({ email })
      .limit(1)
      .get();
    if ((dupEmail.data || []).length > 0) {
      throw new ApiError(400, "该邮箱已注册，请直接登录");
    }

    // 设备识别（HttpOnly Cookie，库中只存哈希）
    const rawDeviceId = req.cookies.get("dagtuji_device_id")?.value || null;
    const deviceHash = rawDeviceId ? hashDeviceId(rawDeviceId) : null;

    // 注册前风控评估（设备重复 / IP 批量注册 / 一次性邮箱）
    const { score: riskScore, level: riskLevel } = await evaluateRegisterRisk({
      deviceHash,
      ip,
      email,
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = username === (process.env.ADMIN_USERNAME || "admin");

    const res = await db.collection(COLLECTIONS.USERS).add({
      username,
      nickname,
      email,
      emailVerified: true,
      passwordHash,
      points: 0,
      paidPoints: 0,
      bonusPoints: 0,
      registerBonusGranted: false,
      bonusStatus: "pending",
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
      email,
      eventType: "register",
      score: riskScore,
      detail: `注册风控评估：风险分 ${riskScore}，等级 ${riskLevel}`,
    });

    let points = 0;

    if (riskLevel === "normal") {
      // 正常用户：自动发放注册赠送
      const claim = await claimRegisterBonus({
        userId,
        bonus: REGISTER_BONUS_POINTS,
        email,
        deviceHash,
        ip,
      });
      if (claim === "granted") {
        points = REGISTER_BONUS_POINTS;
      }
    } else if (riskLevel === "reject") {
      // 高风险：允许登录，但拒绝赠送
      await db
        .collection(COLLECTIONS.USERS)
        .doc(userId)
        .update({ bonusStatus: "rejected", riskLevel: "reject" });
    }
    // review：保持 pending，进入人工审核列表

    await setSession({
      id: userId,
      username,
      nickname,
      email,
      isAdmin,
      points,
      paidPoints: 0,
      bonusPoints: points,
    });

    // 写入 HttpOnly 长期 device_id Cookie
    const resp = json({
      success: true,
      user: {
        id: userId,
        username,
        nickname,
        email,
        isAdmin,
        points,
        paidPoints: 0,
        bonusPoints: points,
      },
    });
    setDeviceIdCookie(resp, rawDeviceId);
    return resp;
  } catch (e) {
    return handleApiError(e);
  }
}

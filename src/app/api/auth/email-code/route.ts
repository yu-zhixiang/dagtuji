import { NextRequest } from "next/server";
import { sendEmailCode } from "@/lib/email";
import { getClientIp, rateLimit, verifyTurnstile } from "@/lib/server/fraud";
import { ApiError, handleApiError, json } from "@/lib/server/api";

/** 发送注册邮箱验证码（含 Turnstile 人机验证 + IP 频率限制） */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const turnstileToken = String(body?.turnstileToken || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ApiError(400, "请输入正确的邮箱地址");
    }

    const ip = getClientIp(req);

    // Turnstile 服务端验证（未配置时开发环境放行）
    const pass = await verifyTurnstile(turnstileToken, ip);
    if (!pass) {
      throw new ApiError(400, "人机验证失败，请刷新后重试");
    }

    // IP 频率限制：每小时 10 次
    await rateLimit(`email_code_ip:${ip}`, 10, 60 * 60 * 1000);

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
  } catch (e) {
    return handleApiError(e);
  }
}

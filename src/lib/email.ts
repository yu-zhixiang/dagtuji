import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { ApiError } from "@/lib/server/api";

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000; // 验证码有效期 10 分钟
const SEND_INTERVAL_MS = 60 * 1000; // 同邮箱 60 秒一次

/** 是否已配置 CloudBase 邮箱验证码 API KEY */
export function isEmailCodeConfigured(): boolean {
  return Boolean(process.env.TCB_ENV_ID && process.env.TCB_API_KEY);
}

function getApiBase(): string {
  return `https://${process.env.TCB_ENV_ID}.api.tcloudbasegateway.com`;
}

function genLocalCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 发送邮箱验证码（优先 CloudBase Auth 邮箱验证码能力）。
 * 未配置 API KEY 时走本地模拟（仅开发调试）。
 */
export async function sendEmailCode(email: string): Promise<{
  ok: boolean;
  message: string;
  verificationId?: string;
  devCode?: string;
}> {
  const db = getDb();

  // 频率限制：同邮箱 60 秒一次
  const recent = await db
    .collection(COLLECTIONS.EMAIL_CODES)
    .where({ email })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  const last = (recent.data || [])[0] as Record<string, unknown> | undefined;
  if (last) {
    const lastTime = new Date(last.createdAt as string).getTime();
    if (Date.now() - lastTime < SEND_INTERVAL_MS) {
      const remain = Math.ceil((SEND_INTERVAL_MS - (Date.now() - lastTime)) / 1000);
      return { ok: false, message: `发送太频繁，请 ${remain} 秒后再试` };
    }
  }

  // 未配置 CloudBase 邮箱能力 → 本地模拟（开发模式）
  if (!isEmailCodeConfigured()) {
    const code = genLocalCode();
    await db.collection(COLLECTIONS.EMAIL_CODES).add({
      email,
      code,
      purpose: "register",
      used: false,
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
      createdAt: new Date(),
    });
    return {
      ok: true,
      message: "本地调试模式：验证码已生成",
      devCode: code,
    };
  }

  // 调用 CloudBase Auth 邮箱验证码发送接口
  const resp = await fetch(`${getApiBase()}/auth/v1/verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TCB_API_KEY}`,
    },
    body: JSON.stringify({ email, target: "ANY" }),
  });
  const data = await resp.json().catch(() => null);

  if (!resp.ok || !data?.verification_id) {
    const msg = data?.error?.message || data?.message || "验证码发送失败";
    if (String(resp.status).startsWith("4")) {
      return { ok: false, message: msg };
    }
    throw new ApiError(502, "邮箱服务暂时不可用，请稍后再试");
  }

  await db.collection(COLLECTIONS.EMAIL_CODES).add({
    email,
    verificationId: data.verification_id,
    purpose: "register",
    used: false,
    expiresAt: new Date(Date.now() + Number(data.expires_in || 600) * 1000),
    createdAt: new Date(),
  });

  return { ok: true, message: "验证码已发送至邮箱" };
}

/**
 * 校验邮箱验证码。
 * CloudBase 模式下通过 verification_id + code 调用 verify 接口；
 * 本地模拟模式则直接比对 email_codes 集合。
 */
export async function verifyEmailCode(params: {
  email: string;
  code: string;
  verificationId?: string;
}): Promise<boolean> {
  const db = getDb();
  const { email, code, verificationId } = params;

  // 本地模拟模式
  if (!isEmailCodeConfigured() || !verificationId) {
    const res = await db
      .collection(COLLECTIONS.EMAIL_CODES)
      .where({ email, code, purpose: "register", used: false })
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    const rec = (res.data || [])[0] as Record<string, unknown> | undefined;
    if (!rec) return false;
    const expiresAt = new Date(rec.expiresAt as string).getTime();
    if (Date.now() > expiresAt) return false;
    await db.collection(COLLECTIONS.EMAIL_CODES).doc(rec._id as string).update({ used: true });
    return true;
  }

  // CloudBase verify 接口
  const resp = await fetch(`${getApiBase()}/auth/v1/verification/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TCB_API_KEY}`,
    },
    body: JSON.stringify({ verification_id: verificationId, verification_code: code }),
  });
  const data = await resp.json().catch(() => null);

  if (resp.ok && data?.verification_token) {
    // 标记本地记录已使用
    await db
      .collection(COLLECTIONS.EMAIL_CODES)
      .where({ email, verificationId })
      .update({ used: true })
      .catch(() => undefined);
    return true;
  }
  return false;
}

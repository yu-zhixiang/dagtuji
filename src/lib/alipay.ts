/**
 * 支付宝 API 工具类（沙箱环境）
 * 使用 alipay-sdk 官方 Node.js SDK
 */
import { randomBytes } from "crypto";
import { AlipaySdk } from "alipay-sdk";

/** 支付宝网关（沙箱环境） */
const ALIPAY_GATEWAY =
  process.env.ALIPAY_GATEWAY || "https://openapi-sandbox.dl.alipaydev.com/gateway.do";

/**
 * 私钥规范化：
 * - trim 后若已包含 PEM 头，直接使用
 * - 否则将纯 Base64 PKCS8 内容包装为标准 PEM 格式
 * 不在任何日志中输出私钥原文。
 */
function normalizePrivateKey(raw: string): string {
  const s = raw.trim();
  if (s.includes("BEGIN PRIVATE KEY")) return s;
  return `-----BEGIN PRIVATE KEY-----\n${s}\n-----END PRIVATE KEY-----`;
}

/**
 * 创建 SDK 实例（单例）
 */
let sdk: AlipaySdk | null = null;

export function getAlipaySdk(): AlipaySdk {
  if (!sdk) {
    sdk = new AlipaySdk({
      appId: process.env.ALIPAY_APP_ID || "",
      privateKey: normalizePrivateKey(process.env.ALIPAY_PRIVATE_KEY || ""),
      alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || "",
      gateway: ALIPAY_GATEWAY,
      keyType: "PKCS8",
    });
  }
  return sdk;
}

/**
 * 生成唯一订单号（不可预测）
 */
export function generateOrderNo(): string {
  const timestamp = Date.now();
  const random = randomBytes(4).toString("hex");
  return `RECH${timestamp}${random}`.toUpperCase();
}

/**
 * 生成 PC 端支付 URL（alipay.trade.page.pay）
 * 业务参数必须在 bizContent 内；notify_url / return_url 为回调地址，放顶层。
 */
export function buildPagePayUrl(orderNo: string, totalAmount: string, subject: string): string {
  const sdk = getAlipaySdk();
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL 未配置");

  return sdk.pageExecute("alipay.trade.page.pay", "GET", {
    bizContent: {
      out_trade_no: orderNo,
      total_amount: totalAmount,
      subject,
      product_code: "FAST_INSTANT_TRADE_PAY",
    },
    notify_url: `${siteUrl}/api/pay/alipay/notify`,
    return_url: `${siteUrl}/my/points?recharge=success`,
  });
}

/**
 * 生成手机 H5 支付 URL（alipay.trade.wap.pay）
 * product_code 使用 WAP 专用值 MERCHANT_CHANNEL；业务参数须在 bizContent 内。
 */
export function buildWapPayUrl(orderNo: string, totalAmount: string, subject: string): string {
  const sdk = getAlipaySdk();
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL 未配置");

  return sdk.pageExecute("alipay.trade.wap.pay", "GET", {
    bizContent: {
      out_trade_no: orderNo,
      total_amount: totalAmount,
      subject,
      product_code: "MERCHANT_CHANNEL",
    },
    notify_url: `${siteUrl}/api/pay/alipay/notify`,
    return_url: `${siteUrl}/my/points?recharge=success`,
  });
}

/**
 * 验签支付宝通知
 * @param notifyData 解析后的通知数据
 */
export function verifyNotifySign(notifyData: Record<string, string>): boolean {
  const sdk = getAlipaySdk();
  return sdk.checkNotifySignV2(notifyData);
}

/**
 * 严格将"元"字符串转为"分"整数。
 * - 仅接受：正整数、或正整数+1~2位小数（如 "0.05"、"10"、"10.50"）
 * - 拒绝含更多小数位、负数、非数字字符、空串
 * - 不使用 parseFloat / Math.round，避免浮点精度问题
 * @returns 分（>=1 的 SafeInteger），非法返回 null
 */
export function yuanToFen(value: string): number | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const yuan = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const fen = yuan * 100 + cents;
  if (!Number.isSafeInteger(fen) || fen <= 0) return null;
  return fen;
}

/**
 * alipay.trade.query 标准化返回结构
 */
export interface PaymentQueryResult {
  success: boolean;
  tradeStatus: "SUCCESS" | "PENDING" | "CLOSED" | "UNKNOWN";
  tradeNo?: string;
  outTradeNo?: string;
  totalAmount?: string;
  message?: string;
}

/**
 * 查询支付状态（alipay.trade.query）
 * 返回标准化的 PaymentQueryResult，tradeStatus 已归一化。
 */
export async function queryPaymentStatus(
  outTradeNo: string,
  alipayTradeNo?: string
): Promise<PaymentQueryResult> {
  try {
    const sdk = getAlipaySdk();
    const result = await sdk.exec("alipay.trade.query", {
      bizContent: {
        out_trade_no: outTradeNo,
        trade_no: alipayTradeNo,
      },
    });

    if (result.code !== "10000") {
      return { success: false, tradeStatus: "UNKNOWN", message: result.msg || result.sub_msg || "查询失败" };
    }

    // 归一化 trade_status（兼容 SDK camelcase=true 的 tradeStatus / 原始 trade_status）
    const rawTradeStatus = result.tradeStatus || result.trade_status;
    let tradeStatus: "SUCCESS" | "PENDING" | "CLOSED" | "UNKNOWN";
    switch (rawTradeStatus) {
      case "TRADE_SUCCESS":
      case "TRADE_FINISHED":
        tradeStatus = "SUCCESS";
        break;
      case "WAIT_BUYER_PAY":
        tradeStatus = "PENDING";
        break;
      case "TRADE_CLOSED":
        tradeStatus = "CLOSED";
        break;
      default:
        tradeStatus = "UNKNOWN";
    }

    // 提取原始字段（兼容 camelCase / snake_case）
    const tradeNo = result.trade_no || result.tradeNo;
    const sdkOutTradeNo = result.out_trade_no || result.outTradeNo;
    const totalAmountStr = result.total_amount || result.totalAmount;

    return {
      success: true,
      tradeStatus,
      tradeNo: tradeNo || undefined,
      outTradeNo: sdkOutTradeNo || undefined,
      totalAmount: typeof totalAmountStr === "string" ? totalAmountStr : undefined,
    };
  } catch (e) {
    return { success: false, tradeStatus: "UNKNOWN", message: (e as Error).message };
  }
}

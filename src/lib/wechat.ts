/**
 * 微信支付 APIv3 工具类（Native 支付模式）
 * 使用 wechat-pay-v3 官方 Node.js SDK
 */
import { readFileSync } from "fs";
import {
  apiContainer,
  NativePay,
  WechatPayV3Base,
  type ContainerOptions,
} from "wechat-pay-v3";

/** 微信平台证书默认有效期（毫秒），12 小时 */
const CERT_CACHE_MS = 12 * 60 * 60 * 1000;

/**
 * 商户证书路径
 * 从环境变量读取，避免将 PEM 内容暴露在代码中。
 * 生产环境需确保文件路径指向有效证书。
 */
function loadCert(path: string | undefined, name: string): Buffer {
  if (!path) throw new Error(`${name} 环境变量键名未提供`);
  const p = process.env[path];
  if (!p) throw new Error(`${name} 路径未配置（${path}）`);
  try {
    return readFileSync(p);
  } catch {
    throw new Error(`${name} 文件读取失败：${p}`);
  }
}

/**
 * 获取 WechatPayV3Base 实例（单例）
 * 证书和密钥通过环境变量中的文件路径加载，不在日志中输出密钥原文。
 */
function getBase(): WechatPayV3Base {
  const cert = loadCert("WECHAT_API_CERT_PATH", "WECHAT_API_CERT_PATH");
  const key = loadCert("WECHAT_API_KEY_PATH", "WECHAT_API_KEY_PATH");
  const apiV3Key = process.env.WECHAT_API_V3_KEY || "";
  const mchid = process.env.WECHAT_MCH_ID || "";
  const siteUrl = process.env.SITE_URL || "";

  if (!apiV3Key) throw new Error("WECHAT_API_V3_KEY 未配置");
  if (!mchid) throw new Error("WECHAT_MCH_ID 未配置");
  if (!siteUrl) throw new Error("SITE_URL 未配置");

  const options: ContainerOptions = {
    apiclient_cert: cert,
    apiclient_key: key,
    apiV3Key,
    mchid,
    singleton: true,
    autoUpdateCertificates: true,
    userAgent: "dagtuji-wxpay/1.0",
  };

  // 首次调用时强制更新平台证书（缓存有效期 12 小时）
  const base = apiContainer(options).base;
  if (!base.certExpiresTime || Date.now() > base.certExpiresTime.getTime() - CERT_CACHE_MS) {
    base.updateCertificates(true);
  }

  return base;
}

/** 单例 NativePay 实例（懒初始化） */
let nativePay: NativePay | null = null;

function getNativePay(): NativePay {
  if (!nativePay) {
    getBase(); // 触发证书预热
    nativePay = apiContainer({
      apiclient_cert: loadCert("WECHAT_API_CERT_PATH", "WECHAT_API_CERT_PATH"),
      apiclient_key: loadCert("WECHAT_API_KEY_PATH", "WECHAT_API_KEY_PATH"),
      apiV3Key: process.env.WECHAT_API_V3_KEY || "",
      mchid: process.env.WECHAT_MCH_ID || "",
      singleton: true,
      autoUpdateCertificates: true,
      userAgent: "dagtuji-wxpay/1.0",
    }).use(NativePay);
  }
  return nativePay;
}

/**
 * 统一查询结果结构（与 alipay.ts 的 PaymentQueryResult 对齐）
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
 * 创建微信 Native 支付订单
 *
 * @param orderNo     商户订单号（out_trade_no）
 * @param amount      金额（分），例如 1000 表示 10.00 元
 * @param description 商品描述
 * @returns code_url  用于生成支付二维码的 URL
 */
export async function createNativeOrder(
  orderNo: string,
  amount: number,
  description: string
): Promise<string> {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL 未配置");

  const pay = getNativePay();
  try {
    const result = await pay.order({
      appid: process.env.WECHAT_APP_ID || "",
      mchid: process.env.WECHAT_MCH_ID || "",
      description,
      out_trade_no: orderNo,
      notify_url: `${siteUrl}/api/pay/wechat/notify`,
      amount: { total: amount, currency: "CNY" },
    });
    if (!result?.code_url) {
      throw new Error("微信下单返回缺少 code_url");
    }
    return result.code_url;
  } catch (e) {
    const msg =
      (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ||
      (e as { message?: string })?.message ||
      "微信下单失败";
    throw new Error(msg);
  }
}

/**
 * 查询微信支付订单状态
 *
 * @param outTradeNo   商户订单号
 * @param transactionId 微信支付订单号（可选，优先使用 out_trade_no）
 */
export async function queryPaymentStatus(
  outTradeNo: string,
  transactionId?: string
): Promise<PaymentQueryResult> {
  try {
    let result: Awaited<ReturnType<NativePay["outTradeNoQueryOrder"]>>;
    if (transactionId) {
      result = await getNativePay().transactionIdQueryOrder({
        mchid: process.env.WECHAT_MCH_ID || "",
        transaction_id: transactionId,
      });
    } else {
      result = await getNativePay().outTradeNoQueryOrder({
        mchid: process.env.WECHAT_MCH_ID || "",
        out_trade_no: outTradeNo,
      });
    }

    const tradeState = result.trade_state;
    let tradeStatus: "SUCCESS" | "PENDING" | "CLOSED" | "UNKNOWN";
    switch (tradeState) {
      case "SUCCESS":
        tradeStatus = "SUCCESS";
        break;
      case "CLOSED":
      case "REVOKED":
      case "PAYERROR":
        tradeStatus = "CLOSED";
        break;
      default:
        tradeStatus = "PENDING";
    }

    return {
      success: true,
      tradeStatus,
      tradeNo: result.transaction_id,
      outTradeNo: result.out_trade_no,
      totalAmount: result.amount?.total?.toString(),
    };
  } catch (e) {
    const msg =
      (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ||
      (e as { message?: string })?.message ||
      "微信查询失败";
    return { success: false, tradeStatus: "UNKNOWN", message: msg };
  }
}

/**
 * 严格将"元"字符串转为"分"整数（与 alipay.ts yuanToFen 逻辑一致）。
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
 * 验签并解密微信支付异步通知
 *
 * @param headers 请求头（来自 NextRequest.headers，key 全小写）
 * @param body    请求体原文（raw string）
 * @returns 解密后的通知数据；验签失败时抛出 Error
 */
export async function verifyNotify(
  headers: Record<string, string>,
  body: string
): Promise<Record<string, unknown>> {
  const base = getBase();
  try {
    const result = await base.handleCallback(headers, JSON.parse(body));
    // handleCallback 在验签通过后将解密后的 resource 注入返回对象
    return result as Record<string, unknown>;
  } catch (e) {
    // 验签失败或解密异常，抛出明确错误信息，调用方据此返回 "failure"
    const msg =
      (e as { message?: string })?.message || "验签或解密失败";
    throw new Error(msg);
  }
}

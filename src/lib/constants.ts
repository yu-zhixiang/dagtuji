export const SITE_NAME = "大图集";

/** 注册赠送积分（仅一次，入 bonusPoints 池） */
export const REGISTER_BONUS_POINTS = 200;

/** 设备 Cookie 名称（HttpOnly、长期，库中只存 SHA-256 哈希） */
export const DEVICE_ID_COOKIE = "dagtuji_device_id";
/** 设备 Cookie 有效期（秒，默认 1 年） */
export const DEVICE_ID_MAX_AGE = 365 * 24 * 3600;

/** 风控阈值：低于 NORMAL 直接发放，REVIEW 进入人工审核，REJECT 拒绝发放 */
export const RISK_SCORE_NORMAL = 40;
export const RISK_SCORE_REVIEW = 80;

/** 风控：近 24h 同 IP 注册数阈值 */
export const RISK_IP_REGISTER_LIMIT = 5;
/** 风控：同一设备关联账号数阈值 */
export const RISK_DEVICE_USER_LIMIT = 3;
/** 找图单次消耗积分 */
export const FIND_IMAGE_COST = 2;
/** 高清大图消耗积分 */
export const UPSCALE_COST = 100;
/** 油画风格消耗积分 */
export const STYLE_OIL_COST = 10;
/** 插画风格消耗积分 */
export const STYLE_ILLUSTRATION_COST = 10;

/** 找图单次最大数量 */
export const MAX_QUANTITY = 4;

/** 预设比例 */
export const IMAGE_RATIOS = [
  { label: "1:1", width: 1, height: 1 },
  { label: "3:4", width: 3, height: 4 },
  { label: "4:3", width: 4, height: 3 },
  { label: "9:16", width: 9, height: 16 },
  { label: "16:9", width: 16, height: 9 },
] as const;

/** 预览图水印文字 */
export const WATERMARK_TEXT = "Q:1098888989";
/** 预览图最长边（像素），原图不足则不放大 */
export const PREVIEW_MAX_EDGE = 800;

/** 数据库集合名 */
export const COLLECTIONS = {
  USERS: "users",
  GENERATION_ORDERS: "generation_orders",
  UPSCALE_ORDERS: "upscale_orders",
  STYLE_ORDERS: "style_orders",
  POINT_LOGS: "point_logs",
  SMS_CODES: "sms_codes",
  EMAIL_CODES: "email_codes",
  BONUS_CLAIMS: "bonus_claims",
  RISK_EVENTS: "risk_events",
  RATE_LIMITS: "rate_limits",
} as const;

/** 赠送积分领取状态 */
export type BonusClaimStatus = "granted" | "rejected" | "pending";
/** 风控等级 */
export type RiskLevel = "normal" | "review" | "reject";

export type OrderStatus = "pending" | "processing" | "completed" | "failed";

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "已失败",
};

export type StyleType = "oil_painting" | "illustration";
export type UpscaleSourceType =
  | "generated"
  | "user_upload"
  | "style_oil"
  | "style_illustration";

export const STYLE_TYPE_TEXT: Record<string, string> = {
  oil_painting: "油画",
  illustration: "插画",
};

export const UPSCALE_SOURCE_TYPE_TEXT: Record<string, string> = {
  generated: "找图作品",
  user_upload: "用户上传",
  style_oil: "油画作品",
  style_illustration: "插画作品",
};

export type PointLogType =
  | "register_bonus"
  | "generation"
  | "generation_refund"
  | "upscale"
  | "upscale_refund"
  | "style_oil"
  | "style_illustration"
  | "style_refund"
  | "recharge"
  | "admin_adjust";

export const POINT_LOG_TYPE_TEXT: Record<string, string> = {
  register_bonus: "注册赠送",
  generation: "找图",
  generation_refund: "找图退款",
  upscale: "高清大图",
  upscale_refund: "高清大图退款",
  style_oil: "油画风格",
  style_illustration: "插画风格",
  style_refund: "风格退款",
  recharge: "充值",
  admin_adjust: "管理员调整",
};

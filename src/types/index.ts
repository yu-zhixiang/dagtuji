import type {
  OrderStatus,
  PointLogType,
  StyleType,
  UpscaleSourceType,
} from "@/lib/constants";

export interface User {
  _id: string;
  username: string;
  nickname?: string;
  /** 注册邮箱（邮箱验证码验证） */
  email?: string;
  /** 邮箱是否已验证 */
  emailVerified?: boolean;
  /** 绑定手机号（历史字段，保留兼容） */
  phone?: string;
  /** 手机号是否已验证（历史字段） */
  phoneVerified?: boolean;
  passwordHash?: string;
  /** 总积分（历史字段，仍为 bonusPoints + paidPoints 合计） */
  points: number;
  /** 充值积分（用户充值所得） */
  paidPoints?: number;
  /** 赠送积分（注册赠送等） */
  bonusPoints?: number;
  registerBonusGranted: boolean;
  /** 邮箱验证奖励是否已领取（150积分，独立于旧注册赠送） */
  emailVerifyBonusGranted?: boolean;
  /** 邮箱验证奖励领取时间 */
  emailVerifyBonusGrantedAt?: Date | string;
  /** 赠送状态：granted 已发放 / rejected 已拒绝 / pending 待人工审核（历史字段，仅作只读展示） */
  bonusStatus?: "granted" | "rejected" | "pending";
  /** 风控等级：normal 正常 / review 人工审核 / reject 拒绝赠送 */
  riskLevel?: "normal" | "review" | "reject";
  /** 风控分 */
  riskScore?: number;
  /** 注册设备哈希（SHA-256） */
  deviceHash?: string;
  /** 注册 IP */
  registerIp?: string;
  isAdmin: boolean;
  createdAt: Date | string;
}

export interface GenerationOrder {
  _id: string;
  orderNo: string;
  userId: string;
  keyword: string;
  /** 形如 "1:1"，自定义为 "custom" */
  ratio: string;
  customRatioWidth?: number;
  customRatioHeight?: number;
  quantity: number;
  costPoints: number;
  /** 用户上传的参考图 fileID（可选），仅本人与管理员可见 */
  referenceImageUrl?: string;
  status: OrderStatus;
  /** 原始结果图 fileID，仅管理员可见 */
  originalImages?: string[];
  /** 水印预览图 fileID，普通用户可见 */
  previewImages?: string[];
  adminNote?: string;
  refunded?: boolean;
  createdAt: Date | string;
  completedAt?: Date | string;
}

export interface UpscaleOrder {
  _id: string;
  orderNo: string;
  userId: string;
  sourceType: UpscaleSourceType;
  generationOrderId?: string;
  styleOrderId?: string;
  /** 源图 fileID */
  sourceImageUrl: string;
  sourceImageIndex?: number;
  originalFileName?: string;
  costPoints: number;
  status: OrderStatus;
  /** 最终高清图 fileID，仅属主与管理可见 */
  resultImageUrl?: string;
  adminNote?: string;
  refunded?: boolean;
  createdAt: Date | string;
  completedAt?: Date | string;
}

export interface StyleOrder {
  _id: string;
  orderNo: string;
  userId: string;
  styleType: StyleType;
  /** 源图 fileID */
  sourceImageUrl: string;
  originalFileName?: string;
  costPoints: number;
  status: OrderStatus;
  /** 原始结果图 fileID，仅管理员可见 */
  originalResultImageUrl?: string;
  /** 水印预览图 fileID，普通用户可见 */
  previewImageUrl?: string;
  adminNote?: string;
  refunded?: boolean;
  createdAt: Date | string;
  completedAt?: Date | string;
}

export interface PointLog {
  _id: string;
  userId: string;
  type: PointLogType;
  /** 带符号增减值 */
  points: number;
  remark: string;
  createdAt: Date | string;
}

/** 充值订单状态 */
export type RechargeOrderStatus = "pending" | "paid" | "credited" | "failed";

export interface RechargeOrder {
  _id: string;
  orderNo: string;
  userId: string;
  packageId: string;
  amount: number; // 人民币金额（分）
  points: number; // 赠送积分
  status: RechargeOrderStatus;
  /** 支付宝交易号 */
  alipayTradeNo?: string;
  createdAt: Date | string;
  paidAt?: Date | string;
  creditedAt?: Date | string;
}

export interface SessionUser {
  id: string;
  username: string;
  nickname?: string;
  email?: string;
  phone?: string;
  isAdmin: boolean;
  /** 总积分（bonusPoints + paidPoints 合计，兼容旧字段） */
  points: number;
  /** 充值积分 */
  paidPoints?: number;
  /** 赠送积分 */
  bonusPoints?: number;
}

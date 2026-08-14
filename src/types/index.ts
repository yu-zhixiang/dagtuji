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
  passwordHash?: string;
  points: number;
  registerBonusGranted: boolean;
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

export interface SessionUser {
  id: string;
  username: string;
  nickname?: string;
  isAdmin: boolean;
  points: number;
}

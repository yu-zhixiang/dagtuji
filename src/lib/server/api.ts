import { NextResponse } from "next/server";

/** 统一 API 错误 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 统一错误输出 */
export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[API ERROR]", e);
  return NextResponse.json(
    { error: "服务器内部错误，请稍后再试" },
    { status: 500 }
  );
}

/** 成功响应 */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatPoints } from "@/lib/utils";

type User = {
  id: string;
  username: string;
  nickname: string;
  email: string;
  emailVerified: boolean;
  registerBonusGranted: boolean;
  emailVerifyBonusGranted: boolean;
  emailVerifyBonusGrantedAt?: unknown;
  points: number;
  paidPoints: number;
  bonusPoints: number;
  riskScore: number;
  riskLevel: "review" | "reject" | "normal";
  bonusStatus: string | null;
  createdAt: string;
  lastOrderAt?: string;
};

const STATUS_TEXT: Record<string, string> = {
  pending: "待审核",
  granted: "已发放",
  rejected: "已拒绝",
  review: "人工审核",
  reject: "拒绝",
  normal: "正常",
};

export default function AdminReview() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<{
    totalUsers: number;
    pendingReview: number;
    todayNewUsers: number;
  } | null>(null);
  const [filter, setFilter] = useState<string>("review");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/review?status=${filter}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setUsers(d.users || []);
        setStats(d.stats || null);
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    // 延迟到下一帧，避免在 effect 同步调用 setState 触发级联渲染
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {/* 顶部统计 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "待人工审核",
            value: stats?.pendingReview ?? "-",
            color: "text-amber-400",
          },
          {
            label: "今日新增用户",
            value: stats?.todayNewUsers ?? "-",
            color: "text-emerald-400",
          },
          {
            label: "当前筛选",
            value: STATUS_TEXT[filter] ?? filter,
            color: "text-white",
          },
        ].map((item, i) => (
          <div key={i} className="dt-card p-4">
            <p className="text-sm text-zinc-400">{item.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${item.color}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* 筛选 Tabs */}
      <div className="flex gap-2">
        {(["review", "reject", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              filter === s
                ? "border-[#7c5cff] bg-[#7c5cff]/10 text-[#9d7fff]"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {STATUS_TEXT[s] || s}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* 用户列表 */}
      <div className="dt-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold">风险用户列表</h2>
          <p className="mt-1 text-xs text-zinc-500">
            仅供查看。注册赠送已改为邮箱验证奖励（+150积分），无需人工审核。
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">暂无数据</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{u.nickname}</span>
                      <span className="text-sm text-zinc-500">
                        @{u.username}
                      </span>
                      <span
                        className={`badge ${
                          u.riskLevel === "review"
                            ? "badge-warning"
                            : u.riskLevel === "reject"
                            ? "badge-error"
                            : "badge-success"
                        }`}
                      >
                        {STATUS_TEXT[u.riskLevel] || u.riskLevel}
                      </span>
                      {/* 邮箱验证状态 */}
                      {u.emailVerifyBonusGranted && (
                        <span className="badge badge-success text-xs">
                          邮箱奖励已领
                        </span>
                      )}
                      {u.registerBonusGranted && !u.emailVerifyBonusGranted && (
                        <span className="badge badge-pending text-xs">
                          历史赠送已领
                        </span>
                      )}
                      {!u.emailVerified && (
                        <span className="badge badge-warning text-xs">
                          未验证邮箱
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {u.email || "未绑定邮箱"} · 风险分{" "}
                      <span className="text-zinc-300">{u.riskScore}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      注册于 {formatDate(u.createdAt)}
                      {u.lastOrderAt &&
                        ` · 最近订单 ${formatDate(u.lastOrderAt)}`}
                    </p>
                    <div className="mt-2 flex gap-3 text-xs text-zinc-400">
                      <span>
                        积分{" "}
                        <span className="text-zinc-200">
                          {formatPoints(u.points)}
                        </span>
                      </span>
                      <span>
                        赠送{" "}
                        <span className="text-emerald-400">
                          {u.bonusPoints}
                        </span>
                      </span>
                      <span>
                        充值{" "}
                        <span className="text-sky-400">{u.paidPoints}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部提示 */}
      <div className="rounded-lg border border-zinc-800 bg-black/20 px-4 py-3 text-xs text-zinc-500">
        <strong className="text-zinc-400">说明：</strong>
        自 2026-08-15 起，注册赠送积分改为邮箱验证后发放（+150积分），
        不再进行人工审核。本页面仅用于风控查看。旧版 +200 注册赠送记录保留不变。
      </div>

      <Link href="/admin" className="text-sm text-[#9d7fff] hover:text-[#7c5cff]">
        ← 返回管理后台
      </Link>
    </div>
  );
}

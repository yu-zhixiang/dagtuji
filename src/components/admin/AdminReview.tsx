"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

type ReviewUser = {
  id: string;
  username: string;
  email: string;
  nickname: string;
  registerIp: string;
  deviceHash: string | null;
  riskScore: number;
  riskLevel: string;
  bonusStatus: string;
  points: number;
  paidPoints: number;
  bonusPoints: number;
  createdAt: unknown;
};

const STATUS_TEXT: Record<string, string> = {
  pending: "待审核",
  rejected: "已拒绝",
  granted: "已发放",
};

const riskLevelText = (l: string) =>
  l === "reject" ? "高风险" : l === "review" ? "中风险" : "正常";

export default function AdminReview() {
  const [items, setItems] = useState<ReviewUser[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  function load() {
    setLoading(true);
    fetch(`/api/admin/review?status=${status}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setItems(d.users || []);
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/review?status=${status}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setItems(d.users || []);
      })
      .catch(() => {
        if (active) setError("加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status]);

  async function act(userId: string, action: "approve" | "reject") {
    setBusyId(userId);
    try {
      const res = await fetch("/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "操作失败");
        return;
      }
      load();
    } catch {
      alert("网络错误，请稍后再试");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {["pending", "rejected", "granted"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
              status === s
                ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
            }`}
          >
            {STATUS_TEXT[s]}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <p className="dt-card p-10 text-center text-zinc-500">
          暂无{" "}{STATUS_TEXT[status]}用户
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((u) => (
            <div key={u.id} className="dt-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.username}</span>
                    <span
                      className={`badge ${
                        u.riskLevel === "reject"
                          ? "badge-failed"
                          : u.riskLevel === "review"
                          ? "badge-processing"
                          : "badge-pending"
                      }`}
                    >
                      风险 {riskLevelText(u.riskLevel)}（{u.riskScore}）
                    </span>
                    <span className="badge badge-pending">
                      {STATUS_TEXT[u.bonusStatus]}
                    </span>
                  </div>
                  {u.nickname && (
                    <p className="mt-1 text-xs text-zinc-500">昵称：{u.nickname}</p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    邮箱：{u.email || "-"} · IP：{u.registerIp || "-"}
                  </p>
                  {u.deviceHash && (
                    <p className="mt-1 break-all text-xs text-zinc-600">
                      设备哈希：{u.deviceHash}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-600">
                    积分：充值 {u.paidPoints} / 赠送 {u.bonusPoints} / 合计 {u.points} ·
                    注册时间 {formatDate(u.createdAt)}
                  </p>
                </div>
              </div>

              {u.bonusStatus === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => act(u.id, "approve")}
                    disabled={busyId === u.id}
                    className="btn-primary !py-1.5 text-xs"
                  >
                    {busyId === u.id ? "处理中…" : "通过并发 200 积分"}
                  </button>
                  <button
                    onClick={() => act(u.id, "reject")}
                    disabled={busyId === u.id}
                    className="btn-danger !py-1.5 text-xs"
                  >
                    拒绝发放
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

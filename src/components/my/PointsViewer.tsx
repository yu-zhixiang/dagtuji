"use client";

import { useEffect, useState } from "react";
import { POINT_LOG_TYPE_TEXT } from "@/lib/constants";
import { formatDate, formatPoints } from "@/lib/utils";

type LogItem = {
  _id?: string;
  type: string;
  points: number;
  remark?: string;
  createdAt?: unknown;
};

export default function PointsViewer() {
  const [points, setPoints] = useState<number | null>(null);
  const [paidPoints, setPaidPoints] = useState<number>(0);
  const [bonusPoints, setBonusPoints] = useState<number>(0);
  const [bonusStatus, setBonusStatus] = useState<string>("pending");
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState("");

  function load() {
    fetch("/api/my/points")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setPoints(Number(d.points || 0));
          setPaidPoints(Number(d.paidPoints || 0));
          setBonusPoints(Number(d.bonusPoints || 0));
          setBonusStatus(d.bonusStatus || "pending");
          setLogs(d.logs || []);
        }
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClaim() {
    setClaiming(true);
    setClaimMsg("");
    try {
      const res = await fetch("/api/auth/claim-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setClaimMsg(data.error || "领取失败");
      } else {
        setClaimMsg("领取成功");
        load();
      }
    } catch {
      setClaimMsg("网络错误，请稍后再试");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* 当前积分（双池合计） */}
      <div className="dt-card flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-zinc-400">当前积分</p>
          <p className="mt-1 text-4xl font-bold text-amber-300">
            {points ?? 0}
          </p>
          <div className="mt-2 flex gap-4 text-xs text-zinc-400">
            <span>
              赠送 <b className="text-emerald-400">{bonusPoints}</b>
            </span>
            <span>
              充值 <b className="text-sky-400">{paidPoints}</b>
            </span>
          </div>
        </div>
        <div className="text-5xl">✦</div>
      </div>

      {/* 注册赠送状态 */}
      {bonusStatus !== "granted" && (
        <div className="dt-card p-6">
          <p className="text-sm text-zinc-400">
            {bonusStatus === "rejected"
              ? "注册赠送已被拒绝"
              : "注册赠送积分尚未到账"}
          </p>
          {bonusStatus === "pending" && (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="btn-primary mt-3"
            >
              {claiming ? "领取中…" : "领取注册赠送积分"}
            </button>
          )}
          {claimMsg && (
            <p
              className={`mt-2 text-xs ${
                claimMsg === "领取成功" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {claimMsg}
            </p>
          )}
        </div>
      )}

      {/* 积分流水 */}
      <div className="dt-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold">积分流水</h2>
        </div>
        {logs.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            暂无积分流水
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log, i) => {
              const isPositive = Number(log.points) >= 0;
              return (
                <li key={log._id || i} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm">
                      {POINT_LOG_TYPE_TEXT[log.type] || log.type}
                    </p>
                    {log.remark && (
                      <p className="mt-0.5 text-xs text-zinc-500">{log.remark}</p>
                    )}
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {formatDate(log.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`text-lg font-semibold ${
                      isPositive ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatPoints(Number(log.points))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

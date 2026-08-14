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
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/my/points")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setPoints(Number(d.points || 0));
          setLogs(d.logs || []);
        }
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, []);

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

      {/* 当前积分 */}
      <div className="dt-card flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-zinc-400">当前积分</p>
          <p className="mt-1 text-4xl font-bold text-amber-300">
            {points ?? 0}
          </p>
        </div>
        <div className="text-5xl">✦</div>
      </div>

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

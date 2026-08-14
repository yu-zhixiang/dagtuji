"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  totalUsers: number;
  todayOrders: number;
  pendingGen: number;
  pendingStyle: number;
  pendingUpscale: number;
  completedOrders: number;
};

export default function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setStats(d);
      })
      .catch(() => setError("加载失败"));
  }, []);

  if (error) {
    return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>;
  }
  if (!stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
      </div>
    );
  }

  const cards = [
    { label: "用户总数", value: stats.totalUsers, href: "" },
    { label: "今日订单", value: stats.todayOrders, href: "" },
    { label: "待处理找图", value: stats.pendingGen, href: "/admin/orders" },
    { label: "待处理风格", value: stats.pendingStyle, href: "/admin/styles" },
    { label: "待处理高清", value: stats.pendingUpscale, href: "/admin/upscale" },
    { label: "已完成订单", value: stats.completedOrders, href: "" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {cards.map((c) => {
        const inner = (
          <div className="dt-card p-5">
            <p className="text-sm text-zinc-400">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-white">{c.value}</p>
          </div>
        );
        return c.href ? (
          <Link key={c.label} href={c.href}>
            {inner}
          </Link>
        ) : (
          <div key={c.label}>{inner}</div>
        );
      })}
    </div>
  );
}

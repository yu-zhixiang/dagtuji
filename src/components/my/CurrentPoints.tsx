"use client";

import { useEffect, useState } from "react";

/**
 * 动态积分余额组件。
 * 每次渲染时从 /api/my/points 获取最新值（no-store），
 * 避免 session 快照过期导致显示陈旧积分。
 * 失败时展示 "--"，不会错误显示 0。
 */
export default function CurrentPoints() {
  const [points, setPoints] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/my/points", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error || d.points === undefined) {
          setError(true);
          return;
        }
        setError(false);
        setPoints(Number(d.points));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (error || points === null) {
    return <span className="text-amber-300">--</span>;
  }

  return <span className="text-amber-300">{points}</span>;
}

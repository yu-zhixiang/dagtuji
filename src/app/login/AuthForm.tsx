"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGISTER_BONUS_POINTS } from "@/lib/constants";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失败");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dt-card w-full p-8">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1">
        {(
          [
            ["login", "登录"],
            ["register", "注册"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`cursor-pointer rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <div>
            <label className="mb-1.5 block text-sm text-zinc-400">
              昵称（可选）
            </label>
            <input
              className="input-field"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的昵称"
              maxLength={32}
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">用户名</label>
          <input
            className="input-field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入用户名"
            autoComplete="username"
            maxLength={32}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-400">密码</label>
          <input
            className="input-field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            autoComplete="current-password"
          />
        </div>

        {mode === "register" && (
          <p className="rounded-lg bg-amber-400/5 px-3 py-2 text-xs text-amber-300">
            注册成功将自动赠送 {REGISTER_BONUS_POINTS} 积分
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "请稍候…" : mode === "login" ? "登录" : "注册并领取积分"}
        </button>
      </form>
    </div>
  );
}

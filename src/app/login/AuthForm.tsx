"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const turnstileLoadedRef = useRef(false);

  // 加载并渲染 Turnstile（注册模式、未配置站点密钥时不加载）
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || mode !== "register") return;

    const render = () => {
      if (turnstileRef.current && window.turnstile) {
        turnstileWidgetRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
        });
      }
    };

    if (window.turnstile) {
      render();
      return;
    }
    if (turnstileLoadedRef.current) return;
    turnstileLoadedRef.current = true;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.body.appendChild(script);
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register" && !turnstileToken) {
      setError("请重新完成人机验证后注册");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          nickname: mode === "register" ? nickname : undefined,
          turnstileToken,
        }),
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
              // 切换模式时重置人机验证状态
              setTurnstileToken("");
              if (turnstileWidgetRef.current && window.turnstile) {
                window.turnstile.reset(turnstileWidgetRef.current);
              }
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
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
        </div>

        {mode === "register" && TURNSTILE_SITE_KEY && (
          <div>
            <div ref={turnstileRef} className="turnstile-widget" />
            <p className="mt-1.5 text-xs text-zinc-500">人机验证</p>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "请稍候…" : mode === "login" ? "登录" : "注册"}
        </button>
      </form>
    </div>
  );
}

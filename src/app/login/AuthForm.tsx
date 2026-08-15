"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGISTER_BONUS_POINTS } from "@/lib/constants";

const CODE_COUNTDOWN_SECONDS = 60;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const turnstileLoadedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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

  function startCountdown() {
    setCountdown(CODE_COUNTDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function handleSendCode() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("请先填写正确的邮箱地址");
      return;
    }
    if (!turnstileToken) {
      setError("请先完成人机验证");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "验证码发送失败");
        return;
      }
      if (data.verificationId) setVerificationId(data.verificationId);
      // 本地开发未配置邮箱服务时返回 devCode，自动填入便于调试
      if (data.devCode) {
        setCode(data.devCode);
        setError("本地调试模式：验证码已自动填入");
      } else {
        setError("");
      }
      startCountdown();
      // Turnstile token 是 single-use：发送验证码已消耗一个，立即重置，
      // 让 Turnstile 自动生成新 token 供「注册并领取积分」使用
      setTurnstileToken("");
      if (turnstileWidgetRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetRef.current);
      }
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setSending(false);
    }
  }

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
          nickname,
          email,
          code,
          verificationId,
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
        {mode === "register" && (
          <>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">
                邮箱 <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请填写邮箱"
                  autoComplete="email"
                  maxLength={64}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sending || countdown > 0}
                  className="shrink-0 cursor-pointer rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300 transition-colors hover:border-[#7c5cff] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : sending ? "发送中…" : "获取验证码"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-zinc-400">
                邮箱验证码 <span className="text-red-400">*</span>
              </label>
              <input
                className="input-field"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="请输入 6 位验证码"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </div>
          </>
        )}
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

        {mode === "register" && (
          <p className="rounded-lg bg-amber-400/5 px-3 py-2 text-xs text-amber-300">
            注册需验证邮箱，成功后将自动赠送 {REGISTER_BONUS_POINTS} 积分
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

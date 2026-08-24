"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { EMAIL_VERIFY_BONUS_POINTS, RECHARGE_PACKAGES, PAY_STATUS_TEXT } from "@/lib/constants";
import { POINT_LOG_TYPE_TEXT } from "@/lib/constants";
import { formatDate, formatPoints } from "@/lib/utils";

type LogItem = {
  _id?: string;
  type: string;
  points: number;
  remark?: string;
  createdAt?: unknown;
};

type RechargeOrder = {
  _id: string;
  orderNo: string;
  packageId: string;
  amount: number;
  points: number;
  status: "pending" | "paid" | "credited" | "failed";
  paymentMethod?: "alipay" | "wechat";
  alipayTradeNo?: string;
  wechatTradeNo?: string;
  createdAt: string;
  paidAt?: string;
  creditedAt?: string;
};

export default function PointsViewer() {
  const [points, setPoints] = useState<number | null>(null);
  const [paidPoints, setPaidPoints] = useState<number>(0);
  const [bonusPoints, setBonusPoints] = useState<number>(0);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [registerBonusGranted, setRegisterBonusGranted] = useState<boolean>(false);
  const [emailVerifyBonusGranted, setEmailVerifyBonusGranted] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [rechargeOrders, setRechargeOrders] = useState<RechargeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 邮箱验证相关状态
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyVerificationId, setVerifyVerificationId] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 充值相关状态
  const [recharging, setRecharging] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string>("package_10");
  const [selectedMethod, setSelectedMethod] = useState<"alipay" | "wechat">("alipay");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [wechatQrCode, setWechatQrCode] = useState<string | null>(null);

  function load() {
    fetch("/api/my/points")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setPoints(Number(d.points || 0));
          setPaidPoints(Number(d.paidPoints || 0));
          setBonusPoints(Number(d.bonusPoints || 0));
          setEmailVerified(Boolean(d.emailVerified));
          setRegisterBonusGranted(Boolean(d.registerBonusGranted));
          setEmailVerifyBonusGranted(Boolean(d.emailVerifyBonusGranted));
          setIsAdmin(Boolean(d.isAdmin));
          setLogs(d.logs || []);
        }
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));

    // 加载充值订单
    fetch("/api/my/recharge-orders")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setRechargeOrders(d.orders || []);
      })
      .catch(() => {});
  }

  /** 根据订单的 paymentMethod 动态选择 status API */
  async function checkOrderStatus(order: RechargeOrder) {
    const method = order.paymentMethod || "alipay";
    const endpoint = method === "alipay"
      ? `/api/pay/alipay/status/${order.orderNo}`
      : `/api/pay/wechat/status/${order.orderNo}`;
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success && data.status === "credited") {
        load();
      }
    } catch {}
  }

  async function pollPendingOrders() {
    const pendingOrders = rechargeOrders.filter(
      (o) => o.status === "pending" || o.status === "paid"
    );
    for (const order of pendingOrders) {
      await checkOrderStatus(order);
    }
    load();
  }

  useEffect(() => {
    load();

    // 检查 URL 中的充值成功回调
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("recharge") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      // 轮询检查订单状态（仅执行一次）
      setTimeout(() => pollPendingOrders(), 500);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectPackage(packageId: string) {
    setSelectedPackage(packageId);
    setPayUrl(null);
    setWechatQrCode(null);
  }

  async function handleCreateOrder() {
    setRecharging(true);
    setPayUrl(null);
    setWechatQrCode(null);
    try {
      const endpoint =
        selectedMethod === "alipay"
          ? "/api/pay/alipay/create"
          : "/api/pay/wechat/create";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selectedPackage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建订单失败");
        return;
      }
      if (selectedMethod === "alipay") {
        setPayUrl(data.payUrl);
        if (data.payUrl) {
          window.open(data.payUrl, "_blank");
        }
      } else {
        if (data.codeUrl) {
          // 本地生成二维码 dataURL
          const qrDataUrl = await QRCode.toDataURL(data.codeUrl, { width: 240 });
          setWechatQrCode(qrDataUrl);
        }
      }
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setRecharging(false);
    }
  }

  async function handleSendVerifyCode() {
    setVerifyMsg("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(verifyEmail)) {
      setVerifyMsg("请输入正确的邮箱地址");
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch("/api/my/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyMsg(data.error || "验证码发送失败");
        return;
      }
      if (data.verificationId) setVerifyVerificationId(data.verificationId);
      if (data.devCode) {
        setVerifyCode(data.devCode);
        setVerifyMsg("本地调试模式：验证码已自动填入");
      } else {
        setVerifyMsg("");
      }
      startCountdown();
    } catch {
      setVerifyMsg("网络错误，请稍后再试");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyEmail() {
    setVerifyMsg("");
    if (!verifyEmail) {
      setVerifyMsg("请输入邮箱");
      return;
    }
    if (!verifyCode) {
      setVerifyMsg("请输入验证码");
      return;
    }
    if (!verifyVerificationId) {
      setVerifyMsg("请先获取验证码");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/my/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: verifyEmail,
          code: verifyCode,
          verificationId: verifyVerificationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyMsg(data.error || "验证失败");
        return;
      }
      setVerifyMsg("验证成功！+" + data.points + " 积分已到账");
      setVerifyEmail("");
      setVerifyCode("");
      setVerifyVerificationId("");
      setCountdown(0);
      load();
    } catch {
      setVerifyMsg("网络错误，请稍后再试");
    } finally {
      setVerifying(false);
    }
  }

  function startCountdown() {
    setCountdown(60);
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

      {/* 充值积分区域（仅管理员可见，沙箱测试用） */}
      {isAdmin && (
      <div className="dt-card p-6">
        <h2 className="mb-4 font-semibold text-zinc-200">
          充值积分 <span className="text-xs text-amber-400 font-normal">(沙箱环境)</span>
        </h2>

        {!payUrl && !wechatQrCode ? (
          <>
            {/* 支付方式选择 */}
            <div className="flex gap-2 mb-4">
              {(["alipay", "wechat"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSelectedMethod(m);
                    setPayUrl(null);
                    setWechatQrCode(null);
                  }}
                  className={`flex-1 cursor-pointer rounded-xl border-2 py-2 text-sm font-medium transition-all ${
                    selectedMethod === m
                      ? m === "alipay"
                        ? "border-[#1677FF] bg-[#1677FF]/10 text-[#1677FF]"
                        : "border-[#07C160] bg-[#07C160]/10 text-[#07C160]"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {m === "alipay" ? "支付宝" : "微信支付"}
                </button>
              ))}
            </div>

            {/* 套餐选择 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {RECHARGE_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => handleSelectPackage(pkg.id)}
                  className={`cursor-pointer rounded-xl border-2 p-4 text-left transition-all ${
                    selectedPackage === pkg.id
                      ? "border-[#7c5cff] bg-[#7c5cff]/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <p className="font-medium text-zinc-200">{pkg.name}</p>
                  <p className="mt-1 text-2xl font-bold text-amber-300">
                    {formatPoints(pkg.points)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">¥{(pkg.amount / 100).toFixed(2)}</p>
                  {pkg.remark && (
                    <p className="mt-1 text-xs text-emerald-400">{pkg.remark}</p>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={recharging}
              className="btn-primary w-full"
            >
              {recharging ? "创建订单中…" : "立即充值"}
            </button>
          </>
        ) : payUrl ? (
          <div className="text-center py-4">
            <p className="text-zinc-300">正在跳转到支付宝...</p>
            <p className="mt-2 text-xs text-zinc-500">
              支付完成后请返回本站，积分将自动到账
            </p>
          </div>
        ) : wechatQrCode ? (
          <div className="text-center py-4">
            <div className="inline-block rounded-xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wechatQrCode}
                alt="微信支付二维码"
                className="w-60 h-60 block"
                width={240}
                height={240}
              />
            </div>
            <p className="mt-3 text-zinc-300">微信扫码支付</p>
            <p className="mt-1 text-xs text-zinc-500">
              支付完成后请返回本站，积分将自动到账
            </p>
          </div>
        ) : null}
      </div>
      )}

      {/* 充值记录 */}
      {rechargeOrders.length > 0 && (
        <div className="dt-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold">充值记录</h2>
          </div>
          <ul className="divide-y divide-border">
            {rechargeOrders.map((order) => (
              <li key={order._id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {RECHARGE_PACKAGES.find((p) => p.id === order.packageId)?.name || order.packageId}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    订单号: {order.orderNo}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-400">+{formatPoints(order.points)}</p>
                  <span className={`badge ${
                    order.status === "credited" ? "badge-success" :
                    order.status === "pending" ? "badge-warning" :
                    order.status === "paid" ? "badge-pending" : "badge-error"
                  }`}>
                    {PAY_STATUS_TEXT[order.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 邮箱验证奖励模块 */}
      {emailVerifyBonusGranted ? (
        <div className="dt-card p-6">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓</span>
            <div>
              <p className="font-medium text-zinc-200">邮箱验证奖励已领取</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                +{EMAIL_VERIFY_BONUS_POINTS} 积分
              </p>
            </div>
            <span className="ml-auto badge badge-pending text-xs">
              已领取
            </span>
          </div>
        </div>
      ) : emailVerified && registerBonusGranted ? (
        <div className="dt-card p-6">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓</span>
            <div>
              <p className="font-medium text-zinc-200">历史积分已发放</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                注册赠送已完成，邮箱验证奖励无需重复领取
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dt-card p-6">
          <p className="mb-4 text-sm text-zinc-300">
            验证邮箱可获得{" "}
            <span className="font-semibold text-emerald-400">
              +{EMAIL_VERIFY_BONUS_POINTS} 积分
            </span>
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                type="email"
                value={verifyEmail}
                onChange={(e) => setVerifyEmail(e.target.value)}
                placeholder="请输入邮箱"
                autoComplete="email"
                maxLength={64}
              />
              <button
                type="button"
                onClick={handleSendVerifyCode}
                disabled={sendingCode || countdown > 0}
                className="shrink-0 cursor-pointer rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300 transition-colors hover:border-[#7c5cff] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {countdown > 0 ? `${countdown}s` : sendingCode ? "发送中…" : "获取验证码"}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                type="text"
                inputMode="numeric"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder="请输入 6 位验证码"
                autoComplete="one-time-code"
                maxLength={6}
              />
              <button
                type="button"
                onClick={handleVerifyEmail}
                disabled={verifying}
                className="btn-primary shrink-0"
              >
                {verifying ? "验证中…" : "验证并领取"}
              </button>
            </div>
          </div>
          {verifyMsg && (
            <p
              className={`mt-3 text-xs ${
                verifyMsg.includes("成功") ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {verifyMsg}
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

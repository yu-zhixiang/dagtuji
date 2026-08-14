"use client";

import { useEffect, useRef, useState } from "react";
import ImageCard from "@/components/ui/ImageCard";
import { STYLE_TYPE_TEXT } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type Order = Record<string, unknown>;

const STATUS_TEXT: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "已失败",
};
const statusClass = (s: string) =>
  `badge ${s === "completed" ? "badge-completed" : s === "failed" ? "badge-failed" : s === "processing" ? "badge-processing" : "badge-pending"}`;

export default function AdminStyles() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState("all");
  const [styleType, setStyleType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<Order | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/admin/styles?status=${status}&styleType=${styleType}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setItems(d.items || []);
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/styles?status=${status}&styleType=${styleType}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setItems(d.items || []);
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
  }, [status, styleType]);

  async function update(id: string, action: string) {
    const adminNote = note[id] || undefined;
    const res = await fetch(`/api/admin/styles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "操作失败");
      return;
    }
    load();
  }

  function handleUpload() {
    if (!uploadTarget || !fileInputRef.current?.files?.[0]) return;
    const fd = new FormData();
    fd.append("file", fileInputRef.current.files[0]);
    fetch(`/api/admin/styles/${String(uploadTarget._id)}`, {
      method: "POST",
      body: fd,
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          alert(d.error || "上传失败");
          return;
        }
        setUploadTarget(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        load();
      })
      .catch(() => alert("上传失败"));
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {["all", "pending", "processing", "completed", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
              status === s
                ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
            }`}
          >
            {s === "all" ? "全部" : STATUS_TEXT[s]}
          </button>
        ))}
        <span className="mx-2 w-px bg-border" />
        {[
          ["all", "全部风格"],
          ["oil_painting", "油画"],
          ["illustration", "插画"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setStyleType(k)}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
              styleType === k
                ? "border-transparent bg-gradient-to-r from-[#00c2a8] to-[#34d399] text-white"
                : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <p className="dt-card p-10 text-center text-zinc-500">暂无风格订单</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((order) => {
            const s = String(order.status);
            return (
              <div key={String(order._id)} className="dt-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {STYLE_TYPE_TEXT[String(order.styleType)] || "风格"}
                  </span>
                  <span className={statusClass(s)}>{STATUS_TEXT[s]}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  单号 {String(order.orderNo)} · {formatDate(order.createdAt)}
                  {order.originalFileName ? ` · ${String(order.originalFileName)}` : ""}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="mb-2 text-xs text-zinc-500">源图：</p>
                    <ImageCard fileId={String(order.sourceImageUrl || "")} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-zinc-500">
                      结果原图{order.originalResultImageUrl ? "：" : "（未上传）"}：
                    </p>
                    {order.originalResultImageUrl ? (
                      <ImageCard fileId={String(order.originalResultImageUrl)} />
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-xs text-zinc-600">
                        暂无结果图
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-zinc-500">
                      水印预览{order.previewImageUrl ? "：" : "（未生成）"}：
                    </p>
                    {order.previewImageUrl ? (
                      <ImageCard fileId={String(order.previewImageUrl)} />
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-xs text-zinc-600">
                        暂无预览图
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    className="input-field !py-1.5 text-sm"
                    placeholder="备注（可选）"
                    value={note[String(order._id)] || ""}
                    onChange={(e) =>
                      setNote((n) => ({ ...n, [String(order._id)]: e.target.value }))
                    }
                  />
                </div>

                {(s === "pending" || s === "processing") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s === "pending" && (
                      <button onClick={() => update(String(order._id), "processing")} className="btn-secondary !py-1.5 text-xs">
                        标记处理中
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setUploadTarget(order);
                        setTimeout(() => fileInputRef.current?.click(), 0);
                      }}
                      className="btn-primary !py-1.5 text-xs"
                    >
                      上传结果原图
                    </button>
                    <button onClick={() => update(String(order._id), "complete")} className="btn-secondary !py-1.5 text-xs">
                      标记完成
                    </button>
                    <button onClick={() => update(String(order._id), "failed")} className="btn-danger !py-1.5 text-xs">
                      标记失败（自动退10分）
                    </button>
                  </div>
                )}

                {order.adminNote ? (
                  <p className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-xs text-zinc-400">
                    备注：{String(order.adminNote)}
                  </p>
                ) : null}
                {order.refunded === true && s === "failed" && (
                  <p className="mt-2 text-xs text-amber-300">已自动退款</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {uploadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="dt-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold">上传风格结果图</h3>
            <p className="mt-2 text-sm text-zinc-400">
              选择 1 张结果原图，系统将自动生成 800px 水印预览图并标记完成。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setUploadTarget(null)} className="btn-secondary">
                取消
              </button>
              <button onClick={handleUpload} className="btn-primary">
                选择并上传
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

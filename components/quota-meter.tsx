"use client";

import { AlertCircle, Gauge, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { QuotaStatus } from "@/lib/types";

function compact(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const modelLabels: Record<string, string> = {
  "gpt-5.4-mini": "GPT-5.4 mini",
  "gpt-5.4": "GPT-5.4",
};

export function QuotaMeter({ quota }: { quota: QuotaStatus | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!quota) {
    return (
      <div className="quota-card quota-loading">
        <Gauge size={17} />
        Đang đọc quota...
      </div>
    );
  }

  const exhausted = quota.exhausted;
  const resetMs = Math.max(0, new Date(quota.resetAt).getTime() - now);
  const hours = Math.floor(resetMs / 3_600_000);
  const minutes = Math.floor((resetMs % 3_600_000) / 60_000);
  const resetCountdown = `${hours} giờ ${minutes} phút`;

  return (
    <div className={`quota-card${exhausted ? " quota-exhausted" : ""}`}>
      <div className="quota-title">
        <span>
          {exhausted ? <AlertCircle size={17} /> : <ShieldCheck size={17} />}
          {exhausted ? "Đã hết quota hôm nay" : "Free token guard"}
        </span>
        <strong>Reset sau {resetCountdown}</strong>
      </div>

      <div className="quota-models">
        {quota.models.map((model) => (
          <div className="quota-model" key={model.model}>
            <div className="quota-model-head">
              <strong>{modelLabels[model.model] ?? model.model}</strong>
              <span className={model.remaining <= 0 ? "quota-model-out" : ""}>
                còn {compact(model.remaining)} / {compact(model.safetyLimit)} token
              </span>
            </div>
            <div
              className="quota-track"
              aria-label={`${modelLabels[model.model] ?? model.model} đã dùng ${model.percentUsed}%`}
            >
              <span style={{ width: `${model.percentUsed}%` }} />
            </div>
          </div>
        ))}
      </div>

      {!quota.trackingAvailable && (
        <p className="quota-warning">
          Chưa nối Supabase: production sẽ khóa gọi AI để tránh vượt quota.
        </p>
      )}
      {exhausted && (
        <p className="quota-stop">
          Hệ thống đã tạm dừng AI để không phát sinh phí. Quota tự mở lại lúc 07:00 sáng
          theo giờ Việt Nam.
        </p>
      )}
      <p className="quota-scope">
        Phân tích video thử GPT-5.4 trước, hết thì dùng GPT-5.4 mini. Reset 00:00
        UTC (07:00 sáng Việt Nam).
      </p>
    </div>
  );
}

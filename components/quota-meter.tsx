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

function fullNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

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

  const exhausted = quota.remaining <= 0;
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
        <strong>{quota.model}</strong>
      </div>
      <div className="quota-row">
        <div className="quota-track" aria-label={`Đã dùng ${quota.percentUsed}% quota an toàn`}>
          <span style={{ width: `${quota.percentUsed}%` }} />
        </div>
        <strong>{quota.percentUsed}%</strong>
      </div>
      <div className="quota-stats">
        <span>Đã dùng {fullNumber(quota.trackedUsed)} token</span>
        <span>{exhausted ? "Còn 0 token an toàn" : `Còn ${compact(quota.remaining)} token an toàn`}</span>
        <span>Trần app {compact(quota.safetyLimit)}/ngày</span>
        <span>Reset sau {resetCountdown}</span>
      </div>
      {exhausted && (
        <p className="quota-stop">
          Hệ thống đã tạm dừng AI để không phát sinh phí. Quota tự mở lại lúc 07:00 sáng
          theo giờ Việt Nam.
        </p>
      )}
      {!quota.trackingAvailable && (
        <p className="quota-warning">
          Chưa nối Supabase: production sẽ khóa gọi AI để tránh vượt quota.
        </p>
      )}
      <p className="quota-scope">
        Reset lúc 00:00 UTC, tương đương 07:00 sáng Việt Nam. Bộ đếm chỉ theo dõi ứng
        dụng này.
      </p>
    </div>
  );
}

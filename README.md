# Escbase Read

Ứng dụng Next.js đọc thread X hoặc bài blog, phân tích bằng OpenAI và lưu bài chia sẻ vào Supabase.

Với link X/Twitter, app dùng thư viện [`@steipete/bird`](https://www.npmjs.com/package/@steipete/bird)
để đọc thread, replies và link tác giả thông qua cookie X (`auth_token`, `ct0`).
Đây không phải X API chính thức, nên có thể hỏng khi X thay đổi giao diện/API nội bộ.

## Cấu trúc dự án

```text
app/
  page.tsx                 Trang chủ
  layout.tsx               Metadata, fonts, Vercel Analytics/Speed Insights
  [shareSlug]/page.tsx     Trang chia sẻ dạng /ten-bai-viet-<id>
  a/[slug]/page.tsx        Route cũ, redirect sang URL chia sẻ mới
  api/analyze/route.ts     API đọc nguồn, gọi OpenAI, lưu cache
  api/quota/route.ts       API trả quota token trong ngày
components/
  analyzer.tsx             Form nhập link, danh sách bài hôm nay, quota footer
  analysis-view.tsx        UI bài tóm tắt, copy/share
  quota-meter.tsx          Thanh quota
lib/
  analyze.ts               Gọi OpenAI và ép JSON schema
  bird.ts                  Đọc thread/replies X bằng @steipete/bird
  source.ts                Chọn nguồn X hoặc web, đọc link liên quan
  web.ts                   Đọc trang blog/web thường
  supabase.ts              Cache bài viết, lấy bài chia sẻ, danh sách hôm nay
  quota.ts                 Guard token miễn phí theo ngày
  share-url.ts             Tạo URL chia sẻ có tiêu đề
supabase/migrations/
  001_create_analyses.sql  Bảng lưu bài phân tích/cache/share
  002_create_ai_daily_usage.sql  Bảng quota và RPC reserve/finalize token
public/
  escbase-read-og.png      Ảnh share/OG
  escbase-hero-background.jpg
  esclogo-classic-v2.png
  x-logo-official.svg
```

## Chạy local

```bash
npm install
cp .env.example .env
npm run dev
```

## Biến môi trường

### OpenAI

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_FREE_DAILY_LIMIT=2500000
OPENAI_FREE_SAFE_LIMIT=2350000
OPENAI_DAILY_USAGE_OFFSET=0
OPENAI_DAILY_USAGE_OFFSET_DATE=2026-06-06
```

Ứng dụng khóa model ở `gpt-5.4-mini`, giới hạn output và dừng tại ngưỡng an toàn
`2.350.000/2.500.000` token mỗi ngày.

`OPENAI_DAILY_USAGE_OFFSET` dùng khi key đã tiêu token trước lúc bật app/quota
guard. `OPENAI_DAILY_USAGE_OFFSET_DATE` là ngày UTC của offset; offset tự hết
hiệu lực vào ngày UTC tiếp theo.

### X / Bird

```dotenv
AUTH_TOKEN=
CT0=
```

`AUTH_TOKEN` và `CT0` là cookie X của tài khoản dùng để đọc dữ liệu bằng Bird.
Không commit hai giá trị này và không đặt dưới tiền tố `NEXT_PUBLIC_`.

Cách lấy `auth_token` và `ct0` trên Chrome/Edge:

1. Đăng nhập X tại `https://x.com`.
2. Mở DevTools: `Option + Command + I` trên macOS hoặc `F12` trên Windows.
3. Vào tab `Application`.
4. Chọn `Storage` -> `Cookies` -> `https://x.com`.
5. Tìm cookie `auth_token`, copy cột `Value` vào `AUTH_TOKEN`.
6. Tìm cookie `ct0`, copy cột `Value` vào `CT0`.
7. Nếu không thấy `ct0`, mở tab Network, reload `x.com`, bấm một request tới
   `x.com`, kiểm tra phần Request Headers/Cookie rồi tìm `ct0=...`.

Lưu ý: đây là cookie đăng nhập. Hãy dùng tài khoản phụ/ít quyền nếu triển khai
production, và rotate cookie nếu nghi ngờ bị lộ.

### Supabase

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CACHE_TTL_HOURS=168
```

`SUPABASE_SECRET_KEY` là key dạng `sb_secret_...`, chỉ dùng ở backend. Có thể
dùng `SUPABASE_SERVICE_ROLE_KEY` legacy làm fallback, nhưng không dùng
publishable key cho quota guard hoặc thao tác ghi.

Kết quả được cache trong Supabase 7 ngày (`168` giờ) theo mặc định. Có thể tăng
`CACHE_TTL_HOURS` tối đa một năm; link cache không gọi OpenAI và không tiêu token.

Chạy lần lượt hai file trong Supabase SQL Editor:

1. `supabase/migrations/001_create_analyses.sql`
2. `supabase/migrations/002_create_ai_daily_usage.sql`

Migration thứ hai tạo bộ đếm giao dịch để nhiều request đồng thời không vượt ngưỡng.
Production sẽ không gọi OpenAI nếu thiếu cấu hình Supabase.

Thanh quota chỉ đếm request của ứng dụng này từ thời điểm bật Supabase. Để số liệu
khớp ưu đãi thực tế, dùng một OpenAI project/API key riêng và không dùng key đó ở
ứng dụng khác. Nếu key đã dùng token trước khi bật bộ đếm, đặt số đã dùng vào
`OPENAI_DAILY_USAGE_OFFSET` và ngày UTC tương ứng vào
`OPENAI_DAILY_USAGE_OFFSET_DATE`; offset tự hết hiệu lực vào ngày UTC tiếp theo.

### App/security

```dotenv
RATE_LIMIT_SALT=change-me
```

`RATE_LIMIT_SALT` dùng để hash/rate-limit request theo IP mà không lưu IP thô.
Hãy đổi giá trị này trên production.

## Deploy Vercel

- Chọn Node.js `22.x` hoặc mới hơn vì Bird yêu cầu Node 22.
- Thêm toàn bộ biến môi trường ở trên vào Vercel Project Settings.
- Không đặt `OPENAI_API_KEY`, `AUTH_TOKEN`, `CT0` hoặc service role key dưới tiền tố `NEXT_PUBLIC_`.
- Bird dùng cookie X nội bộ và có thể hỏng khi X thay đổi GraphQL. Theo dõi log và chuẩn bị phương án X API chính thức cho production.

## Privacy & data

- Người dùng chỉ nên dán link X/Twitter hoặc blog công khai. Không dán nội dung
  riêng tư, nội bộ hoặc cần bảo mật.
- Nội dung nguồn công khai, replies/link liên quan và bài tóm tắt được gửi tới
  OpenAI để phân tích.
- Kết quả phân tích được lưu/cache trong Supabase để tạo link chia sẻ công khai
  và tránh gọi AI lại cho cùng một link.
- Link chia sẻ dạng `/ten-bai-viet-<id>` là công khai với bất kỳ ai có URL.
- Vercel Analytics và Speed Insights có thể thu thập telemetry vận hành cơ bản
  theo cấu hình của Vercel.
- `AUTH_TOKEN`, `CT0`, `OPENAI_API_KEY` và Supabase secret chỉ được dùng ở
  backend; không được đưa vào biến `NEXT_PUBLIC_` hoặc commit lên Git.

## License & notices

Source code được phát hành theo MIT License. Xem `LICENSE`.

Logo Escbase, ảnh OG/hero và các asset thương hiệu không nằm trong MIT License;
xem `NOTICE.md` để biết chi tiết. Logo X lấy từ X Brand Toolkit chính thức và
phải tuân thủ guideline/thương hiệu của X.

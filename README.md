# Escbase Read

Ứng dụng Next.js đọc thread X hoặc bài blog, phân tích bằng OpenAI và lưu bài chia sẻ vào Supabase.

## Chạy local

```bash
npm install
npm run dev
```

Biến bắt buộc trong `.env`:

```dotenv
OPENAI_API_KEY=
AUTH_TOKEN=
CT0=
```

Ứng dụng khóa model ở `gpt-5.4-mini`, giới hạn output và dừng tại ngưỡng an toàn
`2.350.000/2.500.000` token mỗi ngày:

```dotenv
OPENAI_MODEL=gpt-5.4-mini
OPENAI_FREE_DAILY_LIMIT=2500000
OPENAI_FREE_SAFE_LIMIT=2350000
OPENAI_DAILY_USAGE_OFFSET=0
OPENAI_DAILY_USAGE_OFFSET_DATE=2026-06-06
CACHE_TTL_HOURS=168
```

Kết quả được cache trong Supabase 7 ngày (`168` giờ) theo mặc định. Có thể tăng
`CACHE_TTL_HOURS` tối đa một năm; link cache không gọi OpenAI và không tiêu token.

Biến Supabase để lưu/cache và tạo link chia sẻ:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` là key dạng `sb_secret_...`, chỉ dùng ở backend. Có thể
dùng `SUPABASE_SERVICE_ROLE_KEY` legacy làm fallback, nhưng không dùng
publishable key cho quota guard hoặc thao tác ghi.

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

## Deploy Vercel

- Chọn Node.js `22.x` hoặc mới hơn vì Bird yêu cầu Node 22.
- Thêm toàn bộ biến môi trường ở trên vào Vercel Project Settings.
- Không đặt `OPENAI_API_KEY`, `AUTH_TOKEN`, `CT0` hoặc service role key dưới tiền tố `NEXT_PUBLIC_`.
- Bird dùng cookie X nội bộ và có thể hỏng khi X thay đổi GraphQL. Theo dõi log và chuẩn bị phương án X API chính thức cho production.

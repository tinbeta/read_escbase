# Escbase Read

Ứng dụng Next.js đọc thread X hoặc bài blog, phân tích bằng OpenAI và lưu bài chia sẻ vào Supabase.
Ngoài ra còn phân tích video YouTube/TikTok/Facebook Reel: tải video, chuyển giọng nói
thành văn bản, rồi tóm tắt nội dung + kiểm chứng tính đúng sai bằng web search.

Với link X/Twitter, app dùng thư viện [`@steipete/bird`](https://www.npmjs.com/package/@steipete/bird)
để đọc thread, replies và link tác giả thông qua cookie X (`auth_token`, `ct0`).
Đây không phải X API chính thức, nên có thể hỏng khi X thay đổi giao diện/API nội bộ.

Với link video YouTube/TikTok/Facebook Reel, app dùng
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) để tải âm thanh và
[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) (qua một script Python
riêng) để transcribe, sau đó dùng [`@openai/agents`](https://www.npmjs.com/package/@openai/agents)
với công cụ `web_search` để kiểm chứng các tuyên bố trong video bằng nguồn uy tín.

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
  video-analysis-view.tsx  UI tóm tắt + kiểm chứng tính đúng sai của video
  quota-meter.tsx          Thanh quota
  auth-gate.tsx            Màn hình đăng nhập Google / từ chối truy cập
lib/
  analyze.ts               Gọi OpenAI và ép JSON schema (nguồn X/blog)
  bird.ts                  Đọc thread/replies X bằng @steipete/bird
  source.ts                Chọn nguồn video/X/web, đọc link liên quan
  video-platform.ts        Nhận diện link YouTube/TikTok/Facebook Reel (client-safe)
  video.ts                 Tải audio bằng yt-dlp, transcribe bằng faster-whisper
  video-analyze.ts         Agent + web_search để tóm tắt & kiểm chứng video
  video-schemas.ts         Zod schema cho kết quả phân tích video
  language.ts              Helper kiểm tra output có lẫn ngôn ngữ khác tiếng Việt
  web.ts                   Đọc trang blog/web thường
  supabase.ts              Cache bài viết, lấy bài chia sẻ, danh sách hôm nay
  quota.ts                 Quota token chung (gpt-5.4 + gpt-5.4-mini) cho video và X/blog
  share-url.ts             Tạo URL chia sẻ có tiêu đề
  auth.ts                  requireAllowedUser() — chặn API theo allowlist Google
  auth-context.tsx         React context chia access token cho các component con
  supabase-browser.ts      Supabase client phía trình duyệt (đăng nhập Google)
scripts/
  transcribe.py            CLI gọi faster-whisper, Node spawn để lấy transcript
supabase/migrations/
  001_create_analyses.sql  Bảng lưu bài phân tích/cache/share
  002_create_ai_daily_usage.sql  Bảng quota và RPC reserve/finalize token
  003_add_analysis_token_count.sql
  004_allow_video_source_type.sql  Cho phép source_type='video'
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

### Cài công cụ cho phân tích video (yt-dlp + ffmpeg + faster-whisper)

Bỏ qua phần này nếu chỉ cần đọc X/blog. Để phân tích video YouTube/TikTok/
Facebook Reel, cần thêm ở máy chạy app (macOS, dùng Homebrew):

```bash
brew install yt-dlp ffmpeg

python3 -m venv .venv
.venv/bin/pip install faster-whisper
```

`ffmpeg` được `yt-dlp` dùng để trích xuất âm thanh (mp3) từ video trước khi
transcribe. `.venv` không commit vào Git (đã có trong `.gitignore`).

Nếu venv/python binary không nằm ở đường dẫn mặc định `.venv/bin/python3`
(tính từ project root), đặt `WHISPER_PYTHON_PATH` trong `.env` — có thể là
đường dẫn tương đối (ví dụ `.venv/bin/python3`) hoặc tuyệt đối.

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

Chạy lần lượt các file trong Supabase SQL Editor:

1. `supabase/migrations/001_create_analyses.sql`
2. `supabase/migrations/002_create_ai_daily_usage.sql`
3. `supabase/migrations/003_add_analysis_token_count.sql`
4. `supabase/migrations/004_allow_video_source_type.sql`
5. `supabase/migrations/005_ai_daily_usage_model_column.sql`

Migration thứ hai tạo bộ đếm giao dịch để nhiều request đồng thời không vượt ngưỡng.
Production sẽ không gọi OpenAI nếu thiếu cấu hình Supabase.
Migration thứ ba thêm `token_count` để lưu và hiển thị số token đã dùng cho từng bài.
Bài đã tạo trước migration thứ ba sẽ hiển thị "chưa lưu token" vì trước đó DB
chưa lưu số token theo từng bài.
Migration thứ tư mở constraint `source_type` để cho phép giá trị `'video'`.
**Nếu chưa chạy migration này, phân tích video vẫn chạy và trả kết quả bình
thường, nhưng sẽ không lưu được vào Supabase** (insert lỗi vi phạm check
constraint, log ở server, `slug` trả về `null`, không xuất hiện ở "Thư viện
hôm nay" và không cache lại cho lần sau).

Migration thứ năm thêm cột `model` thật vào `ai_daily_usage` (khóa chính
`(usage_day, model)`) để mỗi model có 1 dòng riêng theo đúng ngày thật. Trước
đó, quota của `gpt-5.4` dùng mẹo "ngày giả trong tương lai" (ngày thật + 60
năm) để không cần migration — nhìn trong Table Editor sẽ thấy dòng có
`usage_day` kiểu `2086-...`, không sai dữ liệu nhưng dễ gây hiểu lầm. Migration
này tự sửa lại dòng đó về đúng ngày thật với `model = 'gpt-5.4'`. **Nếu chưa
chạy migration này, app vẫn chạy bình thường** (code cũ và mới không tương
thích RPC signature nên nếu code đã deploy nhưng DB chưa migrate, quota sẽ báo
lỗi "Không thể kiểm tra quota" — nên chạy migration này ngay khi cập nhật code).

### Đăng nhập Google + allowlist email

```dotenv
ALLOWED_EMAIL=email1@gmail.com,email2@gmail.com
NEXT_PUBLIC_ALLOWED_EMAIL=email1@gmail.com,email2@gmail.com
```

App giờ yêu cầu đăng nhập Google trước khi dùng (giống cơ chế của `lin_escbase`):
chỉ những email trong danh sách trên mới được dùng tính năng phân tích. Trang
chia sẻ (`/ten-bai-viet-<id>`) vẫn công khai, không cần đăng nhập, vì đó là mục
đích của link chia sẻ.

**Cách hoạt động:**
- `ALLOWED_EMAIL` (server) chặn thật ở API `/api/analyze`, `/api/quota`,
  `/api/analyses/today` — kiểm tra token đăng nhập Google qua Supabase rồi so
  email với danh sách.
- `NEXT_PUBLIC_ALLOWED_EMAIL` (client) chỉ để hiện đúng màn hình (đăng nhập /
  từ chối) ngay lập tức, không phải lớp bảo mật thật. **Hai biến này phải
  giống hệt nhau**, nếu không sẽ có lúc UI cho qua nhưng API vẫn từ chối.
- Đây là cơ chế gate ở client (không dùng middleware/cookie session), giống
  hệt cách `lin_escbase` làm — HTML/JS ban đầu vẫn được gửi cho người chưa
  đăng nhập, nhưng UI thật và mọi API đều bị khoá cho tới khi đăng nhập đúng
  email được phép.

**Thiết lập Google OAuth trên Supabase (bắt buộc để nút "Đăng nhập bằng
Google" hoạt động):**

1. Vào Supabase Dashboard của project → **Authentication** → **Providers** →
   bật **Google**.
2. Tạo OAuth Client ID (loại "Web application") trong Google Cloud Console,
   thêm callback URL mà Supabase hiển thị ở bước 1 (dạng
   `https://<project-ref>.supabase.co/auth/v1/callback`) vào phần
   "Authorized redirect URIs" của Google Client.
3. Dán Client ID + Client Secret từ Google vào Supabase Dashboard (bước 1),
   lưu lại.
4. Vào **Authentication** → **URL Configuration**, đặt **Site URL** là domain
   chạy app (production) và thêm cả `http://localhost:3000` vào **Redirect
   URLs** để login được khi chạy local.

Không cần Client ID/Secret của Google trong `.env` của app — toàn bộ OAuth do
Supabase xử lý, app chỉ gọi `supabase.auth.signInWithOAuth({ provider: "google" })`.

Thanh quota chỉ đếm request của ứng dụng này từ thời điểm bật Supabase. Để số liệu
khớp ưu đãi thực tế, dùng một OpenAI project/API key riêng và không dùng key đó ở
ứng dụng khác. Nếu key đã dùng token trước khi bật bộ đếm, đặt số đã dùng vào
`OPENAI_DAILY_USAGE_OFFSET` và ngày UTC tương ứng vào
`OPENAI_DAILY_USAGE_OFFSET_DATE`; offset tự hết hiệu lực vào ngày UTC tiếp theo.

### Video (YouTube / TikTok / Facebook Reel)

```dotenv
YT_DLP_PATH=yt-dlp
FFMPEG_PATH=ffmpeg
WHISPER_PYTHON_PATH=.venv/bin/python3
WHISPER_MODEL_SIZE=small
WHISPER_COMPUTE_TYPE=int8
WHISPER_DEVICE=cpu
VIDEO_MAX_DURATION_SECONDS=1200
```

Quota token là **một hệ thống chung** cho cả phân tích video và X/blog, theo
hai free tier thật của OpenAI (cấu hình ở phần OpenAI phía trên):

- `gpt-5.4-mini` (`OPENAI_FREE_*`, mặc định 2.5M/ngày): X/blog luôn dùng model
  này; video dùng khi `gpt-5.4` đã hết quota.
- `gpt-5.4` (`OPENAI_FULL_*`, mặc định 250k/ngày): video thử model này trước
  để có chất lượng kiểm chứng cao hơn.

Phân tích video dùng Agents SDK (`@openai/agents`) với công cụ `web_search` để
kiểm chứng từng tuyên bố bằng nguồn uy tín. Khi phân tích video, hệ thống thử
`gpt-5.4` trước, hết quota an toàn trong ngày thì tự chuyển sang
`gpt-5.4-mini`; hết cả hai thì báo lỗi. Cả hai model dùng chung bảng
`ai_daily_usage`, mỗi model một dòng riêng nên không cần thêm migration.

`VIDEO_MAX_DURATION_SECONDS` (mặc định 1200 = 20 phút) chặn video quá dài để
tránh tải/transcribe/phân tích quá lâu trong một request. `WHISPER_MODEL_SIZE`
càng lớn (`small` -> `medium` -> `large-v3`) thì transcript càng chính xác
nhưng càng chậm trên CPU; `int8` compute type phù hợp cho CPU thông thường.

Route `/api/analyze` đặt `maxDuration = 300` cho nhánh video. `next dev`/
`next start` không bị giới hạn này; trên Vercel, video dài hoặc nhiều tuyên bố
cần kiểm chứng có thể cần Fluid Compute hoặc plan cao hơn để chạy hết trong
một function.

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
- **Phân tích video hiện chưa chạy được trên Vercel serverless function tiêu
  chuẩn**: pipeline cần `yt-dlp`, `ffmpeg` và một Python venv có `faster-whisper`
  cài sẵn trên host, còn Vercel Node function không có các binary/venv này và
  filesystem chỉ ghi được vào `/tmp`. Pipeline này được viết để chạy trên máy
  tự host/VM có sẵn `yt-dlp`/`ffmpeg`/Python (ví dụ máy dev local hiện tại).
  Muốn chạy trên Vercel cần đóng gói lại (ví dụ container riêng, hoặc gọi ra
  một service transcribe/download bên ngoài) — chưa nằm trong phạm vi thay
  đổi này.

## Privacy & data

- Tính năng phân tích (form, `/api/analyze`, `/api/quota`, danh sách "hôm
  nay") yêu cầu đăng nhập Google và chỉ mở cho các email trong
  `ALLOWED_EMAIL`. Trang chia sẻ (`/ten-bai-viet-<id>`) vẫn công khai, không
  cần đăng nhập.
- Người dùng chỉ nên dán link X/Twitter, blog hoặc video YouTube/TikTok/
  Facebook Reel công khai. Không dán nội dung riêng tư, nội bộ hoặc cần bảo mật.
- Nội dung nguồn công khai, replies/link liên quan và bài tóm tắt được gửi tới
  OpenAI để phân tích.
- Với video: app tải tạm video/audio về thư mục temp của hệ điều hành, xoá
  ngay sau khi transcribe xong (thành công hoặc lỗi). Bản transcript, tiêu đề,
  mô tả video được gửi tới OpenAI (Agents SDK) để tóm tắt và kiểm chứng; các
  truy vấn kiểm chứng còn được gửi qua công cụ `web_search` do OpenAI vận hành
  để tìm nguồn công khai.
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

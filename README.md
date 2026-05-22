# Quiz Image Server (thay Templated.io)

Endpoint Node + Puppeteer dựng ảnh quiz 1000x1000 cho KISS English Facebook. Thay thế module Templated trong scenario Make.com hiện tại.

## API

**POST `/render`**

```json
{
  "question": "If you want to stay healthy, you ___ eat more vegetables every day.",
  "answer_a": "should",
  "answer_b": "might",
  "background_url": "https://images.unsplash.com/photo-..."
}
```

Trả về:

```json
{
  "image_url": "https://your-app.onrender.com/i/abc123.png",
  "id": "abc123",
  "width": 1000,
  "height": 1000
}
```

File ảnh public 1 giờ tại `GET /i/<filename>`, sau đó tự xoá.

## Chạy local (test trước khi deploy)

```bash
cd quiz-image-server
docker build -t quiz-image-server .
docker run -p 3000:3000 quiz-image-server
```

Test:

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "question": "I ___ to school every day.",
    "answer_a": "go",
    "answer_b": "goes",
    "background_url": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b"
  }'
```

Mở `image_url` trong trình duyệt để xem ảnh.

## Deploy lên Render free tier

### B1. Push code lên GitHub

```bash
cd quiz-image-server
git init
git add .
git commit -m "init quiz image server"
gh repo create kiss-english-quiz-image --public --source=. --remote=origin --push
```

(Hoặc tạo repo thủ công trên github.com rồi `git push`.)

### B2. Tạo Web Service trên Render

1. Đăng nhập <https://dashboard.render.com>
2. **New +** → **Web Service**
3. Connect repo `kiss-english-quiz-image`
4. Cấu hình:
   - **Name:** `kiss-quiz-image` (URL sẽ là `https://kiss-quiz-image.onrender.com`)
   - **Region:** Singapore (gần Việt Nam nhất)
   - **Branch:** `main`
   - **Runtime:** **Docker** (Render tự detect Dockerfile)
   - **Instance Type:** **Free**
5. Nhấn **Create Web Service**, chờ build ~5-8 phút (lần đầu lâu vì pull Chromium)

### B3. Kiểm tra

Khi status chuyển **Live**, mở:

```
https://kiss-quiz-image.onrender.com/health
```

Phải thấy `{"ok": true}`. Test render bằng `curl` như mục local ở trên.

## Lưu ý về Render free tier

- **Spin down sau 15 phút không có request** → request đầu tiên sau khi ngủ mất ~30-50 giây để khởi động lại (Make scenario có thể timeout). Workaround:
  - Dùng UptimeRobot ping `/health` mỗi 10 phút để giữ instance thức
  - Hoặc upgrade lên Render Starter ($7/tháng) — không spin down
- **512 MB RAM** vừa đủ cho 1 Puppeteer page tại 1 thời điểm. Scenario chạy 3 lần/ngày → ổn.
- **Disk /tmp** ephemeral — restart là mất, nhưng Facebook đã fetch ảnh trong vòng 5-10 giây sau khi render → không vấn đề.

## Cấu trúc file

```
quiz-image-server/
├── Dockerfile          # Chromium + Node 20
├── package.json
├── server.js           # Express + Puppeteer
├── template.html       # Layout HTML/CSS 1000x1000
├── assets/
│   ├── README.md
│   └── logo.png        # (optional) avatar KISS English
├── .dockerignore
├── .gitignore
└── README.md
```

## Tinh chỉnh layout

Sửa `template.html` (CSS cuối file `<style>`):

- Toạ độ box: `top`, `left`, `right`, `width`, `height`
- Font: `font-family`, `font-size`, `font-weight`
- Màu chữ: `color: #1F2A5C` (xanh navy KISS English) — đổi tuỳ ý
- Padding text trong box: `padding: 28px 40px`

Sau khi sửa, push lại GitHub → Render auto redeploy ~2 phút.

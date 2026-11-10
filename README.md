# VIETINBANK GOLD TRACKER

Website theo dõi bảng giá **VietinBank Gold & Jewellery**. Frontend tĩnh (HTML/CSS/JS), API chạy trên Cloudflare Workers và lịch sử lưu bằng Cloudflare D1.

## Thành phần

- `index.html`, `styles.css`, `app.js`: giao diện tiếng Việt, bảng giá, biểu đồ, lịch sử và máy tính giá.
- `worker/index.js`: API đọc nguồn VietinGold, xác thực dữ liệu, lưu snapshot giá thay đổi và cung cấp `/api/prices`.
- `worker/schema.sql`: schema D1.
- `wrangler.toml`: cấu hình Worker + Cron mỗi phút.
- PWA: `manifest.webmanifest`, `sw.js`, biểu tượng SVG.

## Nguồn dữ liệu

Nguồn duy nhất được cấu hình là:

- https://vangbac.vietinbankgold.vn/
- https://vietinbankgold.vn/

Worker mặc định đọc website bảng giá và thử nhận diện dữ liệu JSON có cấu trúc hoặc bảng HTML. Website nguồn có thể thay đổi cấu trúc hoặc tải dữ liệu động qua API. Nếu không trích xuất được giá hợp lệ, API trả lỗi rõ ràng và **không sinh giá giả**.

Nếu cần dùng endpoint JSON chính thức đã xác minh, đặt biến Worker `SOURCE_API_URL` thành endpoint đó. Adapter JSON nhận các trường tên sản phẩm và giá mua/bán phổ biến (name/productName/tenSanPham, buy/buyPrice/giaMua, sell/sellPrice/giaBan). Nếu API có schema riêng, cập nhật `normalizeProduct()` trong `worker/index.js` theo payload thực tế. Không đoán endpoint hoặc schema.

## Triển khai frontend lên Cloudflare Pages

1. Push repo lên GitHub.
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Chọn repo `khahdihdz/vbtracker`, branch `main`.
4. Framework preset: None.
5. Build command: để trống.
6. Build output directory: `/` (thư mục gốc repo).
7. Deploy.

Frontend hiện để `window.VBTRACKER_API = ""` trong `config.js`. Sau khi deploy Worker, thay giá trị thành URL Worker, ví dụ `https://vbtracker-api.<subdomain>.workers.dev`, rồi commit lại.

## Triển khai API Worker + D1

Cần cài Node.js và Wrangler:

```bash
npm install -g wrangler
wrangler login
```

Tạo D1:

```bash
wrangler d1 create vbtracker-history
```

Sao chép `database_id` được Cloudflare trả về vào `wrangler.toml`, thay giá trị `REPLACE_WITH_D1_DATABASE_ID`.

Khởi tạo schema:

```bash
wrangler d1 execute vbtracker-history --remote --file=worker/schema.sql
```

Đặt token bảo vệ endpoint đồng bộ thủ công:

```bash
wrangler secret put ADMIN_TOKEN
```

Nếu đã xác minh endpoint JSON chính thức, cấu hình `SOURCE_API_URL` trong Worker Variables. Không đặt token trong frontend.

Deploy Worker:

```bash
wrangler deploy
```

Cron trigger đã cấu hình mỗi phút. Cron là chu kỳ kiểm tra nguồn, không có nghĩa VietinGold thay đổi giá mỗi phút.

## API

- `GET /api/health`: kiểm tra Worker.
- `GET /api/prices`: sản phẩm mới nhất + lịch sử snapshot.
- `POST /api/sync`: đồng bộ thủ công, yêu cầu header `Authorization: Bearer <ADMIN_TOKEN>`.

Ví dụ kiểm tra:

```bash
curl https://YOUR-WORKER.workers.dev/api/health
curl https://YOUR-WORKER.workers.dev/api/prices
```

## Lưu ý vận hành và độ chính xác

- Dữ liệu chỉ được coi là trực tiếp khi lấy thành công từ nguồn VietinGold.
- Worker lưu snapshot khi giá mua hoặc bán thay đổi, tránh ghi trùng theo sản phẩm và thời điểm.
- Nếu nguồn lỗi hoặc HTML thay đổi, dashboard hiển thị cảnh báo và giữ nguyên thời gian cập nhật cuối.
- Chu kỳ cron 1 phút có thể bị giới hạn bởi quota Cloudflare hoặc chính sách nguồn. Tôn trọng rate limit của VietinGold.
- Bản ghi lịch sử chỉ bắt đầu từ lúc hệ thống được triển khai; không có lịch sử trước đó nếu chưa thu thập.
- Website là công cụ theo dõi tham khảo, không đại diện VietinBank và không thực hiện giao dịch vàng.

## Kiểm thử

GitHub Actions kiểm tra cú pháp JavaScript. Sau khi deploy, cần kiểm tra endpoint API và đối chiếu thủ công từng sản phẩm/giá với website VietinGold trước khi công bố website hoạt động chính thức.
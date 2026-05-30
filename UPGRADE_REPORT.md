# BÁO CÁO NÂNG CẤP TOÀN DIỆN — KG-CASHIER

## 1. Danh sách file đã sửa đổi
- **`src/config/env.js`**: Thống nhất canonical URL, chuẩn hóa biến môi trường `VITE_GAS_WEBAPP_URL` và `VITE_GAS_URL` hỗ trợ tương thích ngược.
- **`src/api.js`**: Chặn tất cả request ghi dữ liệu từ các URL không phải canonical (ở chế độ production) sang Google Apps Script; thêm mock POS order cho sandbox mode.
- **`src/utils.js`**: Tích hợp hàm băm bảo mật mật khẩu `sha256(ascii)`.
- **`src/views/pos.js`**: Tích hợp luồng đồng bộ cloud tự động cho các order active và completed qua GAS, thêm 10s sync polling loop, lưu vết order thay đổi trạng thái khi chuyển bàn, ghép bàn, và thanh toán.
- **`functions/cukcuk-api/[[path]].js`**: Tối ưu hóa xử lý CORS và chặn các yêu cầu ngoài canonical domain khi chạy trên Cloudflare Pages.
- **`index.html`, `staff.html`, `vat.html`**: Nhúng mã bảo vệ canonical URL cứng ở đầu trang, tự động redirect mọi host alias và preview về trang chính.
- **`gas/cashier_backend.gs`**: Thêm schema tự động khởi tạo bảng `KG_POS_ORDERS` và tích hợp `LockService` tránh ghi đè dữ liệu.

---

## 2. Các lỗi đã phát hiện & Cách xử lý (P0)

### Lỗi 1: Ghi dữ liệu từ nhiều URL Alias / Preview
- **Phát hiện**: Các domain preview hoặc alias của Cloudflare Pages vẫn gửi request ghi đè lên Google Sheets thật.
- **Giải quyết**: Thêm đoạn script kiểm tra host ở đầu mỗi file HTML (`index.html`, `staff.html`, `vat.html`), thực hiện redirect 301 client-side về `https://kg-cashier.pages.dev/`. Đồng thời ở `api.js` chặn ghi từ host lạ nếu `window.location.hostname` không khớp canonical.

### Lỗi 2: Không đồng bộ POS Order giữa các thiết bị
- **Phát hiện**: Dữ liệu bàn/order chỉ lưu ở localStorage trên từng máy, khiến phục vụ (staff app) và thu ngân (cashier app) lệch thông tin.
- **Giải quyết**: 
  - Khai báo bảng `KG_POS_ORDERS` trên cloud.
  - Xây dựng cơ chế sync hai chiều tự động trong `pos.js` với tần suất 10 giây/lần.
  - Khi bàn bị xoá/thanh toán/ghép bàn, trạng thái được đẩy vào danh sách `kg-pos-completed-syncs` trước khi xoá ở local để cloud cập nhật chính xác.

### Lỗi 3: Nguy cơ bảo mật mật khẩu / PIN
- **Phát hiện**: PIN quản trị mặc định và mật khẩu nhân viên được truyền/lưu plain text.
- **Giải quyết**: Tích hợp thư viện SHA-256 thuần trong `utils.js` to hash PIN/password before sending/storing.

---

## 3. Cấu trúc Schema mới (`KG_POS_ORDERS`)
Bảng dữ liệu trên Google Sheets được tự động tạo với các cột:
1. `orderId` (Khóa chính)
2. `tableId`
3. `tableName`
4. `status` ('active' | 'completed')
5. `itemsJson` (Danh sách món ăn)
6. `total` (Tổng tiền)
7. `createdAt`
8. `updatedAt`
9. `createdBy`
10. `updatedBy`
11. `deviceId`
12. `sessionId`
13. `revision` (Tránh ghi đè đè dữ liệu cũ)
14. `lastMutationId` (Chống trùng lặp dữ liệu)

---

## 4. Biến môi trường cấu hình (Environment Variables)
- **`VITE_GAS_WEBAPP_URL`** (hoặc **`VITE_GAS_URL`**): URL Web App của Google Apps Script.
- **`VITE_CUKCUK_PROXY_URL`**: Trỏ về `/cukcuk-api` (mặc định) để proxy an toàn.

---

## 5. Hướng dẫn Build & Deploy
Chạy lệnh sau tại thư mục gốc của dự án:
```bash
# Cài đặt thư viện
npm install

# Build ứng dụng cho môi trường production
npm run build

# Deploy trực tiếp lên Cloudflare Pages
npm run deploy
```

---

## 6. Checklist Nghiệm thu (Verification Checklist)
- [x] Truy cập alias (ví dụ: preview URL) tự động chuyển hướng về `https://kg-cashier.pages.dev/`.
- [x] Mở ca hoạt động bình thường, ghi nhận đầy đủ log hoạt động trên cloud.
- [x] Tạo order bàn bất kỳ trên Staff App (`staff.html`), sau 10s dữ liệu tự đồng bộ và hiển thị trên Cashier App (`index.html`).
- [x] Thực hiện chuyển bàn / ghép bàn / thanh toán: các hành động đều cập nhật trạng thái bàn trên cloud.
- [x] Quét dọn mã nguồn không còn các chuỗi tiếng Việt bị lỗi hiển thị (mojibake).

# Hướng dẫn Triển khai Sản xuất (1 URL Duy nhất)

Tài liệu này hướng dẫn quy trình phát triển, cấu hình và triển khai dự án **KG-Cashier** đảm bảo toàn bộ hệ thống chỉ phục vụ và đồng bộ trên một địa chỉ chính thức duy nhất.

---

## 1. Địa chỉ Canonical Chính thức

- **URL Production Duy nhất:** `https://kg-cashier.pages.dev/`
- **Các alias cũ/phụ cần loại bỏ:**
  - `http://main.kg-cashier.pages.dev/`
  - `https://main.kg-cashier.pages.dev/`

*Hệ thống đã được thiết lập mã chuyển hướng tự động (canonical redirects) ở các tệp tin HTML chính (`index.html`, `staff.html`, `vat.html`) nhằm tự động chuyển hướng người dùng về URL chính nếu họ truy cập qua alias.*

---

## 2. Các Biến Môi trường Sản xuất (Production Env)

Khi triển khai lên Cloudflare Pages, hãy đảm bảo cấu hình các biến môi trường tại trang quản trị dự án (Settings -> Environment Variables) khớp chính xác với danh sách sau:

```env
VITE_APP_ENV=production
VITE_APP_BASE_URL=https://kg-cashier.pages.dev
VITE_CANONICAL_URL=https://kg-cashier.pages.dev
VITE_API_BASE_URL=https://kg-cashier.pages.dev
VITE_CUKCUK_PROXY_URL=https://kg-cashier.pages.dev/cukcuk-api
VITE_GAS_URL=https://script.google.com/macros/s/AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y/exec
```

*Không sử dụng bất kỳ liên kết alias hay localhost nào trong các cấu hình production.*

---

## 3. Quy trình Triển khai Frontend (Cloudflare Pages)

Dự án được cấu hình tự động triển khai (Auto Deploy) từ GitHub khi có thay đổi trên nhánh `main`.

### Các bước đẩy mã nguồn lên GitHub:
1. Kiểm tra trạng thái mã nguồn cục bộ:
   ```bash
   git status
   ```
2. Thêm toàn bộ các thay đổi:
   ```bash
   git add .
   ```
3. Commit với thông điệp rõ ràng:
   ```bash
   git commit -m "chore: deploy KG-Cashier production update - single URL"
   ```
4. Đẩy mã nguồn lên nhánh chính:
   ```bash
   git push origin main
   ```
5. Truy cập Cloudflare Pages Dashboard để giám sát tiến trình xây dựng (Build Process). Trình biên dịch sẽ tự động chạy lệnh `npm run build` và phân phối sản phẩm mới lên `https://kg-cashier.pages.dev/` trong vòng 1-2 phút.

---

## 4. Quy trình Triển khai Backend (Google Apps Script)

Để không làm thay đổi URL Web App của Google Apps Script (GAS), chúng ta phải luôn luôn cập nhật đè lên **Deployment ID hiện tại** thay vì tạo phiên bản deployment mới.

- **Deployment ID hiện tại:** `AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y`

### Các bước cập nhật code GAS:
1. Di chuyển vào thư mục code backend:
   ```bash
   cd gas/clasp-deploy
   ```
2. Đồng bộ mã nguồn từ cục bộ lên Google Apps Script Cloud:
   ```bash
   npx @google/clasp push -f
   ```
3. Đẩy bản phát hành cập nhật đè lên ID cũ:
   ```bash
   npx @google/clasp deploy -i AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y -d "KG-Cashier production update"
   ```

---

## 5. Quy trình Kiểm thử & Nghiệm thu (Checklist)

Sau khi hoàn tất quá trình triển khai, hãy thực hiện kiểm tra các đầu việc sau:

- [ ] **Xác nhận phiên bản:** Truy cập `https://kg-cashier.pages.dev/`, mở Developer Tools (F12) -> Console, đảm bảo không có lỗi biên dịch.
- [ ] **Mã chuyển hướng hoạt động:** Truy cập thử `https://main.kg-cashier.pages.dev/` và xác nhận trình duyệt tự động redirect sang `https://kg-cashier.pages.dev/`.
- [ ] **Chặn ghi dữ liệu từ nguồn phụ:** Thử chạy ứng dụng từ localhost (không bật chế độ sandbox) hoặc từ một địa chỉ xem trước (Preview URL), thực hiện mở ca hoặc thêm giao dịch. Hệ thống phải chặn và báo lỗi tiếng Việt: *“Cấu hình production không hợp lệ...”*
- [ ] **Đường truyền MISA CUKCUK:** Bấm nút **Kiểm tra kết nối** tại trang Cài đặt để đảm bảo proxy `/cukcuk-api` hoạt động tốt.
- [ ] **Đồng bộ hóa Sheets:** Thực hiện kiểm tra đồng bộ giao dịch và ca làm việc đảm bảo dữ liệu ghi nhận chính xác về Google Sheets liên kết.

---

## 6. Phương án Rollback khi gặp lỗi

Nếu phiên bản mới phát sinh lỗi nghiêm trọng ảnh hưởng đến vận hành nhà hàng:
1. Truy cập vào trang điều khiển **Cloudflare Pages** -> Dự án `kg-cashier`.
2. Chọn danh sách các bản deploy trước đó (**Deployments**).
3. Tìm bản deploy hoạt động ổn định gần nhất, chọn menu ba chấm và nhấn **Rollback to this deployment** (hoặc kích hoạt chế độ khóa phiên bản cũ).
4. Đối với code backend GAS, bạn có thể hoàn tác mã nguồn trên Git (`git revert`) và chạy lại lệnh `clasp push` để trả lại logic ổn định.

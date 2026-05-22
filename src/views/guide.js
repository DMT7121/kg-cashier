export function render() {
  return `
    <div class="max-w-4xl mx-auto pb-12">
      <!-- Header -->
      <div class="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-8 md:p-12 shadow-lg mb-8 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div class="relative z-10 text-white">
          <div class="inline-flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mb-4 backdrop-blur-sm">
            <span class="material-symbols-rounded text-[18px]">menu_book</span>
            Tài liệu hướng dẫn
          </div>
          <h1 class="text-3xl md:text-4xl font-black mb-3 tracking-tight">Hướng dẫn sử dụng KG-Cashier</h1>
          <p class="text-indigo-100 text-lg max-w-2xl">Khám phá chi tiết toàn bộ các tính năng, module và luồng vận hành chuyên nghiệp của hệ thống quản lý thu ngân KG-Cashier.</p>
        </div>
      </div>

      <!-- TOC -->
      <div class="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span class="material-symbols-rounded text-indigo-500">format_list_bulleted</span>
          Danh mục hướng dẫn
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 text-sm font-medium">
          <a href="#guide-shift" class="text-slate-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 1. Quản lý Ca làm việc</a>
          <a href="#guide-pos" class="text-slate-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 2. Bán hàng (POS) & Bếp</a>
          <a href="#guide-transaction" class="text-slate-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 3. Thu Chi & Hóa Đơn</a>
          <a href="#guide-report" class="text-slate-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 4. Báo cáo & Lịch sử</a>
          <a href="#guide-vat" class="text-slate-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 5. Hóa đơn điện tử (VAT)</a>
          <a href="#guide-extension" class="text-slate-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"><span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 6. Tiện ích & Thiết lập</a>
        </div>
      </div>

      <!-- Content Sections -->
      <div class="space-y-8">

        <!-- 1. Quản lý Ca -->
        <section id="guide-shift" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="bg-slate-50 border-b border-slate-200 p-6 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-rounded text-2xl">work_history</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-800">1. Quản lý Ca làm việc</h2>
              <p class="text-slate-500 text-sm">Luồng mở/đóng ca bảo mật và kiểm kê tiền mạch lạc.</p>
            </div>
          </div>
          <div class="p-6 md:p-8 space-y-6 text-slate-600">
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🟢 Mở Ca Mới</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Truy cập <b class="text-slate-700">Quản lý ca</b>. Nếu chưa có ca nào, hệ thống sẽ hiển thị màn hình <b>Mở ca nhanh</b>.</li>
                <li>Chọn nhân viên đang trực, xác nhận <b>Mã PIN cá nhân</b> (nếu có).</li>
                <li>Hệ thống tự động đề xuất <b>Số ca</b> theo giờ (Ca 1: sáng, Ca 2: chiều, Ca 3: tối).</li>
                <li>Nhập <b>Tiền đầu ca</b> (tiền lẻ có sẵn trong két để thối khách). Tính năng nhập tiền có hỗ trợ phép tính tự động (VD: gõ <code class="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600">500.000 + 200.000</code>).</li>
                <li>Bắt buộc nhập <b>Mật khẩu ca</b>. Đây là mật khẩu dùng để mở khóa màn hình nếu bạn truy cập ứng dụng từ thiết bị khác trong lúc ca đang diễn ra.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🔒 Xác thực & Cưỡng chế</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Nếu F5 hoặc chuyển thiết bị, bạn cần nhập lại <b>Mật khẩu ca</b> để tiếp tục bán hàng, chống người lạ xâm nhập.</li>
                <li>Trong trường hợp quên mật khẩu ca hoặc ca bị treo, Quản lý có thể dùng tính năng <b>Đóng ca cưỡng chế</b> (yêu cầu mật khẩu Admin) để dọn dẹp hệ thống.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🔴 Đóng Ca & Bàn Giao</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Trước khi đóng ca, bạn nên vào <b>Kiểm kê tiền</b> để đếm tiền thực tế trong két theo từng mệnh giá (Tiền ghim, Tiền giữ lại, Tiền bàn giao).</li>
                <li>Nhấn nút <b>Đóng ca</b>, nhập ghi chú (nếu có) và xác nhận số tiền nộp/giữ lại. Ca sẽ được lưu vào <b>Lịch sử ca</b> và đồng bộ lên Cloud.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 2. Bán hàng & Bếp -->
        <section id="guide-pos" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="bg-slate-50 border-b border-slate-200 p-6 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-rounded text-2xl">point_of_sale</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-800">2. Bán hàng (POS) & Bếp</h2>
              <p class="text-slate-500 text-sm">Quản lý sơ đồ bàn, order món và kết nối trực tiếp với nhà bếp.</p>
            </div>
          </div>
          <div class="p-6 md:p-8 space-y-6 text-slate-600">
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🛒 Sơ Đồ Bàn (POS)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Bao gồm 5 khu vực (A, B, C, D, E). Bàn có khách sẽ đổi màu (mặc định màu xanh dương).</li>
                <li>Bấm vào một bàn để mở giỏ hàng. Bạn có thể thêm món từ Danh mục, tìm kiếm nhanh hoặc gõ trực tiếp nếu thuộc mã món.</li>
                <li>Các thao tác trên bàn: <b>Đổi bàn</b>, <b>Gộp bàn</b>, <b>In Tạm tính</b>, <b>Yêu cầu thanh toán</b>.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">👩‍🍳 Gửi Bếp & Trạng Thái Món</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Sau khi order, nhấn <b>Gửi bếp</b>. Hệ thống tự động phân loại món ăn đẩy sang <b>Dashboard Bếp</b> hoặc <b>Quầy Bar</b> tùy theo cài đặt của món đó.</li>
                <li>Trạng thái món: Chờ chế biến ➔ Đang nấu ➔ Xong. Thu ngân sẽ nhận được thông báo realtime khi Bếp báo "Xong".</li>
                <li>Khi xóa một món đã gửi bếp, Bếp sẽ nhận được cảnh báo <b>Hủy món</b> màu đỏ chót.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">💳 Thanh Toán</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Nhấn <b>Thanh toán</b>, chọn hình thức: Tiền mặt, Thẻ, hoặc Chuyển khoản. Hỗ trợ thanh toán một bill bằng <b>nhiều hình thức kết hợp</b> (VD: 50% tiền mặt, 50% chuyển khoản).</li>
                <li>Kết nối trực tiếp mã VietQR động tự hiển thị số tiền và nội dung chuyển khoản để khách quét.</li>
                <li>Sau khi thanh toán, hóa đơn tự động chốt, sinh số Bill và chuyển sang mục Lịch sử Hóa đơn. Bàn sẽ được làm trống.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 3. Thu Chi & Hóa đơn -->
        <section id="guide-transaction" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="bg-slate-50 border-b border-slate-200 p-6 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-rounded text-2xl">receipt_long</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-800">3. Quản lý Thu/Chi & Hóa Đơn</h2>
              <p class="text-slate-500 text-sm">Ghi nhận chi phí phát sinh và kiểm soát hóa đơn.</p>
            </div>
          </div>
          <div class="p-6 md:p-8 space-y-6 text-slate-600">
            <div>
              <h4 class="font-bold text-slate-800 mb-2">💸 Thu / Chi Khác</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Tại tab <b>Giao dịch</b>, bạn có thể tạo Phiếu Chi (tiền điện, mua gas, đi chợ,...) hoặc Phiếu Thu (thu ngoài POS, tiền Tip,...).</li>
                <li>Hệ thống lưu trữ độc lập với doanh thu bán hàng POS. Tiền chi sẽ được tự động cấn trừ vào <b>Kỳ vọng Tiền Mặt</b> cuối ca.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🧾 Hóa đơn Bán hàng (POS / CUKCUK)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Tab <b>Hóa đơn CUKCUK/POS</b> liệt kê toàn bộ các bill đã thanh toán.</li>
                <li>Tại đây bạn có thể xem lại chi tiết từng bill, In lại bill, hoặc nếu là ca đang mở, bạn có thể <b>Sửa hình thức thanh toán</b> (nếu lỡ bấm nhầm Tiền mặt thành Thẻ).</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 4. Báo cáo & Lịch sử -->
        <section id="guide-report" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="bg-slate-50 border-b border-slate-200 p-6 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-rounded text-2xl">analytics</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-800">4. Báo Cáo Doanh Thu & Lịch Sử</h2>
              <p class="text-slate-500 text-sm">Báo cáo tổng kết ngày và tra cứu các ca làm việc trong quá khứ.</p>
            </div>
          </div>
          <div class="p-6 md:p-8 space-y-6 text-slate-600">
            <div>
              <h4 class="font-bold text-slate-800 mb-2">📊 Báo cáo ngày (Doanh thu & Phân tích)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Cung cấp báo cáo gom tổng toàn bộ các ca trong một ngày làm việc (mặc định lấy từ 12h00 trưa nay đến 06h00 sáng hôm sau).</li>
                <li><b>Trang Phân tích:</b> Biểu đồ so sánh doanh thu các ngày trong tuần, Top món bán chạy (khi được cấu hình dữ liệu món).</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🕒 Lịch sử ca (Sửa quá khứ)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Hiển thị danh sách các ca đã Đóng. Bấm vào icon "Con mắt" để xem <b>Báo cáo bàn giao</b> của riêng ca đó.</li>
                <li><b>Sửa lịch sử (Edit-in-place):</b> Trong Báo cáo bàn giao quá khứ, bạn có thể bấm vào icon cây bút ✏️ để sửa lại tiền đầu ca, thêm/sửa/xóa phiếu chi, hoặc sửa hình thức thanh toán của bill cũ. <i>(Lưu ý: Mọi chỉnh sửa quá khứ sẽ hiển thị dòng "Đã điều chỉnh" trên bản in).</i></li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 5. Hóa đơn điện tử VAT -->
        <section id="guide-vat" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="bg-slate-50 border-b border-slate-200 p-6 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-rounded text-2xl">receipt</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-800">5. Tích hợp Hóa đơn VAT (Trí tuệ nhân tạo)</h2>
              <p class="text-slate-500 text-sm">Xuất hóa đơn điện tử tự động đọc thông tin công ty.</p>
            </div>
          </div>
          <div class="p-6 md:p-8 space-y-6 text-slate-600">
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🤖 Bóc tách Mã Số Thuế thông minh</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Sử dụng trí tuệ nhân tạo (Gemini, Groq, Mistral,...) để nhận diện hình ảnh/văn bản khách hàng gửi.</li>
                <li>Hệ thống tự động trích xuất: Mã số thuế, Tên doanh nghiệp, Địa chỉ, Email và điền sẵn vào Form xuất VAT mà bạn không cần gõ tay.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">⚙️ Cấu hình API Key</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Để sử dụng AI, bạn cần nhập API Key trong mục "Cài đặt khóa API". Nhập khóa vào ô (1 khóa mỗi dòng).</li>
                <li>Hệ thống có chế độ Tự Động Fail-over: Nếu khóa API số 1 hết hạn, nó sẽ tự động thử khóa số 2, giúp quá trình xuất hóa đơn không bị gián đoạn.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 6. Tiện ích -->
        <section id="guide-extension" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="bg-slate-50 border-b border-slate-200 p-6 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-rounded text-2xl">extension</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-800">6. Tiện ích & Thiết lập Hệ thống</h2>
              <p class="text-slate-500 text-sm">Công cụ hỗ trợ thu ngân và quản lý ứng dụng.</p>
            </div>
          </div>
          <div class="p-6 md:p-8 space-y-6 text-slate-600">
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🧮 Tiện ích (Extension)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li><b>Máy tính thuế:</b> Nhập một số tiền để tính tự động 8% hoặc 10% thuế (thuận, ngược). Đọc số tiền thành chữ tiếng Việt chuẩn xác (Hữu ích khi viết hóa đơn tay).</li>
                <li><b>Tạo mã VietQR:</b> Chọn ngân hàng (hỗ trợ 50+ ngân hàng), nhập STK, Số tiền và Tên chủ thẻ để gen nhanh mã QR. Hệ thống lưu lại tự động 10 mẫu QR gần nhất.</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🖨️ Cài đặt Layout Báo cáo (In ấn)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Vào Cài đặt ➔ <b>Mẫu in & Báo cáo</b>.</li>
                <li>Bạn có thể bật/tắt (Toggle) hiển thị từng phần của Báo cáo bàn giao (VD: ẩn "Tổng doanh thu", ẩn "Phiếu chi").</li>
                <li>Kéo thả (Drag & Drop) để sắp xếp lại thứ tự hiển thị của các khối báo cáo. Mẫu báo cáo tối ưu hiển thị cho giấy A4 dạng lưới ngói (Masonry).</li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-slate-800 mb-2">🔐 Bảo mật & Đồng bộ (Cloud Sync)</h4>
              <ul class="list-disc pl-5 space-y-1.5">
                <li>Hệ thống <b>Offline-First</b>: Mọi dữ liệu (hóa đơn, ca) đều lưu trên trình duyệt, không sợ mất mạng.</li>
                <li><b>Tự động đồng bộ</b>: Hệ thống sẽ tự gửi dữ liệu lên Google Sheets chạy ngầm, không làm gián đoạn thu ngân. Nếu rớt mạng, các thay đổi sẽ được đưa vào <i>Hàng đợi (Queue)</i> và tải lên ngay khi có mạng trở lại.</li>
                <li><b>Mật khẩu Admin</b>: Ngăn chặn nhân viên truy cập Cài đặt hệ thống, xóa ca hoặc cấu hình lại webhook.</li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </div>
  `;
}

export function init() {
  // Smooth scroll
  document.querySelectorAll('a[href^="#guide-"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        // Find scroll container
        const container = document.getElementById('viewContainer');
        if (container) {
          const offsetTop = targetEl.offsetTop - 20; // 20px padding
          container.scrollTo({ top: offsetTop, behavior: 'smooth' });
        }
      }
    });
  });
}

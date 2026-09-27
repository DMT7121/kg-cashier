<script setup lang="ts">
import { ref } from 'vue';

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
</script>

<template>
  <div class="view-content p-4 md:p-6 max-w-5xl mx-auto pb-16 space-y-8 animate-fade-in">
    
    <!-- Header Hero Card -->
    <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950/80 rounded-3xl p-6 md:p-10 shadow-lg border border-slate-800 relative overflow-hidden text-white">
      <div class="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
      <div class="relative z-10">
        <div class="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-xs font-bold mb-4 backdrop-blur-sm">
          <span class="material-symbols-rounded text-base">menu_book</span>
          Tài liệu chuẩn vận hành King's Grill
        </div>
        <h1 class="text-2xl md:text-3xl lg:text-4xl font-black mb-3 tracking-tight text-white">Cẩm Nang Vận Hành KG-Cashier</h1>
        <p class="text-slate-300 text-xs md:text-sm max-w-2xl leading-relaxed">
          Tài liệu hướng dẫn thao tác chi tiết dành cho Thu ngân, Phục vụ và Quản lý nhà hàng KING's GRILL. Tối ưu quy trình chốt ca, đồng bộ CUKCUK và bảo toàn tài chính.
        </p>
      </div>
    </div>

    <!-- Table of Contents -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-xs">
      <h3 class="font-extrabold text-sm text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        <span class="material-symbols-rounded text-emerald-500">format_list_bulleted</span>
        Danh mục nghiệp vụ
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3.5 gap-x-6 text-xs font-bold">
        <button @click="scrollToSection('guide-shift')" class="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-all border-0 bg-transparent text-left cursor-pointer">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span> 1. Quản lý Ca làm việc
        </button>
        <button @click="scrollToSection('guide-pos')" class="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-all border-0 bg-transparent text-left cursor-pointer">
          <span class="w-2 h-2 rounded-full bg-cyan-500"></span> 2. Bán hàng (POS) & Bếp
        </button>
        <button @click="scrollToSection('guide-transaction')" class="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-all border-0 bg-transparent text-left cursor-pointer">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span> 3. Thu Chi & Chứng từ
        </button>
        <button @click="scrollToSection('guide-report')" class="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-all border-0 bg-transparent text-left cursor-pointer">
          <span class="w-2 h-2 rounded-full bg-purple-500"></span> 4. Báo cáo & Lịch sử
        </button>
        <button @click="scrollToSection('guide-vat')" class="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-all border-0 bg-transparent text-left cursor-pointer">
          <span class="w-2 h-2 rounded-full bg-rose-500"></span> 5. Hóa đơn điện tử (VAT)
        </button>
        <button @click="scrollToSection('guide-extension')" class="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-all border-0 bg-transparent text-left cursor-pointer">
          <span class="w-2 h-2 rounded-full bg-teal-500"></span> 6. Tiện ích & Thiết lập
        </button>
      </div>
    </div>

    <!-- Detailed Sections -->
    <div class="space-y-6">

      <!-- 1. Quản lý Ca -->
      <section id="guide-shift" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xs scroll-mt-6">
        <div class="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-6 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-2xl">work_history</span>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-800 dark:text-slate-100">1. Quản lý Ca làm việc</h2>
            <p class="text-slate-400 dark:text-slate-500 text-xs font-semibold">Luồng mở/đóng ca bảo mật và kiểm kê tiền mạch lạc.</p>
          </div>
        </div>
        <div class="p-6 md:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-medium">
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🟢 Mở Ca Mới</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Truy cập <b class="text-slate-700 dark:text-slate-200">Quản lý ca</b>. Nếu chưa có ca nào, hệ thống sẽ hiển thị màn hình <b>Mở ca nhanh</b>.</li>
              <li>Chọn nhân viên đang trực, xác nhận <b>Mã PIN cá nhân</b> (nếu có).</li>
              <li>Hệ thống tự động đề xuất <b>Số ca</b> theo giờ (Ca 1: sáng, Ca 2: chiều).</li>
              <li>Nhập <b>Tiền đầu ca</b> (tiền lẻ có sẵn trong két để thối khách). Tính năng nhập tiền có hỗ trợ phép tính tự động (VD: gõ <code class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400 font-bold">500.000 + 200.000</code>).</li>
              <li>Bắt buộc nhập <b>Mật khẩu ca</b>. Đây là mật khẩu dùng để mở khóa màn hình nếu bạn truy cập ứng dụng từ thiết bị khác trong lúc ca đang diễn ra.</li>
            </ul>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🔒 Khóa màn hình & Mở khóa ca</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Khi rời quầy, nhấn nút <b>Khóa màn hình</b> ở góc trên bên phải hoặc phím tắt <kbd class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-[10px]">Ctrl+L</kbd>.</li>
              <li>Nhập đúng <b>Mật khẩu ca</b> để mở khóa. Quản lý có thể nhập mã PIN quản lý để khôi phục quyền truy cập nếu thu ngân quên mật khẩu.</li>
            </ul>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🔴 Đóng Ca & Bàn Giao</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Trước khi đóng ca, vào module <b>Kiểm kê tiền mặt</b> để đếm tiền thực tế trong két theo từng mệnh giá.</li>
              <li>Xác nhận số tiền bàn giao và tiền két giữ lại. Ca sẽ được lưu vào <b>Lịch sử ca</b> và đồng bộ tức thì lên Google Sheets / Cloud.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 2. Bán hàng & Bếp -->
      <section id="guide-pos" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xs scroll-mt-6">
        <div class="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-6 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-2xl">point_of_sale</span>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-800 dark:text-slate-100">2. Bán hàng (POS) & Bếp</h2>
            <p class="text-slate-400 dark:text-slate-500 text-xs font-semibold">Quản lý sơ đồ bàn, order món và kết nối trực tiếp với nhà bếp.</p>
          </div>
        </div>
        <div class="p-6 md:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-medium">
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🛒 Sơ Đồ Bàn (POS)</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Sơ đồ 5 khu vực bàn thông minh (A, B, C, D, E). Bàn có khách hiển thị trạng thái và thời gian ngồi.</li>
              <li>Bấm vào một bàn để mở giỏ hàng. Bạn có thể thêm món từ Danh mục, tìm kiếm nhanh hoặc gõ trực tiếp mã món.</li>
              <li>Hỗ trợ các thao tác nghiệp vụ: <b>Đổi bàn</b>, <b>Gộp bàn</b>, <b>In Tạm tính K80</b>, <b>Yêu cầu thanh toán</b>.</li>
            </ul>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">👩‍🍳 Gửi Bếp / Bar Realtime</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Sau khi order món, nhấn <b>Gửi bếp</b>. Hệ thống tự động phân loại đẩy sang <b>Dashboard Bếp</b> hoặc <b>Quầy Bar</b>.</li>
              <li>Trạng thái món: Chờ chế biến ➔ Đang nấu ➔ Xong. Thu ngân nhận được thông báo âm thanh khi bếp hoàn thành.</li>
            </ul>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">💳 Thanh Toán & VietQR Napas 247</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Hỗ trợ thanh toán đa phương thức: Tiền mặt, Thẻ ngân hàng, hoặc Chuyển khoản VietQR. Hỗ trợ thanh toán kết hợp nhiều hình thức trên cùng một bill.</li>
              <li>Tự động hiển thị mã VietQR động chuẩn EMVCo tự điền số tiền và nội dung bàn, tự động trừ tiền cọc bàn.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 3. Thu Chi & Hóa đơn -->
      <section id="guide-transaction" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xs scroll-mt-6">
        <div class="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-6 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-2xl">receipt_long</span>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-800 dark:text-slate-100">3. Quản lý Thu/Chi & Chứng từ</h2>
            <p class="text-slate-400 dark:text-slate-500 text-xs font-semibold">Ghi nhận chi phí phát sinh và đính kèm biên lai mua hàng.</p>
          </div>
        </div>
        <div class="p-6 md:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-medium">
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">💸 Phiếu Thu / Chi Trong Ca</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Tạo nhanh Phiếu Chi (tiền điện, gas, mua đá, đi chợ,...) hoặc Phiếu Thu (thu ngoài POS, tip,...).</li>
              <li>Hệ thống tự động cấn trừ chi tiền mặt vào <b>Tiền mặt kỳ vọng</b> khi chốt ca.</li>
            </ul>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🧾 Chứng Từ Kèm Theo</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Hỗ trợ chụp ảnh hóa đơn/biên lai mua hàng và tải thẳng lên Google Drive quản lý từ xa.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 4. Báo cáo & Lịch sử -->
      <section id="guide-report" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xs scroll-mt-6">
        <div class="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-6 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-2xl">analytics</span>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-800 dark:text-slate-100">4. Báo Cáo Doanh Thu & Lịch Sử ca</h2>
            <p class="text-slate-400 dark:text-slate-500 text-xs font-semibold">Báo cáo tổng kết ngày và tra cứu các ca làm việc trong quá khứ.</p>
          </div>
        </div>
        <div class="p-6 md:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-medium">
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">📊 Báo Cáo Ca & Phân Tích</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Báo cáo chi tiết theo ngày, tuần, tháng, quý, năm với bộ lọc nhanh thông minh.</li>
              <li>Phân tích doanh thu theo khung giờ cao điểm, doanh thu theo bàn và món ăn bán chạy.</li>
            </ul>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🕒 Sửa Lịch Sử An Toàn (Audit Trail)</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Tra cứu lịch sử ca, xem lại chi tiết phiếu bàn giao và sửa chữa sai lệch có ghi nhận nhật ký Audit.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 5. Hóa đơn điện tử VAT -->
      <section id="guide-vat" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xs scroll-mt-6">
        <div class="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-6 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-2xl">receipt</span>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-800 dark:text-slate-100">5. Tích hợp Hóa đơn VAT (Trí tuệ nhân tạo)</h2>
            <p class="text-slate-400 dark:text-slate-500 text-xs font-semibold">Xuất hóa đơn điện tử tự động đọc thông tin công ty từ ảnh chụp.</p>
          </div>
        </div>
        <div class="p-6 md:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-medium">
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🤖 Bóc tách Mã Số Thuế thông minh</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>Sử dụng trí tuệ nhân tạo (Gemini Vision, DeepSeek, Groq, Mistral) để nhận diện hóa đơn PDF hoặc ảnh chụp.</li>
              <li>Hệ thống tự động trích xuất: Mã số thuế, Tên doanh nghiệp, Địa chỉ, Email và điền sẵn vào Form xuất VAT.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 6. Tiện ích -->
      <section id="guide-extension" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xs scroll-mt-6">
        <div class="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-6 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-2xl">extension</span>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-800 dark:text-slate-100">6. Tiện ích & Thiết lập Hệ thống</h2>
            <p class="text-slate-400 dark:text-slate-500 text-xs font-semibold">Công cụ hỗ trợ thu ngân và quản lý ứng dụng.</p>
          </div>
        </div>
        <div class="p-6 md:p-8 space-y-6 text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-medium">
          <div>
            <h4 class="font-extrabold text-slate-800 dark:text-slate-100 mb-2">🧮 Tiện ích Nghiệp Vụ</h4>
            <ul class="list-disc pl-5 space-y-1.5">
              <li><b>Máy tính thuế:</b> Tính tự động 8% hoặc 10% thuế (thuận/ngược), đọc số tiền thành chữ tiếng Việt chuẩn xác.</li>
              <li><b>Tạo mã VietQR:</b> Hỗ trợ hơn 50 ngân hàng Napas, lưu trữ 8 mẫu QR tài khoản thường dùng.</li>
              <li><b>Loa thông báo TTS:</b> Phát âm thanh gọi món và thông báo đơn hàng tự động.</li>
            </ul>
          </div>
        </div>
      </section>

    </div>

  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
</style>

const fs = require('fs');
let data = fs.readFileSync('src/store.js', 'utf8');
data = data.replace(/var defaultCategories = \{[\s\S]*?\};/m, `var defaultCategories = {
  income: ['Doanh thu bán hàng', 'Doanh thu dịch vụ', 'Thu hồi nợ', 'Thu khác'],
  expense: ['Mua nguyên liệu', 'Vận chuyển', 'Sửa chữa', 'Tiền tip/bo', 'Trả nợ', 'Chi khác']
};`);

// also fix line 493 which had Ä‘
data = data.replace(/toLocaleString\('vi-VN'\) \+ 'Ä‘'\);/g, `toLocaleString('vi-VN') + 'đ');`);

fs.writeFileSync('src/store.js', data);
console.log('Fixed store.js');

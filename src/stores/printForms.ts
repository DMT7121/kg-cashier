import { defineStore } from 'pinia';
import { ref } from 'vue';
import { printFormsDb } from '../services/db';
import { useAuditsStore } from './audits';

export interface PrintFormConfig {
  checklist: any[];
  inventory: {
    ncc: any;
    hangkho: any;
    hangrau1: any;
    hangrau: any;
  };
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  customTemplates: Record<string, string>;
}

function getInitialPrintForms(): PrintFormConfig {
  return {
    checklist: [
      { section: 'CHECKLIST PHỤC VỤ – ĐẦU CA', items: [
        { cat: 'VỆ SINH & SETUP', title: 'I. Vệ sinh & setup khu vực', list: [
          'Vệ sinh sàn & Khu vực chung: Quét và lau sạch tổng thể khu trực, cổng ra vào.',
          'Bàn ghế: Lau sạch bàn ghế, setup tiêu chuẩn (Chén/Đũa/Ly...).',
          'Chuẩn bị xô đá: Đảm bảo sạch và đủ đá.',
          'Kiểm tra Menu: Sắp xếp ngay ngắn, lau sạch bìa.'
        ]},
        { cat: 'CA 15H', title: 'II. SETUP & VỆ SINH (CA 15H)', list: [
          'Bổ sung vật tư tiêu hao: Tăm, Xiên tre, Ống hút, Bao tay, Diêm, Khăn giấy, Hộp mang về...',
          'Sắp xếp: Gọn gàng tủ đồ, bố trí các Trạm đồ dùng dự phòng.'
        ]},
        { cat: 'BÀN ĐẶT', title: 'III. Bàn đặt trước', list: [
          'Setup bàn đặt: Đúng số lượng, màu sắc, nhu cầu tiệc.',
          'Đánh dấu: Cắm khăn giấy hoặc đặt bảng "Bàn đặt trước".'
        ]},
        { cat: 'BÀN GIAO', title: 'IV. Bàn giao đầu ca', list: [
          'Nắm bắt thông tin: Khách đặt, món hết, lưu ý đặc biệt từ ca trước.'
        ]},
        { cat: 'TRONG CA', title: 'V. Kiểm tra chéo & Bổ sung (Công việc trong ca)', list: [
          'Kiểm tra vệ sinh liên tục, bổ sung đá/dụng cụ.',
          'Hỗ trợ các bàn đông khách.',
          'Kiểm tra tồn kho vật tư tiêu hao.'
        ]}
      ]},
      { section: 'CHECKLIST PHỤC VỤ – CUỐI CA', items: [
        { cat: 'XUỐNG CA', title: 'VI. Checklist Cuối ca & Xuống ca', list: [
          'Thu dọn bàn, vệ sinh gầm bàn.',
          'Tắt các thiết bị điện (Máy lạnh, Đèn sảnh...).',
          'Dọn dẹp tổng thể và khóa cửa an toàn.',
          'Bàn giao lại thông tin cho quản lý/ca sau.'
        ]}
      ]}
    ],
    inventory: {
      ncc: {
        title: 'KIỂM KÊ HÀNG HÓA – NHÀ CUNG CẤP (THỊT / HẢI SẢN)',
        subtitle: 'CÔNG TY HOÀNG TRỌNG / MM MARKET / THỦY / CẢNH',
        items: [
          {supplier:'C.THỦY\nMM MARKET', items:['Gà (con)','Sụn gà (kg)','Trứng muối','Thịt bò (kg)','Giò heo (kg)','Xương ống (kg)']},
          {supplier:'HOÀNG TRỌNG\n0947459191', items:['Chân gà (kg)','Thanh cua (kg)','Bào ngư (kg)','Ba rọi bò (kg)','Ba rọi heo (kg)','Nạc dăm (kg)','Xương ống (kg)','Sườn heo (kg)','Cánh gà (kg)','Ếch (kg)','Mực trứng (kg)']},
          {supplier:'HUYỀN MỰC\nPHƯỚC THÀNH', items:['Mực Indo (kg)','Tôm Sú size 30 (kg)','Tôm càng size 10 (kg)','Ốc hương (kg)','Mực ống (kg)']}
        ],
        rightItems: ['Khô mực','Bê','Cá chim','Bạch tuộc','Mực 1 nắng','Cá hokke','Khoai tây','Sò điệp Nhật','Nghêu','Nông heo','Bơ bánh mì','Cá diêu hồng','Trứng non','Thú Linh','Ba rọi có da','Phổi bò','Tủy bò','Pate','Khoai tây cọng','Lạp xưởng xông khói','Sò huyết','Ba rọi xông khói','Trâu gác bếp','Bắp bò','Bao tử','Da heo','Mỡ heo','Phô mai sợi']
      },
      hangkho: {
        title: 'KIỂM KÊ HÀNG HÓA – HÀNG KHÔ / GIA VỊ',
        leftItems: [
          'Bột bắp','Bột chanh','Bột chiên giòn','Bột gạo','Bột mì','Bột năng','Bột ớt HQ','Bột ớt Việt','Bột xù trắng','Bột nếp','Bột nghệ','Bột cà ri','Đường cát','Đường phèn','Đường thốt nốt','Muối hột','Muối bọt','Muối Tây Ninh','Tiêu đen','Tiêu sọ','Ngũ vị hương','Hoa hồi','Quế cây','Cốm dẹp'
        ],
        rightItems: [
          'Dầu ăn (can 25l)','Giấm táo','Dầu hào','Nước mắm','Nước tương Nhị ca','Nước tương hấp cá LKK','Tương cà','Tương ớt','Tương xí muội','Tương ngọt','Dầu mè','Cà ri dầu','Rượu nếp','Rượu hoa tiêu','Vang trắng','Bánh pía','Bột ngọt','Pate gan','Phô mai Bò cười','Sữa đặc','Sữa tươi ko đường','Chao','Lạp xưởng','Bánh tráng cuốn'
        ],
        extraLeft: ['Mì Miliket','Mì trứng','Mì giòn','Miến thái','Mù tạt xanh','Mù tạt vàng','Nước cốt dừa','Bơ đậu phộng'],
        extraRight: ['Kỉ tử','Nấm mèo','Nấm đông cô','Lá nguyệt quế','Mạch nha','Bơ Tường An','Sốt đồ nướng','Hắc xì dầu'],
        extraRightTitle: 'KHÁC'
      },
      hangrau1: {
        title: 'KIỂM KÊ HÀNG HÓA – HÀNG RAU 1',
        leftItems: [
          'Bắp cải trắng:trái','Bầu:kg','Cà chua bi:kg','Cà chua lớn:kg','Cà tím:kg','Cà pháo:kg','Củ dền:kg','Củ sen:kg','Dưa leo Nhật:kg','Dưa leo nhỏ:kg','Đậu bắp:kg','Đu đủ:kg','Giá:kg','Gừng:kg','Hành phi:kg','Hạt sen:kg','Hẹ:kg','Húng lủi:kg','Khế:kg','Khoai lang:kg','Khoai mỡ:kg','Khoai tây:kg','Khổ qua:kg','Lá chanh:kg'
        ],
        rightItems: [
          'Lá dứa:kg','Lá lốt:kg','Lá mơ:kg','Lá ớt:kg','Lá quế:kg','Măng chua:kg','Măng le:kg','Bưởi:kg','Tảo xoắn:kg','Salad thủy tinh:kg','Salad fries:kg','Cải cầu vồng:kg','Măng tây:kg','Me vắt:kg','Mía cây:kg','Mồng tơi:kg','Mướp:kg','Nấm bạch tuyết:kg','Nấm đông cô:kg','Nấm đùi gà:kg','Nấm kim châm:kg','Nghệ:kg','Ngò gai:kg','Ngò rí:kg'
        ]
      },
      hangrau: {
        title: 'KIỂM KÊ HÀNG HÓA – HÀNG RAU 2',
        subtitle: 'NHẬP HÀNG NGÀY',
        items: [
          'Tỏi củ:kg','Hành tây:kg','Cà rốt:kg','Thơm lớn:kg','Tắc:kg','Ớt sừng:kg','Sả cây:kg','Tỏi xay:kg','Chanh:kg','Bắp Mỹ:kg','Ớt xiêm xanh:kg','Đậu rồng:kg','Hành tím:kg','Xoài keo:kg','Củ cải trắng:kg','Tiêu xanh:kg','Củ sắn:kg','Rau răm:kg','Đậu đũa:kg','Lá tía tô:kg','Hành lá:kg','Rau muống:kg','Súp lơ xanh:kg','Ớt chuông:kg'
        ]
      }
    },
    margins: { top: 8, bottom: 8, left: 8, right: 8 },
    customTemplates: {}
  };
}

export const usePrintFormsStore = defineStore('printForms', () => {
  const config = ref<PrintFormConfig>(getInitialPrintForms());
  const auditsStore = useAuditsStore();

  async function loadConfig() {
    try {
      const saved = await printFormsDb.getItem<PrintFormConfig>('kg-print-config');
      if (saved) {
        config.value = { ...getInitialPrintForms(), ...saved };
      } else {
        config.value = getInitialPrintForms();
      }
    } catch (e) {
      config.value = getInitialPrintForms();
    }
  }

  async function updatePrintForms(data: PrintFormConfig) {
    config.value = { ...data };
    try {
      await printFormsDb.setItem('kg-print-config', JSON.parse(JSON.stringify(config.value)));
    } catch (e) {
      console.warn('[PrintFormsStore] Save failed:', e);
    }
    auditsStore.addAudit('UPDATE_PRINT_FORMS', 'Cập nhật mẫu in');
  }

  async function resetPrintForms() {
    config.value.customTemplates = {};
    try {
      await printFormsDb.setItem('kg-print-config', JSON.parse(JSON.stringify(config.value)));
    } catch (e) {
      console.warn('[PrintFormsStore] Save failed:', e);
    }
    auditsStore.addAudit('RESET_PRINT_FORMS', 'Khôi phục mẫu in mặc định');
  }

  return {
    config,
    loadConfig,
    updatePrintForms,
    resetPrintForms
  };
});

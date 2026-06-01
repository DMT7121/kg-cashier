import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getConfigFromCloud, saveConfigToCloud } from '../services/api';
import { useAuditsStore } from './audits';

export interface Categories {
  income: string[];
  expense: string[];
}

const DEFAULT_CATEGORIES: Categories = {
  income: ['Doanh thu bán hàng', 'Doanh thu dịch vụ', 'Thu hồi nợ', 'Thu khác'],
  expense: ['Mua nguyên liệu', 'Vận chuyển', 'Sửa chữa', 'Tiền tip/bo', 'Trả nợ', 'Chi khác']
};

function fixMojibake(str: string): string {
  if (!str) return str;
  if (str.includes('Doanh thu b') && str.includes('n h')) return 'Doanh thu bán hàng';
  if (str.includes('Doanh thu d') && str.includes('ch v')) return 'Doanh thu dịch vụ';
  if (str.includes('Thu h') && str.includes('i n')) return 'Thu hồi nợ';
  if (str.includes('Mua nguy') && str.includes('n li')) return 'Mua nguyên liệu';
  if (str.includes('V') && str.includes('n chuy')) return 'Vận chuyển';
  if (str.startsWith('S') && str.includes('a ch')) return 'Sửa chữa';
  if (str.startsWith('Ti') && str.includes('n tip')) return 'Tiền tip/bo';
  if (str.startsWith('Tr') && str.includes('n')) return 'Trả nợ';
  if (str.startsWith('Thu kh')) return 'Thu khác';
  if (str.startsWith('Chi kh')) return 'Chi khác';
  return str;
}

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Categories>({
    income: [...DEFAULT_CATEGORIES.income],
    expense: [...DEFAULT_CATEGORIES.expense]
  });

  const auditsStore = useAuditsStore();

  function loadCategories() {
    try {
      const saved = localStorage.getItem('kg-categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.income && parsed.expense) {
          categories.value.income = parsed.income.map(fixMojibake);
          categories.value.expense = parsed.expense.map(fixMojibake);
        }
      }
    } catch (e) {
      console.warn('[Categories] Load failed:', e);
    }
  }

  function saveCategories() {
    try {
      localStorage.setItem('kg-categories', JSON.stringify(categories.value));
    } catch (e) {
      console.warn('[Categories] Save failed:', e);
    }
  }

  function addCategory(type: 'income' | 'expense', name: string): boolean {
    if (!name) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    
    // Check duplicate
    const list = categories.value[type];
    if (list.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    
    // Insert before the last item if it's "Thu khác"/"Chi khác"
    const lastIdx = list.length - 1;
    const lastItem = list[lastIdx];
    if (lastItem === 'Thu khác' || lastItem === 'Chi khác') {
      list.splice(lastIdx, 0, trimmed);
    } else {
      list.push(trimmed);
    }
    
    saveCategories();
    auditsStore.addAudit('ADD_CATEGORY', `${type}: ${trimmed}`);
    syncCategoriesToCloud();
    return true;
  }

  function removeCategory(type: 'income' | 'expense', name: string): boolean {
    const list = categories.value[type];
    const index = list.indexOf(name);
    if (index === -1) return false;
    
    categories.value[type] = list.filter(c => c !== name);
    saveCategories();
    auditsStore.addAudit('REMOVE_CATEGORY', `${type}: ${name}`);
    syncCategoriesToCloud();
    return true;
  }

  async function syncCategoriesToCloud() {
    try {
      await saveConfigToCloud('categories', JSON.stringify(categories.value));
    } catch (e) {
      console.warn('[Categories] Cloud push failed:', e);
    }
  }

  async function pullCategoriesFromCloud() {
    try {
      const res = await getConfigFromCloud();
      if (res && res.success && res.config) {
        let cloudCats: any = null;
        if (res.config.categories) {
          cloudCats = typeof res.config.categories === 'string' ? JSON.parse(res.config.categories) : res.config.categories;
        }
        if (cloudCats && cloudCats.income && cloudCats.expense) {
          const oldStr = JSON.stringify(cloudCats);
          
          const income = (cloudCats.income as string[]).map(fixMojibake);
          const expense = (cloudCats.expense as string[]).map(fixMojibake);
          
          categories.value.income = income;
          categories.value.expense = expense;
          
          saveCategories();
          
          const hasMojibake = oldStr !== JSON.stringify(categories.value);
          if (hasMojibake) {
            syncCategoriesToCloud();
          }
          console.log('[Categories] Cloud categories pulled successfully');
        }
      }
    } catch (e) {
      console.warn('[Categories] Cloud pull failed:', e);
    }
  }

  return {
    categories,
    loadCategories,
    saveCategories,
    addCategory,
    removeCategory,
    pullCategoriesFromCloud,
    syncCategoriesToCloud
  };
});

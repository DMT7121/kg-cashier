import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Settings } from '../types/settings';
import { settingsDb } from '../services/db';
import {
  getSettingsFromCloud,
  saveSettingsToCloud,
  isSandboxMode,
  setSandboxMode as setApiSandboxMode,
  addAuditLog
} from '../services/api';

const DEFAULT_SETTINGS: Settings = {
  storeName: "KING's GRILL",
  storeAddress: '34, Hoàng Văn Thụ, Chánh Nghĩa, TDM, Bình Dương',
  autoSync: true,
  discrepancyThreshold: 50000,
  shiftWarningHours: 10,
  requireLogin: true,
  adminPassword: '',
  allowDevWrite: false,
  printer: {
    kitchenIp: '',
    sashimiIp: '',
    barIp: '',
    useQzTray: false
  },
  cukcuk: {
    domain: '',
    appId: '',
    key: '',
    autoSync: false
  },
  vatKeys: {
    gemini: [],
    groq: [],
    hf: [],
    cerebras: [],
    sambanova: [],
    deepseek: [],
    mistral: [],
    nvidia: []
  },
  posTables: [],
  posCatalog: [],
  extension: {
    ttsProvider: 'google',
    ttsKey: '',
    qrTemplates: [],
    lastSelectedQr: null,
    ttsTemplates: [
      { name: 'Di dời xe 🚗', value: 'Xin thông báo, quý khách có xe mang biển số {bien_so} vui lòng dời xe để thuận tiện đi lại. Xin cảm ơn!' },
      { name: 'Mời nhận món 🍲', value: 'Bếp xin mời phục vụ nhận món cho bàn {ban}.' },
      { name: 'Thanh toán 💳', value: 'Xin mời quý khách ở bàn {ban} vui lòng qua quầy thu ngân thanh toán.' },
      { name: 'Phục vụ bàn 🙋', value: 'Xin thông báo phục vụ hỗ trợ khách hàng tại bàn {ban}.' }
    ]
  }
};

function sanitizeValue(key: string, val: any): any {
  if (typeof val === 'string') {
    return val.trim().replace(/[\r\n\t]/g, '');
  }
  if (Array.isArray(val)) {
    return val.map(item => typeof item === 'string' ? item.trim().replace(/[\r\n\t]/g, '') : item);
  }
  if (val && typeof val === 'object') {
    const cleaned: Record<string, any> = {};
    for (const k in val) {
      if (Object.prototype.hasOwnProperty.call(val, k)) {
        cleaned[k] = sanitizeValue(k, val[k]);
      }
    }
    return cleaned;
  }
  return val;
}

function mergeDefaults(defaults: any, target: any): any {
  if (!target || typeof target !== 'object') return { ...defaults };
  const merged = { ...defaults };
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      const defaultVal = defaults[key];
      const targetVal = target[key];
      if (typeof defaultVal === 'object' && defaultVal !== null && !Array.isArray(defaultVal)) {
        merged[key] = mergeDefaults(defaultVal, targetVal);
      } else {
        merged[key] = targetVal;
      }
    }
  }
  return merged;
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
  const isSandbox = ref<boolean>(isSandboxMode());

  async function loadSettings() {
    let local = await settingsDb.getItem<Settings>('kg-settings');
    if (!local) {
      // Fallback: try loading cloud settings
      const cloud = await getSettingsFromCloud();
      if (cloud && cloud.success && cloud.settings) {
        local = cloud.settings;
      }
    }
    
    if (local) {
      settings.value = mergeDefaults(DEFAULT_SETTINGS, local);
    } else {
      settings.value = { ...DEFAULT_SETTINGS };
    }
    await settingsDb.setItem('kg-settings', JSON.parse(JSON.stringify(settings.value)));
    
    // Sync sandbox mode with allowDevWrite status
    setSandbox(!settings.value.allowDevWrite);
  }

  async function updateSettings(newSettings: Partial<Settings>) {
    const defs = DEFAULT_SETTINGS as Record<string, any>;
    const current = settings.value as Record<string, any>;
    
    for (const key in newSettings) {
      if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
        let val = (newSettings as Record<string, any>)[key];
        
        // Safety check against corrupted strings from Apps Script JSON responses
        if (typeof val === 'string' && typeof defs[key] === 'object' && defs[key] !== null) {
          try {
            val = JSON.parse(val);
          } catch (e) {
            continue; // Skip setting if parse failed
          }
        }
        
        // Clean and sanitize string fields
        val = sanitizeValue(key, val);
        
        // Type assertions: Array preservation
        if (Array.isArray(defs[key]) && !Array.isArray(val)) {
          continue;
        }
        
        // Object preservation
        if (typeof defs[key] === 'object' && defs[key] !== null && !Array.isArray(defs[key])) {
          if (typeof val !== 'object' || Array.isArray(val) || val === null) {
            continue;
          }
        }
        
        current[key] = val;
      }
    }
    
    // Save locally
    const rawData = JSON.parse(JSON.stringify(settings.value));
    await settingsDb.setItem('kg-settings', rawData);
    
    // Sync sandbox mode with allowDevWrite status
    setSandbox(!settings.value.allowDevWrite);
    
    // Save to Cloud asynchronously (fire and forget / error handled downstream)
    saveSettingsToCloud(rawData);
    addAuditLog({ type: 'UPDATE_SETTINGS', details: 'Cập nhật cấu hình hệ thống' });
  }

  function setSandbox(enabled: boolean) {
    setApiSandboxMode(enabled);
    isSandbox.value = enabled;
  }

  return {
    settings,
    isSandbox,
    loadSettings,
    updateSettings,
    setSandbox
  };
});

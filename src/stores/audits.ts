import { defineStore } from 'pinia';
import { ref } from 'vue';
import { addAuditLog } from '../services/api';

export interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export const useAuditsStore = defineStore('audits', () => {
  const auditLog = ref<AuditEntry[]>([]);

  async function addAudit(action: string, details = '') {
    let userName = 'SYSTEM';
    try {
      const savedUser = sessionStorage.getItem('kg_session_user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u && u.name) userName = u.name;
      }
    } catch (e) {
      // Ignore session read error
    }

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      user: userName,
      action,
      details
    };

    auditLog.value.unshift(entry);
    if (auditLog.value.length > 500) {
      auditLog.value.length = 500;
    }
    saveAudits();

    // Background push to Google Sheets (fire and forget)
    try {
      addAuditLog(entry);
    } catch (e) {
      console.warn('[Audits] Cloud push failed:', e);
    }
  }

  function saveAudits() {
    try {
      localStorage.setItem('kg-audits', JSON.stringify(auditLog.value));
    } catch (e) {
      console.warn('[Audits] Local save failed:', e);
    }
  }

  function loadAudits() {
    try {
      const data = localStorage.getItem('kg-audits');
      if (data) {
        auditLog.value = JSON.parse(data);
      }
    } catch (e) {
      console.warn('[Audits] Local load failed:', e);
    }
  }

  return {
    auditLog,
    addAudit,
    loadAudits
  };
});

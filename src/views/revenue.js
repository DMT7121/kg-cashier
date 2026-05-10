/* ── Revenue View — Consolidated: Báo cáo + Hóa đơn POS + Phân tích ──
   Tabs: [Báo cáo] [Hóa đơn POS] [Phân tích]
   ── */
import * as reportModule from './report.js';
import * as cukcukModule from './cukcukInvoices.js';
import * as analyticsModule from './analytics.js';

var _activeTab = 'report';

const _tabs = [
  { key: 'report',    icon: 'bar_chart',     label: 'Báo cáo' },
  { key: 'cukcuk',    icon: 'point_of_sale', label: 'Hóa đơn POS' },
  { key: 'analytics', icon: 'analytics',     label: 'Phân tích' },
];

function _renderTabs() {
  return `<div class="settings-tabs" style="margin-bottom:16px;">
    ${_tabs.map(t => `
      <button class="settings-tab ${_activeTab === t.key ? 'active' : ''}" data-revtab="${t.key}">
        <span class="material-symbols-rounded">${t.icon}</span>
        <span>${t.label}</span>
      </button>
    `).join('')}
  </div>`;
}

export function render() {
  var content = '';
  if (_activeTab === 'report') content = reportModule.render();
  else if (_activeTab === 'cukcuk') content = cukcukModule.render();
  else if (_activeTab === 'analytics') content = analyticsModule.render();

  return `
    ${_renderTabs()}
    <div id="revTabContent">
      ${content}
    </div>
  `;
}

function _switchTab(tabKey) {
  _activeTab = tabKey;

  // Update tab buttons
  document.querySelectorAll('[data-revtab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.revtab === tabKey);
  });

  // Render tab content
  var container = document.getElementById('revTabContent');
  if (!container) return;

  if (tabKey === 'report') {
    container.innerHTML = reportModule.render();
    reportModule.init();
  } else if (tabKey === 'cukcuk') {
    container.innerHTML = cukcukModule.render();
    cukcukModule.init();
  } else if (tabKey === 'analytics') {
    container.innerHTML = analyticsModule.render();
    analyticsModule.init();
  }
}

export function init() {
  // Bind tab clicks
  document.querySelectorAll('[data-revtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _switchTab(btn.dataset.revtab);
    });
  });

  // Init current tab's module
  if (_activeTab === 'report') reportModule.init();
  else if (_activeTab === 'cukcuk') cukcukModule.init();
  else if (_activeTab === 'analytics') analyticsModule.init();
}

/**
 * ============================================================================
 * 00_Router.js — UNIFIED DISPATCHER FOR GOOGLE APPS SCRIPT WEBAPP
 * ============================================================================
 * 
 * Central Router for King's Grill Enterprise Backend:
 * 1. KG-Cashier WebApp (Shift, Transactions, Cash Count, Inventory, Staff, Settings, CUKCUK Sync Engine)
 * 2. CK/ATM Transaction Sync Engine & Sheet Auto-Sort WebApp (v4.3-SHEETS-API-V4)
 * 3. 2-Way C3 <-> Sheet Tab Name Synchronizer
 * 4. Pro Sheet Management Sidebar & Utilities
 * 
 * Ensures 100% zero namespace conflicts and complete operational stability.
 */

/**
 * Global WebApp GET Handler
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  // 1. Actions dedicated to 01_SyncWebapp.js
  if (action === 'sort' || action === 'sort_sheets' || action === 'setup_trigger' || action === 'setup_daily_trigger') {
    return handleSyncWebappGet(e);
  }

  // 2. Comprehensive Health Check / Ping
  if (action === 'ping' || action === 'health') {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      success: true,
      statusCode: 200,
      version: 'v4.5-unified',
      services: {
        cashierBackend: 'online (v3.5-v4)',
        syncWebapp: 'online (v4.3-v4)',
        cukcukV4Engine: 'online',
        dateSheetSync: 'online'
      },
      message: "King's Grill Cashier & Transaction Sync WebApp đang hoạt động ổn định.",
      serverTime: Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss'),
      retryable: false
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 3. Cashier backend actions (get_shifts, get_settings, get_transactions, etc.)
  if (action) {
    return _handleCashierRequest(e);
  }

  // 4. Default GET fallback when no action specified
  return handleSyncWebappGet(e);
}

/**
 * Global WebApp POST Handler
 */
function doPost(e) {
  var data = {};
  if (e && e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      data = {};
    }
  }

  var action = (e && e.parameter && e.parameter.action) || data.action || '';

  // 1. Check if request targets 01_SyncWebapp
  var isSyncWebappAction = (
    action === 'sort' ||
    action === 'sort_sheets' ||
    action === 'setup_trigger' ||
    action === 'setup_daily_trigger' ||
    action === 'deduplicate' ||
    action === 'deduplicate_sheet' ||
    action === 'bulk' ||
    action === 'bulk_resync' ||
    action === 'sync_vat_invoice' ||
    action === 'sync_single' ||
    Array.isArray(data.transactions) ||
    (data.spreadsheetId && (data.refNo || data.orderNo || data.billNumber || data.paymentType))
  );

  if (isSyncWebappAction) {
    return handleSyncWebappPost(e, data);
  }

  // 2. Otherwise route to Cashier Backend
  return _handleCashierRequest(e);
}

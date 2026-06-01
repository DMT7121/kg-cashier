/* ══════════════════════════════════════════════════════════════
   Sheets Retry Queue — Exponential Backoff for Google Sheets Push
   
   Replaces fire-and-forget pattern in cukcuk.js with reliable delivery.
   Max 5 retries per batch: 30s → 1m → 2m → 5m → 10m.
   Triggers auto-retry on network recovery (online event).
   ══════════════════════════════════════════════════════════════ */

var RETRY_KEY = 'kg_sheets_retry_queue';
var MAX_RETRIES = 5;
var BACKOFF_MS = [30000, 60000, 120000, 300000, 600000]; // 30s, 1m, 2m, 5m, 10m
var _retryTimer = null;
var _pushFn = null; // will be set via init()

function _load() {
  try {
    var saved = localStorage.getItem(RETRY_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) { /* ignore */ }
  return { batches: [] };
}

function _save(queue) {
  try {
    localStorage.setItem(RETRY_KEY, JSON.stringify(queue));
  } catch(e) { /* ignore */ }
}

/**
 * Initialize with the actual push function.
 * @param {Function} pushFn - async (sheetData, shiftId) => { success: boolean }
 */
export function init(pushFn) {
  _pushFn = pushFn;
  // Auto-retry on network recovery
  window.addEventListener('online', function() {
    console.log('[RetryQueue] Network recovered, triggering retry...');
    processQueue();
  });
  // Check for pending items on init
  var q = _load();
  if (q.batches.length > 0) {
    console.log('[RetryQueue] Found ' + q.batches.length + ' pending batches on init');
    setTimeout(processQueue, 5000); // Delay to let app settle
  }
}

/**
 * Enqueue a batch for push. Called after syncCukcukRevenueToCloud fails.
 */
export function enqueue(sheetData, shiftId, refIds) {
  var q = _load();
  q.batches.push({
    sheetData: sheetData,
    shiftId: shiftId,
    refIds: refIds,
    retries: 0,
    nextRetryAt: Date.now() + BACKOFF_MS[0],
    createdAt: new Date().toISOString()
  });
  _save(q);
  _scheduleNext();
  console.log('[RetryQueue] Enqueued batch: ' + sheetData.length + ' invoices');
}

/**
 * Process all due batches.
 */
export async function processQueue() {
  if (!_pushFn) return;
  var q = _load();
  if (q.batches.length === 0) return;

  var now = Date.now();
  var remaining = [];
  var processed = 0;

  for (var i = 0; i < q.batches.length; i++) {
    var batch = q.batches[i];
    
    // Not due yet
    if (batch.nextRetryAt > now) {
      remaining.push(batch);
      continue;
    }

    // Max retries exceeded → mark as failed, keep in queue for manual retry
    if (batch.retries >= MAX_RETRIES) {
      batch.failed = true;
      remaining.push(batch);
      continue;
    }

    try {
      var res = await _pushFn(batch.sheetData, batch.shiftId);
      if (res && res.success) {
        processed++;
        console.log('[RetryQueue] ✅ Batch pushed: ' + batch.sheetData.length + ' invoices (retry #' + batch.retries + ')');
        // Mark as pushed in invoiceStore
        _markPushed(batch.refIds);
      } else {
        throw new Error(res && res.message || 'Push failed');
      }
    } catch(e) {
      batch.retries++;
      var delay = BACKOFF_MS[Math.min(batch.retries, BACKOFF_MS.length - 1)];
      batch.nextRetryAt = Date.now() + delay;
      remaining.push(batch);
      console.warn('[RetryQueue] ❌ Retry #' + batch.retries + ' failed, next in ' + (delay / 1000) + 's:', e.message);
    }
  }

  q.batches = remaining;
  _save(q);
  
  if (processed > 0) {
    console.log('[RetryQueue] Processed ' + processed + ' batches, ' + remaining.length + ' remaining');
  }
  
  _scheduleNext();
}

function _markPushed(refIds) {
  try {
    import('../services/invoiceStore').then(function(store) {
      store.markPushedToSheets(refIds);
    });
  } catch(e) { /* ignore */ }
}

function _scheduleNext() {
  clearTimeout(_retryTimer);
  var q = _load();
  var earliest = Infinity;
  for (var i = 0; i < q.batches.length; i++) {
    if (!q.batches[i].failed && q.batches[i].nextRetryAt < earliest) {
      earliest = q.batches[i].nextRetryAt;
    }
  }
  if (earliest < Infinity) {
    var delay = Math.max(earliest - Date.now(), 1000);
    _retryTimer = setTimeout(processQueue, delay);
  }
}

/**
 * Get queue status for UI display.
 */
export function getStatus() {
  var q = _load();
  var pending = 0;
  var failed = 0;
  var totalInvoices = 0;
  for (var i = 0; i < q.batches.length; i++) {
    totalInvoices += q.batches[i].sheetData.length;
    if (q.batches[i].failed) failed++;
    else pending++;
  }
  return { pending: pending, failed: failed, totalInvoices: totalInvoices, total: q.batches.length };
}

/**
 * Retry all failed batches (manual trigger from UI).
 */
export function retryFailed() {
  var q = _load();
  for (var i = 0; i < q.batches.length; i++) {
    if (q.batches[i].failed) {
      q.batches[i].failed = false;
      q.batches[i].retries = 0;
      q.batches[i].nextRetryAt = Date.now();
    }
  }
  _save(q);
  processQueue();
}

/**
 * Clear the entire queue (destructive, for admin use).
 */
export function clearQueue() {
  _save({ batches: [] });
  clearTimeout(_retryTimer);
}

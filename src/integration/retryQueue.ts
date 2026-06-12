/* ══════════════════════════════════════════════════════════════
   Sheets Retry Queue — Exponential Backoff for Google Sheets Push
   
   Replaces fire-and-forget pattern in cukcuk.js with reliable delivery.
   Max 5 retries per batch: 30s → 1m → 2m → 5m → 10m.
   Triggers auto-retry on network recovery (online event).
   ══════════════════════════════════════════════════════════════ */

interface Batch {
  sheetData: any[];
  shiftId: string;
  refIds: string[];
  retries: number;
  nextRetryAt: number;
  createdAt: string;
  failed?: boolean;
}

interface Queue {
  batches: Batch[];
}

const RETRY_KEY = 'kg_sheets_retry_queue';
const MAX_RETRIES = 5;
const BACKOFF_MS = [30000, 60000, 120000, 300000, 600000]; // 30s, 1m, 2m, 5m, 10m
let _retryTimer: any = null;
let _pushFn: ((sheetData: any[], shiftId: string) => Promise<{ success: boolean; message?: string }>) | null = null; // will be set via init()

function _load(): Queue {
  try {
    const saved = localStorage.getItem(RETRY_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return { batches: [] };
}

function _save(queue: Queue): void {
  try {
    localStorage.setItem(RETRY_KEY, JSON.stringify(queue));
  } catch (e) { /* ignore */ }
}

/**
 * Initialize with the actual push function.
 */
export function init(pushFn: (sheetData: any[], shiftId: string) => Promise<{ success: boolean; message?: string }>): void {
  _pushFn = pushFn;
  // Auto-retry on network recovery
  window.addEventListener('online', () => {
    console.log('[RetryQueue] Network recovered, triggering retry...');
    processQueue();
  });
  // Check for pending items on init
  const q = _load();
  if (q.batches.length > 0) {
    console.log('[RetryQueue] Found ' + q.batches.length + ' pending batches on init');
    setTimeout(processQueue, 5000); // Delay to let app settle
  }
}

/**
 * Enqueue a batch for push. Called after syncCukcukRevenueToCloud fails.
 */
export function enqueue(sheetData: any[], shiftId: string, refIds: string[]): void {
  const q = _load();
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
export async function processQueue(): Promise<void> {
  if (!_pushFn) return;
  const q = _load();
  if (q.batches.length === 0) return;

  const now = Date.now();
  const remaining: Batch[] = [];
  let processed = 0;

  for (let i = 0; i < q.batches.length; i++) {
    const batch = q.batches[i];
    
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
      const res = await _pushFn(batch.sheetData, batch.shiftId);
      if (res && res.success) {
        processed++;
        console.log('[RetryQueue] ✅ Batch pushed: ' + batch.sheetData.length + ' invoices (retry #' + batch.retries + ')');
        // Mark as pushed in invoiceStore
        _markPushed(batch.refIds);
      } else {
        throw new Error(res && res.message || 'Push failed');
      }
    } catch (e: any) {
      batch.retries++;
      const delay = BACKOFF_MS[Math.min(batch.retries, BACKOFF_MS.length - 1)];
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

function _markPushed(refIds: string[]): void {
  try {
    import('../services/invoiceStore').then((store) => {
      store.markPushedToSheets(refIds);
    });
  } catch (e) { /* ignore */ }
}

function _scheduleNext(): void {
  clearTimeout(_retryTimer);
  const q = _load();
  let earliest = Infinity;
  for (let i = 0; i < q.batches.length; i++) {
    if (!q.batches[i].failed && q.batches[i].nextRetryAt < earliest) {
      earliest = q.batches[i].nextRetryAt;
    }
  }
  if (earliest < Infinity) {
    const delay = Math.max(earliest - Date.now(), 1000);
    _retryTimer = setTimeout(processQueue, delay);
  }
}

/**
 * Get queue status for UI display.
 */
export function getStatus(): { pending: number; failed: number; totalInvoices: number; total: number } {
  const q = _load();
  let pending = 0;
  let failed = 0;
  let totalInvoices = 0;
  for (let i = 0; i < q.batches.length; i++) {
    totalInvoices += q.batches[i].sheetData.length;
    if (q.batches[i].failed) failed++;
    else pending++;
  }
  return { pending: pending, failed: failed, totalInvoices: totalInvoices, total: q.batches.length };
}

/**
 * Retry all failed batches (manual trigger from UI).
 */
export function retryFailed(): void {
  const q = _load();
  for (let i = 0; i < q.batches.length; i++) {
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
export function clearQueue(): void {
  _save({ batches: [] });
  clearTimeout(_retryTimer);
}

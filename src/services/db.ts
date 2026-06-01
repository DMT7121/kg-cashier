import localforage from 'localforage';

// Configure LocalForage instances for the IndexedDB database
// This avoids the 5MB localStorage limit and ensures reliable local storage.

export const settingsDb = localforage.createInstance({
  name: 'kg-cashier-db',
  storeName: 'settings'
});

export const shiftsDb = localforage.createInstance({
  name: 'kg-cashier-db',
  storeName: 'shifts'
});

export const invoicesDb = localforage.createInstance({
  name: 'kg-cashier-db',
  storeName: 'invoices'
});

export const syncQueueDb = localforage.createInstance({
  name: 'kg-cashier-db',
  storeName: 'sync_queue'
});

export const printFormsDb = localforage.createInstance({
  name: 'kg-cashier-db',
  storeName: 'print_forms'
});

/**
 * Clear all cached invoice records (useful during troubleshooting or manual sync resets)
 */
export async function clearInvoiceCache(): Promise<void> {
  await invoicesDb.clear();
}

/**
 * Get total space used by the invoices store (approximate count of records)
 */
export async function getInvoicesCacheCount(): Promise<number> {
  const keys = await invoicesDb.keys();
  return keys.length;
}

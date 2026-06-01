declare module '*/integration/cukcuk.js' {
  export function testConnection(): Promise<any>;
  export function syncTransactions(force?: boolean): Promise<any>;
  export function getSyncStatus(): any;
  export function loginAndGetToken(): Promise<any>;
  export function pushManualEditToSheets(refId: string): Promise<any>;
}

declare module '*.js' {
  const content: any;
  export default content;
}

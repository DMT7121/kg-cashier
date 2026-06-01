export interface PrinterConfig {
  kitchenIp: string;
  sashimiIp: string;
  barIp: string;
  useQzTray: boolean;
}

export interface CukcukConfig {
  domain: string;
  appId: string;
  key: string;
  autoSync: boolean;
}

export interface VatKeysConfig {
  gemini: string[];
  groq: string[];
  hf: string[];
  cerebras: string[];
  sambanova: string[];
  deepseek: string[];
  mistral: string[];
  nvidia: string[];
}

export interface TtsTemplate {
  name: string;
  value: string;
}

export interface QrTemplate {
  name: string;
  url: string;
  [key: string]: any;
}

export interface ExtensionConfig {
  ttsProvider: string;
  ttsKey: string;
  qrTemplates: QrTemplate[];
  lastSelectedQr: QrTemplate | null;
  ttsTemplates: TtsTemplate[];
}

export interface Settings {
  storeName: string;
  storeAddress: string;
  autoSync: boolean;
  discrepancyThreshold: number;
  shiftWarningHours: number;
  requireLogin: boolean;
  adminPassword: string;
  allowDevWrite?: boolean;
  printer: PrinterConfig;
  cukcuk: CukcukConfig;
  vatKeys: VatKeysConfig;
  posTables: any[];
  posCatalog: any[];
  extension: ExtensionConfig;
}

import { VpnEngineApi } from './singbox';

declare global {
  interface Window {
    vpnEngine?: VpnEngineApi;
  }
}

export {};

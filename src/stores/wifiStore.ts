import { create } from 'zustand';
import { api } from '../api/client';
import { API_ROUTES } from '../utils/constants';
import type { WifiConfig, WifiAp, WifiBss } from '../types/api';
import type { WifiNetwork } from '../types';

interface WifiState {
  config: WifiConfig | null;
  networks: WifiNetwork[];
  totalDevices: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchWifiStatus: () => Promise<void>;
  toggleWifi: (enabled: boolean) => Promise<void>;
  toggleBss: (bssId: string, enabled: boolean) => Promise<void>;
}

// Helper to map band string to display format
const formatBand = (band: string): '2.4GHz' | '5GHz' | '6GHz' => {
  const bandLower = band.toLowerCase();
  if (bandLower.includes('6g') || bandLower === '6g') return '6GHz';
  if (bandLower.includes('5g') || bandLower === '5g') return '5GHz';
  if (bandLower.includes('2g4') || bandLower.includes('2.4') || bandLower.includes('2d4g')) return '2.4GHz';
  return '2.4GHz';
};

// Extended BSS type for v9+ Freebox with band info in status
interface ExtendedBss extends WifiBss {
  status: WifiBss['status'] & {
    band?: string;  // e.g. "6G", "5G", "2G4"
  };
}

export const useWifiStore = create<WifiState>((set, get) => ({
  config: null,
  networks: [],
  totalDevices: 0,
  isLoading: false,
  error: null,

  fetchWifiStatus: async () => {
    // Only show loading on first fetch to avoid flickering
    const { networks: existingNetworks } = get();
    if (existingNetworks.length === 0) {
      set({ isLoading: true });
    }

    try {
      const response = await api.get<{
        config: WifiConfig | null;
        aps?: WifiAp[];
        bss: ExtendedBss[];
        wifiDeviceCount?: number;
        devicesByBand?: Record<string, number>;
      }>(API_ROUTES.WIFI_FULL);

      if (response.success && response.result) {
        const { config, aps, bss, wifiDeviceCount, devicesByBand } = response.result;

        // Handle case where bss is empty or not an array
        if (!bss || !Array.isArray(bss) || bss.length === 0) {
          set({ config: config || null, networks: [], totalDevices: wifiDeviceCount || 0, isLoading: false });
          return;
        }

        // Build networks from BSS data
        const networks: WifiNetwork[] = [];
        const seenBands = new Set<string>();

        // For Freebox v9+, BSS contains band info directly in status
        for (const b of bss || []) {
          if (b.config?.enabled) {
            // Get band from BSS status (Freebox v9+) or try to find matching AP
            let band: '2.4GHz' | '5GHz' | '6GHz' = '2.4GHz';

            if (b.status?.band) {
              // Freebox v9+ has band in BSS status
              band = formatBand(b.status.band);
            } else if (aps && aps.length > 0) {
              // Older Freebox: find matching AP by phy_id
              const matchingAp = aps.find(ap => ap.id === b.phy_id);
              if (matchingAp?.config?.band) {
                band = formatBand(matchingAp.config.band);
              }
            }

            // Only add one network per band (they share SSID)
            const bandKey = `${b.config.ssid}-${band}`;
            if (!seenBands.has(bandKey)) {
              seenBands.add(bandKey);

              // Get channel info and usage from AP if available
              const matchingAp = aps?.find(ap => ap.id === b.phy_id);

              // Get channel usage from AP status (percentage 0-100)
              // Freebox API provides this as channel_usage in some versions
              const apStatus = matchingAp?.status as {
                channel_width?: number;
                primary_channel?: number;
                channel_usage?: number;
                dfs_cac_remaining_time?: number;
              } | undefined;

              const apConfig = matchingAp?.config as {
                channel_width?: string | number;
                primary_channel?: number;
              } | undefined;

              const channelUsage = apStatus?.channel_usage ?? 0;

              // Get channel width from status first, then config, with band-appropriate defaults
              // 2.4GHz typically uses 20MHz, 5GHz uses 80MHz, 6GHz uses 160MHz
              let channelWidth = 20;
              if (apStatus?.channel_width) {
                channelWidth = apStatus.channel_width;
              } else if (apConfig?.channel_width) {
                // Config can be string like "80" or number
                channelWidth = typeof apConfig.channel_width === 'string'
                  ? parseInt(apConfig.channel_width, 10) || 20
                  : apConfig.channel_width;
              } else {
                // Default based on band
                if (band === '6GHz') channelWidth = 160;
                else if (band === '5GHz') channelWidth = 80;
                else channelWidth = 20;
              }

              // Get device count for this band from devicesByBand
              let bandDeviceCount = 0;
              if (devicesByBand) {
                if (band === '6GHz') bandDeviceCount = devicesByBand['6g'] || 0;
                else if (band === '5GHz') bandDeviceCount = devicesByBand['5g'] || 0;
                else if (band === '2.4GHz') bandDeviceCount = devicesByBand['2g4'] || 0;
              }

              // Estimate load based on device count if no channel_usage provided
              // ~8% per device, max 80%
              const estimatedLoad = channelUsage > 0 ? channelUsage : Math.min(bandDeviceCount * 8, 80);

              networks.push({
                id: b.id,
                ssid: b.config.ssid || 'Unknown',
                band,
                channelWidth,
                channel: apStatus?.primary_channel || apConfig?.primary_channel || 0,
                active: b.status?.state === 'active',
                connectedDevices: bandDeviceCount,
                load: estimatedLoad
              });
            }
          }
        }

        // Sort by band (6GHz > 5GHz > 2.4GHz)
        networks.sort((a, b) => {
          const order = { '6GHz': 0, '5GHz': 1, '2.4GHz': 2 };
          return order[a.band] - order[b.band];
        });

        // Use wifiDeviceCount from backend (counted from LAN devices)
        const totalDevices = wifiDeviceCount || 0;

        set({ config, networks, totalDevices, isLoading: false });
      } else {
        set({ isLoading: false, error: response.error?.message });
      }
    } catch {
      set({ isLoading: false, error: 'Failed to fetch WiFi status' });
    }
  },

  toggleWifi: async (enabled: boolean) => {
    try {
      const response = await api.put<WifiConfig>(API_ROUTES.WIFI_CONFIG, { enabled });
      if (response.success && response.result) {
        set({ config: response.result });
      }
    } catch {
      set({ error: 'Failed to toggle WiFi' });
    }
  },

  toggleBss: async (bssId: string, enabled: boolean) => {
    try {
      const response = await api.put(`/api/wifi/bss/${bssId}`, { enabled });
      if (response.success) {
        // Update local state optimistically
        const { networks } = get();
        set({
          networks: networks.map(n =>
            n.id === bssId ? { ...n, active: enabled } : n
          )
        });
        // Refresh full status to get accurate data
        get().fetchWifiStatus();
      } else {
        set({ error: response.error?.message || 'Failed to toggle BSS' });
      }
    } catch {
      set({ error: 'Failed to toggle BSS' });
    }
  }
}));
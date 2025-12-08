import React, { useEffect } from 'react';
import {
  Thermometer,
  Fan,
  ArrowDown,
  ArrowUp,
  Wifi,
  Activity,
  Phone
} from 'lucide-react';
import logoUltra from '../../icons/logo_ultra.svg';
import { StatusBadge } from '../ui/Badge';
import { formatSpeed, formatTemperature } from '../../utils/constants';
import { useCapabilitiesStore } from '../../stores/capabilitiesStore';
import type { SystemInfo, ConnectionStatus } from '../../types/api';

// Map model to display name
const getDisplayName = (model: string): string => {
  switch (model) {
    case 'ultra': return 'Freebox Ultra';
    case 'delta': return 'Freebox Delta';
    case 'pop': return 'Freebox Pop';
    case 'revolution': return 'Freebox Revolution';
    default: return 'Freebox';
  }
};

interface HeaderProps {
  systemInfo?: SystemInfo | null;
  connectionStatus?: ConnectionStatus | null;
}

// Helper to get CPU temperature (works for both old and new Freebox models)
const getCpuTemp = (info: SystemInfo | null | undefined): number | null => {
  if (!info) return null;
  // Try v9+ temps first (average of available CPUs)
  if (info.temp_cpu0 != null) {
    const temps = [info.temp_cpu0, info.temp_cpu1, info.temp_cpu2, info.temp_cpu3].filter(t => t != null) as number[];
    if (temps.length > 0) {
      return Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);
    }
  }
  // Fall back to older model temp
  if (info.temp_cpum != null) return info.temp_cpum;
  if (info.temp_cpub != null) return info.temp_cpub;
  return null;
};

export const Header: React.FC<HeaderProps> = ({ systemInfo, connectionStatus }) => {
  // Get capabilities for model name (respects mock mode)
  const { getModel } = useCapabilitiesStore();

  // Get CPU temperature (works for all Freebox models)
  const cpuTemp = getCpuTemp(systemInfo);
  const temp = cpuTemp != null ? formatTemperature(cpuTemp) : '--';
  const fan = systemInfo?.fan_rpm != null ? `${systemInfo.fan_rpm}T/min` : '--';
  const downloadSpeed = connectionStatus
    ? formatSpeed(connectionStatus.rate_down).replace(' ', '')
    : '--';
  const uploadSpeed = connectionStatus
    ? formatSpeed(connectionStatus.rate_up).replace(' ', '')
    : '--';
  const wifiStatus = 'OK';
  const phoneStatus = 'OK'; // Phone line status - would need API endpoint to get real status
  const connectionState = connectionStatus?.state === 'up' ? 'UP' : 'DOWN';
  const ipv4 = connectionStatus?.ipv4 || '--';

  // Get simplified display name based on model (e.g., "Freebox Ultra", "Freebox Pop")
  const model = getModel();
  const boxName = getDisplayName(model);

  // Update page title based on model
  useEffect(() => {
    const modelSuffix = model === 'unknown' ? '' : ` ${model.charAt(0).toUpperCase() + model.slice(1)}`;
    document.title = `Freebox OS${modelSuffix}`;
  }, [model]);

  return (
    <header className="flex flex-col md:flex-row items-center justify-between p-4 bg-[#111111] border-b border-gray-800 gap-4">
      {/* Box identifier */}
      <div className="flex items-center gap-3 bg-[#1a1a1a] px-4 py-2 rounded-lg border border-gray-700">
        <img src={logoUltra} alt="Freebox Ultra" className="w-7 h-7 flex-shrink-0" />
        <span className="font-semibold text-gray-200 leading-none">{boxName}</span>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
        <StatusBadge
          icon={<Thermometer size={16} />}
          value={temp}
          color="text-emerald-400"
        />
        <StatusBadge
          icon={<Fan size={16} />}
          value={fan}
          color="text-emerald-400"
        />

        {/* Network speeds */}
        <div className="flex items-center gap-4 bg-[#1a1a1a] px-4 py-2 rounded-lg border border-gray-700 mx-2">
          <div className="flex items-center gap-2">
            <ArrowDown size={16} className="text-blue-400" />
            <span className="text-sm font-medium">{downloadSpeed}</span>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <ArrowUp size={16} className="text-green-400" />
            <span className="text-sm font-medium">{uploadSpeed}</span>
          </div>
        </div>

        <StatusBadge
          icon={<Wifi size={16} />}
          value={wifiStatus}
          color="text-green-400"
        />
        <StatusBadge
          icon={<Phone size={16} />}
          value={phoneStatus}
          color={phoneStatus === 'OK' ? 'text-green-400' : 'text-red-400'}
        />
        <StatusBadge
          icon={<Activity size={16} />}
          value={connectionState}
          color={connectionState === 'UP' ? 'text-green-400' : 'text-red-400'}
        />

        {/* IPv4 */}
        <div className="hidden lg:flex items-center gap-2 bg-[#1a1a1a] px-4 py-2 rounded-lg border border-gray-700 ml-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-mono text-gray-400">{ipv4} (IPv4)</span>
        </div>
      </div>
    </header>
  );
};
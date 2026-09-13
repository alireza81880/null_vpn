import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Palette,
  Shield,
  Languages,
  Check,
  Moon,
  Sun,
  Sparkles,
  Zap,
  Lock,
  Wifi,
  Globe,
  Radio,
  Sliders,
} from 'lucide-react';
import { useThemeStore, THEME_REGISTRY, type ThemeCategory } from '../store/useThemeStore';
import { useI18n } from '../i18n/I18nContext';
import { BentoCard } from '../components/ui/BentoCard';
import { LiquidButton } from '../components/ui/LiquidButton';

/**
 * Modern iOS-Style Toggle Switch
 */
interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ id, checked, onChange, disabled }) => {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
        borderColor: checked ? 'var(--accent-primary)' : 'var(--border-subtle)',
        boxShadow: checked ? '0 0 14px var(--accent-glow)' : 'none',
      }}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2
        transition-colors duration-200 ease-in-out focus:outline-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          backgroundColor: checked ? 'var(--accent-foreground, #ffffff)' : 'var(--text-muted)',
        }}
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full shadow-md
          transform ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
};

export const SettingsPage: React.FC = () => {
  const { t, language, setLanguage } = useI18n();

  // Zustand Theme Store
  const activeTheme = useThemeStore((state) => state.activeTheme);
  const setTheme = useThemeStore((state) => state.setTheme);

  // Filter state for Theme Swatches
  const [selectedCategory, setSelectedCategory] = useState<'all' | ThemeCategory>('all');

  // Security & App Preferences State (Stored locally with persistence)
  const [killSwitch, setKillSwitch] = useState<boolean>(() => {
    return localStorage.getItem('aegis_pref_killswitch') !== 'false';
  });
  const [dnsShield, setDnsShield] = useState<boolean>(() => {
    return localStorage.getItem('aegis_pref_dnsshield') !== 'false';
  });
  const [autoConnect, setAutoConnect] = useState<boolean>(() => {
    return localStorage.getItem('aegis_pref_autoconnect') === 'true';
  });
  const [lanBypass, setLanBypass] = useState<boolean>(() => {
    return localStorage.getItem('aegis_pref_lanbypass') === 'true';
  });

  const handleToggleKillSwitch = (val: boolean) => {
    setKillSwitch(val);
    localStorage.setItem('aegis_pref_killswitch', String(val));
  };

  const handleToggleDnsShield = (val: boolean) => {
    setDnsShield(val);
    localStorage.setItem('aegis_pref_dnsshield', String(val));
  };

  const handleToggleAutoConnect = (val: boolean) => {
    setAutoConnect(val);
    localStorage.setItem('aegis_pref_autoconnect', String(val));
  };

  const handleToggleLanBypass = (val: boolean) => {
    setLanBypass(val);
    localStorage.setItem('aegis_pref_lanbypass', String(val));
  };

  const filteredThemes = selectedCategory === 'all'
    ? THEME_REGISTRY
    : THEME_REGISTRY.filter((th) => th.category === selectedCategory);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-14">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2
            style={{ color: 'var(--text-primary)' }}
            className="text-lg sm:text-xl font-bold tracking-tight"
          >
            {t('settings.title')}
          </h2>
          <p
            style={{ color: 'var(--text-secondary)' }}
            className="text-xs"
          >
            {t('settings.subtitle')}
          </p>
        </div>

        {/* Current Active Theme Badge */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-glass)',
            borderColor: 'var(--border-glass)',
            color: 'var(--text-secondary)',
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium self-start sm:self-auto"
        >
          <Palette className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Active:</span>
          <span style={{ color: 'var(--text-primary)' }} className="font-bold capitalize">
            {THEME_REGISTRY.find((t) => t.id === activeTheme)?.name || activeTheme}
          </span>
        </div>
      </div>

      {/* ====================================================================
          BENTO CARD 1: THEME SELECTION BENTO BOX (12 Themes Engine)
          ==================================================================== */}
      <BentoCard colSpan="col-span-12" className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-glass)',
                color: 'var(--accent-primary)',
              }}
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
            >
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3
                style={{ color: 'var(--text-primary)' }}
                className="text-sm sm:text-base font-bold tracking-tight"
              >
                {t('settings.themeEngineTitle')}
              </h3>
              <p
                style={{ color: 'var(--text-muted)' }}
                className="text-xs"
              >
                {t('settings.themeEngineDesc')}
              </p>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] select-none self-start sm:self-auto">
            {(['all', 'light', 'dark', 'premium'] as const).map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'transparent',
                    color: isSelected ? 'var(--accent-foreground, #ffffff)' : 'var(--text-secondary)',
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer transition-all"
                >
                  {cat === 'all' ? 'All (12)' : cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 12 Swatches Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredThemes.map((th) => {
            const isSelected = activeTheme === th.id;

            return (
              <button
                key={th.id}
                id={`theme-swatch-${th.id}`}
                type="button"
                onClick={() => setTheme(th.id)}
                style={{
                  backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-surface-glass)',
                  borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-glass)',
                  boxShadow: isSelected
                    ? '0 0 0 1.5px var(--accent-primary), 0 0 20px var(--accent-glow)'
                    : 'var(--glass-shadow)',
                  transform: 'translateZ(0)',
                }}
                className={`
                  p-3.5 rounded-2xl border text-start cursor-pointer transition-all duration-200
                  hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden flex flex-col justify-between min-h-[110px]
                `}
              >
                {/* Visual Color Preview Bar */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {/* Palette Pill Preview */}
                    <div
                      style={{
                        backgroundColor: th.canvasColor,
                        borderColor: th.primaryColor,
                      }}
                      className="flex items-center h-5 rounded-full border px-1.5 py-0.5 gap-1 shadow-sm"
                    >
                      {/* Surface Chip */}
                      <span
                        style={{ backgroundColor: th.surfaceColor }}
                        className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-xs"
                      />
                      {/* Primary Accent Chip */}
                      <span
                        style={{ backgroundColor: th.primaryColor }}
                        className="w-2.5 h-2.5 rounded-full shadow-xs"
                      />
                    </div>

                    <span
                      style={{
                        backgroundColor: 'var(--bg-surface-elevated)',
                        color: 'var(--text-muted)',
                      }}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                    >
                      {th.category}
                    </span>
                  </div>

                  {/* Active Checkmark Pill */}
                  {isSelected ? (
                    <span
                      style={{
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--accent-foreground, #ffffff)',
                        boxShadow: '0 0 10px var(--accent-glow)',
                      }}
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  ) : (
                    <span
                      style={{ backgroundColor: th.primaryColor }}
                      className="w-2 h-2 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                </div>

                {/* Theme Title & Description */}
                <div>
                  <h4
                    style={{ color: 'var(--text-primary)' }}
                    className="text-xs font-bold tracking-tight mb-0.5 truncate"
                  >
                    {th.name}
                  </h4>
                  <p
                    style={{ color: 'var(--text-muted)' }}
                    className="text-[10px] leading-tight line-clamp-2"
                  >
                    {th.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </BentoCard>

      {/* ====================================================================
          BENTO ROW 2: APP PREFERENCES & SECURITY CONTROLS
          ==================================================================== */}
      <div className="grid grid-cols-12 gap-4 sm:gap-5">
        {/* Left Bento: App Security Preferences */}
        <BentoCard colSpan="col-span-12 lg:col-span-7" className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border-subtle)]">
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-glass)',
                color: 'var(--accent-primary)',
              }}
              className="w-9 h-9 rounded-xl border flex items-center justify-center"
            >
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3
                style={{ color: 'var(--text-primary)' }}
                className="text-sm font-bold tracking-tight"
              >
                {t('settings.engineSecurityTitle')}
              </h3>
              <p
                style={{ color: 'var(--text-muted)' }}
                className="text-xs"
              >
                Network firewall & protocol resilience settings
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* 1. Kill Switch Toggle */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-glass)',
                borderColor: 'var(--border-subtle)',
              }}
              className="flex items-center justify-between p-3.5 rounded-2xl border"
            >
              <div className="pr-3">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <p
                    style={{ color: 'var(--text-primary)' }}
                    className="text-xs font-bold"
                  >
                    {t('settings.killSwitchTitle')}
                  </p>
                </div>
                <p
                  style={{ color: 'var(--text-muted)' }}
                  className="text-[11px] leading-relaxed"
                >
                  {t('settings.killSwitchDesc')}
                </p>
              </div>
              <ToggleSwitch
                id="toggle-kill-switch"
                checked={killSwitch}
                onChange={handleToggleKillSwitch}
              />
            </div>

            {/* 2. DNS Leak Shield Toggle */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-glass)',
                borderColor: 'var(--border-subtle)',
              }}
              className="flex items-center justify-between p-3.5 rounded-2xl border"
            >
              <div className="pr-3">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  <p
                    style={{ color: 'var(--text-primary)' }}
                    className="text-xs font-bold"
                  >
                    {t('settings.dnsLeakTitle')}
                  </p>
                </div>
                <p
                  style={{ color: 'var(--text-muted)' }}
                  className="text-[11px] leading-relaxed"
                >
                  {t('settings.dnsLeakDesc')}
                </p>
              </div>
              <ToggleSwitch
                id="toggle-dns-shield"
                checked={dnsShield}
                onChange={handleToggleDnsShield}
              />
            </div>

            {/* 3. Auto-Connect on Launch */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-glass)',
                borderColor: 'var(--border-subtle)',
              }}
              className="flex items-center justify-between p-3.5 rounded-2xl border"
            >
              <div className="pr-3">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <p
                    style={{ color: 'var(--text-primary)' }}
                    className="text-xs font-bold"
                  >
                    Auto-Connect on Startup
                  </p>
                </div>
                <p
                  style={{ color: 'var(--text-muted)' }}
                  className="text-[11px] leading-relaxed"
                >
                  Instantly establishes encrypted tunnel when application boots
                </p>
              </div>
              <ToggleSwitch
                id="toggle-auto-connect"
                checked={autoConnect}
                onChange={handleToggleAutoConnect}
              />
            </div>

            {/* 4. Local LAN Bypass */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-glass)',
                borderColor: 'var(--border-subtle)',
              }}
              className="flex items-center justify-between p-3.5 rounded-2xl border"
            >
              <div className="pr-3">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Wifi className="w-3.5 h-3.5 text-purple-400" />
                  <p
                    style={{ color: 'var(--text-primary)' }}
                    className="text-xs font-bold"
                  >
                    LAN Traffic Bypass
                  </p>
                </div>
                <p
                  style={{ color: 'var(--text-muted)' }}
                  className="text-[11px] leading-relaxed"
                >
                  Allow direct unencrypted access to local network printers and NAS devices
                </p>
              </div>
              <ToggleSwitch
                id="toggle-lan-bypass"
                checked={lanBypass}
                onChange={handleToggleLanBypass}
              />
            </div>
          </div>
        </BentoCard>

        {/* Right Bento: Language & Localization */}
        <BentoCard colSpan="col-span-12 lg:col-span-5" className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border-subtle)]">
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-glass)',
                color: 'var(--accent-primary)',
              }}
              className="w-9 h-9 rounded-xl border flex items-center justify-center"
            >
              <Languages className="w-4 h-4" />
            </div>
            <div>
              <h3
                style={{ color: 'var(--text-primary)' }}
                className="text-sm font-bold tracking-tight"
              >
                {t('settings.languageTitle')}
              </h3>
              <p
                style={{ color: 'var(--text-muted)' }}
                className="text-xs"
              >
                Interface dialect & bidirectional RTL layout
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* English (LTR) */}
            <button
              type="button"
              onClick={() => setLanguage('en')}
              style={{
                backgroundColor: language === 'en' ? 'var(--bg-surface-elevated)' : 'var(--bg-surface-glass)',
                borderColor: language === 'en' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                boxShadow: language === 'en' ? '0 0 14px var(--accent-glow)' : 'none',
              }}
              className="w-full p-4 rounded-2xl border text-start cursor-pointer transition-all flex items-center justify-between"
            >
              <div>
                <p className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                  {t('settings.englishLabel')}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.englishDesc')}
                </p>
              </div>
              {language === 'en' && (
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              )}
            </button>

            {/* Farsi (RTL) */}
            <button
              type="button"
              onClick={() => setLanguage('fa')}
              style={{
                backgroundColor: language === 'fa' ? 'var(--bg-surface-elevated)' : 'var(--bg-surface-glass)',
                borderColor: language === 'fa' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                boxShadow: language === 'fa' ? '0 0 14px var(--accent-glow)' : 'none',
              }}
              className="w-full p-4 rounded-2xl border text-start cursor-pointer transition-all flex items-center justify-between"
            >
              <div>
                <p className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                  {t('settings.farsiLabel')}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.farsiDesc')}
                </p>
              </div>
              {language === 'fa' && (
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              )}
            </button>
          </div>

          {/* Engine Architecture Information Box */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            className="p-3.5 rounded-2xl border text-[11px] font-mono space-y-1 mt-4"
          >
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>Client Architecture:</span>
              <span className="font-bold text-[var(--text-primary)]">Electron / Capacitor</span>
            </div>
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>Tunnel Driver:</span>
              <span className="font-bold text-[var(--accent-primary)]">WireGuard Wintun + V2Ray</span>
            </div>
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>Rendering Engine:</span>
              <span className="font-bold text-emerald-400">Liquid Glass 2.0 (60fps)</span>
            </div>
          </div>
        </BentoCard>
      </div>
    </div>
  );
};

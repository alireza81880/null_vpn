# Null VPN — Next-Generation Tunnel Client (Vision 2026)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC.svg)](https://tailwindcss.com/)
[![Core](https://img.shields.io/badge/Tunnel_Core-sing--box-10B981.svg)](https://sing-box.sagernet.org/)
[![Frame Rate](https://img.shields.io/badge/Rendering-60fps%20Locked-8B5CF6.svg)]()

> **Null VPN** is an ultra-modern, zero-trust cryptographic tunnel client engineered for high-throughput privacy routing. Built upon **Liquid Glass 2.0** visual aesthetics, **Bento Grid** architecture, and the high-performance **sing-box** universal proxy core, it delivers native desktop and mobile experiences via a unified Capacitor/Electron dual-bridge.

---

## 🌐 Bilingual Overview / مرور کلی دو زبانه

### English
Null VPN merges cutting-edge cryptographic network routing with **visionOS-inspired Liquid Glass 2.0** interface design. Featuring hardware-composited 60fps animations, strict battery-conscious background lifecycle hooks, a 12-theme dynamic design token engine, and unified support for modern proxy and VPN protocols (WireGuard, VLESS with Reality, Trojan, VMess, Shadowsocks).

### فارسی
**نال وی‌پی‌ان (Null VPN)** یک کلاینت تونلینگ رمزنگاری‌شده نسل جدید است که با تلفیق طراحی شیشه‌ای مدرن **Liquid Glass 2.0** و استانداردهای **Bento Grid** توسعه یافته است. این کلاینت با هسته قدرتمند **sing-box**، پشتیبانی کامل از رندرینگ سخت‌افزاری ۶۰ فریم بر ثانیه، معماری دوگانه الکترون و کپسیتور (دسکتاپ و موبایل)، ۱۲ پوسته رنگی پویا، بهینه‌سازی مصرف باتری، و رابط کاربری کاملاً دو زبانه (انگلیسی و فارسی راست‌به‌چپ با قلم وزیرمتن) تجربه‌ای بدون افت فریم و فوق امن را ارائه می‌دهد.

---

## ⚡ Key Architectural Directives

### 1. 60fps Hardware-Accelerated Rendering
- **GPU Compositing**: Forced GPU composition through `translateZ(0)`, `willChange: 'transform, opacity'`, and `backfaceVisibility: 'hidden'`.
- **Zero Paint Thrashing**: 1Hz telemetry updates utilize `tabular-nums` and atomic Zustand primitive selectors to prevent layout reflows across the DOM tree.
- **Micro-Halos**: Replaced costly continuous `box-shadow` calculations with pre-composited SVG and radial gradient opacity layers.

### 2. Battery & Resource Optimization (Capacitor / Electron Dual-Bridge)
- **Lifecycle Awareness**: The connection telemetry radar, SVG laser pulses, and canvas animations automatically suspend when the application is minimized or backgrounded (`isAppActive === false`).
- **Platform Bridging**: Seamless execution in Node/Electron desktop environments (Windows, macOS, Linux) and Capacitor mobile runtimes (Android, iOS).
- **Zero Memory Leaks**: Decoupled interval loops and unified event subscribers via isolated Zustand stores.

### 3. Multi-Protocol Engine (sing-box Core)
Null VPN provides a single, unified interface for multiple tunneling protocols:
| Protocol | Transport / Security | Key Use Case |
| :--- | :--- | :--- |
| **WireGuard** | ChaCha20-Poly1305 / RFC 8439 | Kernel-level ultra-fast UDP routing |
| **VLESS** | Reality / XTLS Vision / TCP | Anti-censorship and deep packet inspection (DPI) bypass |
| **Trojan** | TLS 1.3 / WebSocket / gRPC | Camouflaged HTTPS network traffic |
| **VMess** | AEAD / WebSocket | Standard multiplexed transport |
| **Shadowsocks** | 2022-blake3-aes-128-gcm | Lightweight authenticated proxying |

### 4. Liquid Glass 2.0 & Bento Grid
- **Ergonomic Surfaces**: 16px–24px mathematically balanced radii with 1px luminous edge borders.
- **Tactile Feedback**: 6-state `LiquidButton` components with physical micro-tactility, inset highlights, and zero-layout-shift micro-spinners.
- **Swipeable Gestures**: Mobile-first spring-damped swipe gestures on `TunnelCard` (swipe left to delete, swipe right to edit).

### 5. 12 Vision 2026 Theme Tokens Engine
Null VPN features an integrated design token registry with 12 distinct palettes switchable in real time:
- **Light Minimalist (4)**: Clean Minimal, Soft Blue, Pearl, Morning Glow.
- **Dark & Monochromatic (4)**: Deep Space, Slate, OLED Pure Black, Midnight Indigo.
- **Vision 2026 Premium (4)**: Cyberpunk Neon, Aurora Borealis, Sunset Gradient, Hacker Green.

### 6. Comprehensive i18n & RTL Typography
- **Bi-directional Layout**: Full LTR and RTL mirroring with zero hardcoded directional styling.
- **Typography Pairing**: Plus Jakarta Sans & JetBrains Mono for English, and Vazirmatn for Persian typography.
- **100% Dictionary Coverage**: Symmetric translation dictionaries (`en.json` & `fa.json`) across all system flows.

---

## 📁 Workspace Architecture

```text
├── electron/                   # Electron desktop wrapper & window bridge
├── public/                     # Static icons, favicons, and manifest assets
├── src/
│   ├── components/
│   │   ├── dashboard/          # ConnectionShield, TelemetryGrid, ConnectionNode, TunnelSelector
│   │   ├── layout/             # MainLayout, Titlebar, BottomNav (Liquid Glass sticky bar)
│   │   ├── modals/             # ImportModal (Clipboard, QR camera scanner, file upload)
│   │   ├── ui/                 # BentoCard, LiquidButton
│   │   └── vpn/                # TunnelCard (swipeable mobile gestures)
│   ├── i18n/
│   │   ├── locales/            # en.json & fa.json (Symmetric 96-key dictionaries)
│   │   └── I18nContext.tsx     # Bi-directional RTL layout & translation provider
│   ├── pages/
│   │   ├── Dashboard.tsx       # Primary telemetry & connection switchboard
│   │   ├── ServersPage.tsx     # Filterable tunnel vault, search, and protocol pills
│   │   ├── StatsPage.tsx       # Live throughput charts and transfer metrics
│   │   └── SettingsPage.tsx    # Theme selector grid & kernel security switches
│   ├── store/
│   │   ├── useAppStore.ts      # Core VPN telemetry state machine
│   │   ├── useNavigationStore.ts# Multi-view routing
│   │   ├── useThemeStore.ts    # 12 themes registry & root DOM synchronization
│   │   └── useTunnelStore.ts   # Unified tunnel configurations repository
│   ├── styles/
│   │   └── globals.css         # Liquid Glass 2.0 CSS variables & token engine
│   ├── types/                  # Strict TypeScript interfaces
│   ├── App.tsx                 # Root application router
│   └── main.tsx                # Entry point
├── metadata.json               # Applet capabilities & permissions
├── package.json                # Project dependencies & build scripts
└── vite.config.ts              # Vite bundler configuration
```

---

## 🚀 Getting Started & Local Development

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **bun**

### Installation
```bash
# Clone repository
git clone https://github.com/<your-username>/null-vpn.git
cd null-vpn

# Install dependencies
npm install
```

### Run in Web Development Mode
```bash
npm run dev
```
The application will launch with local hot module evaluation at `http://localhost:3000`.

### Type-Check & Verification
```bash
npm run lint
```

### Production Build
```bash
npm run build
```

---

## 💻 Packaging for Desktop & Mobile

### 1. Electron Desktop Build
```bash
# Build web assets and launch Electron window
npm run build
npm run electron:start
```

### 2. Capacitor Mobile Build (Android / iOS)
```bash
# Sync web dist to Capacitor native projects
npx cap sync
npx cap open android
# or
npx cap open ios
```

---

## 🛡️ Security & Privacy Guarantees
- **Zero Logs**: Null VPN never logs user traffic, DNS lookups, or routing timestamps.
- **Hardware Kill Switch**: Automatically drops all outgoing system traffic via kernel packet filters if the handshake session terminates.
- **DNS Leak Shield**: Enforces encrypted DNS-over-HTTPS (DoH) through Cloudflare 1.1.1.1 to prevent ISP eavesdropping.
- **RFC 8439 Cryptography**: ChaCha20-Poly1305 symmetric encryption paired with Curve25519 elliptic curve key exchanges.

---

## 📄 License
Released under the [MIT License](LICENSE). Designed and engineered for high-performance security routing.

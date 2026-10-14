# Hướng Dẫn Tích Hợp & Xuất Mã Nguồn Yana Studio (HTML/CSS & React Component)

Dự án Yana Studio bao gồm 2 màn hình chính đã được thiết kế hoàn thiện:
1. **Screen 1 (`SCREEN_12`)**: Giao diện Workspace IDE đầy đủ phong cách VS Code + Tích hợp Yana Copilot (Mixture-of-Agents, CodeMirror 6 Paging, Terminal PTY, Status Bar).
2. **Screen 2 (`SCREEN_2`)**: Giao diện Cài đặt Models & Runtime (macOS Titlebar chuẩn, 41 AI Providers Catalog, Quét Local AI, Quản lý Token Telemetry).

---

## 1. Cấu trúc Component React (TypeScript + Tailwind CSS)

### Cài đặt dependencies cần thiết:
```bash
npm install lucide-react clsx tailwind-merge
# hoặc
pnpm add lucide-react clsx tailwind-merge
```

### Cấu hình Tailwind Color Tokens (Dựa trên Autonomous Runtime Cockpit):
```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#111317',
          dim: '#111317',
          bright: '#37393e',
          'container-lowest': '#0c0e12',
          'container-low': '#1a1c20',
          container: '#202227',
          'container-high': '#2b2d32',
          'container-highest': '#35383e'
        },
        primary: {
          DEFAULT: '#4f80ff',
          hover: '#3b6df0'
        },
        outline: {
          DEFAULT: '#3a3d45',
          variant: '#27292e'
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace']
      }
    }
  }
}
```

---

## 2. Mã Nguồn Màn Hình Models & Runtime Settings (`ModelsAndRuntime.tsx`)

```tsx
import React, { useState } from 'react';
import { 
  Search, RefreshCw, Terminal, Shield, Folder, CheckCircle, 
  AlertCircle, Cpu, Cloud, Database, HardDrive, Key, ExternalLink 
} from 'lucide-react';

const PROVIDERS = [
  // Cloud LLM (18)
  { id: 'claude', name: 'Claude', org: 'Anthropic', badge: 'balanced · tools', models: '4 models', status: 'Needs key', category: 'cloud' },
  { id: 'openai', name: 'OpenAI', org: 'OpenAI', badge: 'fast · cheap', models: '5 models', status: 'Needs key', category: 'cloud' },
  { id: 'gemini', name: 'Gemini', org: 'Google', badge: 'fast · cheap', models: '3 models', status: 'Needs key', category: 'cloud' },
  { id: 'groq', name: 'Groq', org: 'Groq Cloud LPU', badge: 'balanced · tools', models: '3 models active', status: 'Key encrypted', category: 'cloud', active: true },
  { id: 'deepseek', name: 'DeepSeek', org: 'DeepSeek', badge: 'balanced · tools', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'openrouter', name: 'OpenRouter', org: 'Multi-model Gateway', badge: 'cheap', models: '120+ models', status: 'Needs key', category: 'cloud' },
  { id: 'xai', name: 'xAI', org: 'xAI (Grok)', badge: 'balanced', models: '3 models', status: 'Needs key', category: 'cloud' },
  { id: 'mistral', name: 'Mistral AI', org: 'Mistral Platform', badge: 'fast · code', models: '4 models', status: 'Needs key', category: 'cloud' },
  { id: 'cohere', name: 'Cohere', org: 'Command R+', badge: 'rag · tools', models: '3 models', status: 'Needs key', category: 'cloud' },
  { id: 'perplexity', name: 'Perplexity', org: 'Sonar Online', badge: 'search', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'ai21', name: 'AI21 Labs', org: 'Jamba 1.5 Mini/Large', badge: 'hybrid', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'novita', name: 'Novita AI', org: 'Novita AI Llama', badge: 'balanced', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'nvidia', name: 'NVIDIA', org: 'NVIDIA NIM', badge: 'nvidia/llama-3.1-nemotron-70b', models: '', status: 'Needs key', category: 'cloud' },
  { id: 'minimax', name: 'MiniMax', org: 'MiniMax abab6.5', badge: 'balanced', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'glm', name: 'GLM', org: 'Zhipu AI GLM-4', badge: 'tools', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'kimi', name: 'Kimi', org: 'Moonshot AI', badge: 'long-context', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'qwen', name: 'Qwen', org: 'Alibaba Cloud / DashScope', badge: 'coder · vision', models: '3 models', status: 'Needs key', category: 'cloud' },
  { id: 'ernie', name: 'Baidu ERNIE', org: 'Baidu Qianfan Platform', badge: 'enterprise', models: '2 models', status: 'Needs key', category: 'cloud' },

  // Local / On-device (7)
  { id: 'ollama', name: 'Ollama', org: 'On-device engine', badge: 'local · 3 models', models: 'Connected', status: 'Keyless', category: 'local', active: true },
  { id: 'turbofieldfare', name: 'TurboFieldfare', org: 'On-device engine', badge: 'gemma-4-26b-a4b-it', models: 'Active', status: 'Keyless', category: 'local', active: true },
  { id: 'lmstudio', name: 'LM Studio', org: 'On-device', badge: 'local-model', models: '', status: 'Keyless', category: 'local' },
  { id: 'llamacpp', name: 'llama.cpp', org: 'On-device', badge: 'local-model', models: '', status: 'Keyless', category: 'local' },
  { id: 'airllm', name: 'AirLLM', org: 'On-device VRAM optimizer', badge: '70B layer streaming', models: '', status: 'Keyless', category: 'local' },
  { id: 'vllm', name: 'vLLM Engine', org: 'Local high-throughput', badge: 'local-server :8000', models: '', status: 'Keyless', category: 'local' },
  { id: 'jan', name: 'Jan / Cortex.cpp', org: 'Local offline engine', badge: 'local runtime', models: '', status: 'Keyless', category: 'local' },

  // Open-source Hosting & Router (10)
  { id: '9router', name: '9Router', org: 'Local gateway aggregator', badge: 'balanced', models: '2 models', status: 'Needs key', category: 'router' },
  { id: 'huggingface', name: 'Hugging Face', org: 'Inference Endpoints', badge: 'meta-llama/Llama-3.3-70B', models: '', status: 'Needs key', category: 'router' },
  { id: 'together', name: 'Together AI', org: 'Together Inference', badge: 'fast · tools', models: '8 models', status: 'Needs key', category: 'router' },
  { id: 'fireworks', name: 'Fireworks AI', org: 'Function Calling & VLM', badge: 'fast', models: '6 models', status: 'Needs key', category: 'router' },
  { id: 'anyscale', name: 'Anyscale', org: 'Ray LLM Endpoints', badge: 'scale', models: '4 models', status: 'Needs key', category: 'router' },
  { id: 'replicate', name: 'Replicate', org: 'Serverless Models', badge: 'vision', models: '5 models', status: 'Needs key', category: 'router' },
  { id: 'deepinfra', name: 'DeepInfra', org: 'Pay-per-token GPU', badge: 'cheap', models: '6 models', status: 'Needs key', category: 'router' },
  { id: 'lepton', name: 'Lepton AI', org: 'Standard inference API', badge: 'fast', models: '3 models', status: 'Needs key', category: 'router' },
  { id: 'octoai', name: 'OctoAI', org: 'Compute Service', badge: 'media', models: '2 models', status: 'Needs key', category: 'router' },
  { id: 'hyperbolic', name: 'Hyperbolic', org: 'Decentralized GPU', badge: 'cost-effective', models: '4 models', status: 'Needs key', category: 'router' },

  // Enterprise & Custom (6)
  { id: 'bedrock', name: 'AWS Bedrock', org: 'Claude, Llama, Titan', badge: 'IAM Role / Key', models: 'Multi-vendor', status: 'Needs key', category: 'enterprise' },
  { id: 'azure', name: 'Azure OpenAI', org: 'Enterprise Deployment', badge: 'Azure Endpoint required', models: '', status: 'Needs key', category: 'enterprise' },
  { id: 'cloudflare', name: 'Cloudflare AI', org: 'Workers AI Edge', badge: 'edge · Edge Inference', models: '', status: 'Needs key', category: 'enterprise' },
  { id: 'cerebras', name: 'Cerebras', org: 'Ultra-fast CS-3 LPU', badge: '1800+ tps', models: '2 models', status: 'Needs key', category: 'enterprise' },
  { id: 'sambanova', name: 'SambaNova', org: 'DataScale SN40L', badge: 'full-precision', models: '3 models', status: 'Needs key', category: 'enterprise' },
  { id: 'custom', name: 'Custom Endpoint', org: 'OpenAI-compatible Reverse Proxy', badge: 'Custom URL Loopback / HTTPS', models: '∞', status: 'Keyless', category: 'enterprise' }
];

export const ModelsAndRuntimeSettings: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local' | 'router' | 'enterprise'>('all');
  const [search, setSearch] = useState('');

  const filteredProviders = PROVIDERS.filter(p => {
    const matchesFilter = filter === 'all' || p.category === filter;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.org.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#111317] text-[#c9cbd0] font-sans selection:bg-[#4f80ff]/30 text-xs">
      {/* 1. macOS Titlebar & VS Code Navigation */}
      <header className="h-9 bg-[#1a1c20] border-b border-[#27292e] flex items-center justify-between px-3 select-none">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] hover:opacity-80 cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:opacity-80 cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] hover:opacity-80 cursor-pointer" />
          </div>
          <nav className="flex items-center space-x-3 text-[#9a9da5]">
            {['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'].map((item) => (
              <span key={item} className="hover:text-white cursor-pointer transition-colors">{item}</span>
            ))}
          </nav>
        </div>

        <div className="flex items-center bg-[#111317] border border-[#27292e] rounded px-3 py-1 text-[#9a9da5] w-96 space-x-2">
          <Search size={13} />
          <span className="flex-1 text-center font-mono text-[11px] text-[#71747d]">yanacuti1121/Yana-AI ⌘P</span>
        </div>

        <div className="flex items-center space-x-2">
          {['Studio Home', 'Workspace', 'Design Canvas', 'Tasks', 'Models & Runtime', 'Settings'].map((tab) => (
            <button
              key={tab}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                tab === 'Models & Runtime'
                  ? 'bg-[#2b2d32] text-[#4f80ff] border border-[#4f80ff]/40 shadow-sm'
                  : 'text-[#9a9da5] hover:bg-[#202227] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Main Settings Body */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <span className="text-[10px] tracking-wider uppercase text-[#4f80ff] font-semibold">CONTROL PLANE</span>
          <h1 className="text-xl font-bold text-white mt-0.5">Cài đặt Yana Studio</h1>
          <p className="text-[#9a9da5] text-xs">Quản lý giao diện, model, runtime và kết nối trong một nơi.</p>
        </div>

        {/* Tab navigation */}
        <div className="flex space-x-1 border-b border-[#27292e] pb-2 overflow-x-auto">
          {[
            'Tài khoản', 'Giao diện', 'Mô hình & Điều phối', 'Sử dụng', 
            'Tài khoản & Kết nối', 'Quyền hạn', 'Công cụ ngoài', 'Lệnh Yana', 'Riêng tư & Dữ liệu'
          ].map((tab, idx) => (
            <button 
              key={tab}
              className={`px-3 py-1.5 rounded text-xs transition-colors whitespace-nowrap ${
                tab === 'Mô hình & Điều phối'
                  ? 'bg-[#2b2d32] text-[#4f80ff] font-medium'
                  : 'text-[#9a9da5] hover:text-white hover:bg-[#1a1c20]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Runtime & Daemon Info Card */}
        <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-white">Yana runtime</span>
            <button className="flex items-center space-x-1 text-xs bg-[#2b2d32] hover:bg-[#35383e] text-white px-2.5 py-1 rounded transition-colors">
              <Folder size={12} />
              <span>Chọn yana-rt</span>
            </button>
          </div>
          <div className="font-mono text-[11px] bg-[#111317] p-2.5 rounded border border-[#27292e] text-[#9a9da5] flex justify-between items-center">
            <span>/Users/vutam/Yana-AI/tools/yana-studio/runtime/yana-rt</span>
            <span className="text-[#27c93f] bg-[#27c93f]/10 px-2 py-0.5 rounded text-[10px]">ELF v2.4 executable</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-[#9a9da5]">
            <Shield size={13} className="text-[#4f80ff]" />
            <span>Ranh giới quyền hạn: Chat → TurnEngine → RuntimeAuthority → Giám Thị. Terminal vẫn là shell người dùng. Key mã hóa OS safeStorage.</span>
          </div>
        </div>

        {/* 41 AI Providers Catalog */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-white">Provider library</h2>
                <span className="bg-[#4f80ff]/10 text-[#4f80ff] border border-[#4f80ff]/30 text-[10px] font-mono px-2 py-0.5 rounded">
                  41 TOTAL PROVIDERS LOADED
                </span>
              </div>
              <p className="text-[11px] text-[#9a9da5]">41 provider chính thức từ catalog Rust yana-rt · Cloud, Local & Specialized Gateway.</p>
            </div>
            <div className="relative w-64">
              <Search size={12} className="absolute left-2.5 top-2.5 text-[#71747d]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Lọc theo tên catalog..."
                className="w-full bg-[#111317] border border-[#27292e] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#71747d] focus:outline-none focus:border-[#4f80ff]"
              />
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex space-x-2">
            {[
              { id: 'all', label: 'Tất cả (41)' },
              { id: 'cloud', label: 'Cloud LLM (18)' },
              { id: 'local', label: 'Local / On-device (7)' },
              { id: 'router', label: 'Open-source Hosting & Router (10)' },
              { id: 'enterprise', label: 'Specialized / Enterprise (6)' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                  filter === f.id
                    ? 'bg-[#4f80ff] text-white font-medium'
                    : 'bg-[#1a1c20] text-[#9a9da5] hover:text-white border border-[#27292e]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Grid of Providers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProviders.map(p => (
              <div 
                key={p.id}
                className={`bg-[#1a1c20] border rounded-lg p-3 transition-all hover:border-[#4f80ff]/50 ${
                  p.active ? 'border-[#4f80ff]/40 bg-[#1a1c20]/90' : 'border-[#27292e]'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-white text-xs">{p.name}</h3>
                    <p className="text-[11px] text-[#9a9da5]">{p.org}</p>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    p.status === 'Key encrypted' ? 'bg-[#27c93f]/10 text-[#27c93f] border border-[#27c93f]/30' :
                    p.status === 'Keyless' ? 'bg-[#4f80ff]/10 text-[#4f80ff] border border-[#4f80ff]/30' :
                    'bg-[#2b2d32] text-[#9a9da5]'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[#71747d] border-t border-[#27292e]/60 pt-2 font-mono">
                  <span>{p.badge}</span>
                  <span>{p.models}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Telemetry section */}
        <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#4f80ff]">RUNTIME TELEMETRY</span>
              <h3 className="text-sm font-semibold text-white">Sử dụng token</h3>
            </div>
            <button className="flex items-center space-x-1 text-xs text-[#9a9da5] hover:text-white">
              <RefreshCw size={12} />
              <span>Làm mới</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#111317] p-3 rounded border border-[#27292e]">
              <span className="text-[#9a9da5] text-[11px]">Workspace hiện tại</span>
              <div className="text-xl font-bold text-white mt-1">21.066</div>
              <span className="text-[10px] text-[#71747d]">8 vòng model đã ghi nhận</span>
            </div>
            <div className="bg-[#111317] p-3 rounded border border-[#27292e]">
              <span className="text-[#9a9da5] text-[11px]">Tất cả dự án</span>
              <div className="text-xl font-bold text-white mt-1">21.066</div>
              <span className="text-[10px] text-[#71747d]">8 vòng model đã ghi nhận</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
```

---

## 3. Cách Sử Dụng Trực Tiếp Trong Dự Án Yana-AI (`renderer/`)

Anh có thể đặt component này vào thư mục:
`tools/yana-studio/renderer/src/surfaces/ModelsAndRuntime.tsx`
hoặc nhúng vào bộ định tuyến `SurfaceSwitcher` trong file `renderer/main.tsx`:

```tsx
import { ModelsAndRuntimeSettings } from './surfaces/ModelsAndRuntime';

export function App() {
  const [currentSurface, setCurrentSurface] = useState('models_and_runtime');

  return (
    <div className="app-container">
      {currentSurface === 'models_and_runtime' && <ModelsAndRuntimeSettings />}
    </div>
  );
}
```

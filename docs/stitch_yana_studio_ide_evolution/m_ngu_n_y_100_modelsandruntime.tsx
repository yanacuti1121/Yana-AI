# TOÀN BỘ CODE HOÀN CHỈNH 100% — COPY DÁN THẲNG VÀO DỰ ÁN (KHÔNG CẮT XÉN)

File: `tools/yana-studio/renderer/src/surfaces/ModelsAndRuntime.tsx`

```tsx
import React, { useState } from 'react';
import {
  Search, RefreshCw, Terminal, Shield, Folder, CheckCircle, XCircle,
  AlertCircle, Cpu, Cloud, Database, HardDrive, Key, ExternalLink,
  ChevronDown, ArrowLeft, ArrowRight, Layers, Sliders, Settings,
  Radio, Laptop, Wifi, Check, AlertTriangle, Monitor, Sparkles
} from 'lucide-react';

interface ProviderItem {
  id: string;
  name: string;
  org: string;
  badge: string;
  models: string;
  status: 'Needs key' | 'Key encrypted' | 'Keyless';
  category: 'cloud' | 'local' | 'router' | 'enterprise';
  active?: boolean;
}

const PROVIDERS: ProviderItem[] = [
  // 1. Cloud LLM (18)
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
  { id: 'nvidia', name: 'NVIDIA', org: 'NVIDIA NIM', badge: 'nvidia/llama-3.1-nemotron-70b', models: '1 model', status: 'Needs key', category: 'cloud' },
  { id: 'minimax', name: 'MiniMax', org: 'MiniMax abab6.5', badge: 'balanced', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'glm', name: 'GLM', org: 'Zhipu AI GLM-4', badge: 'tools', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'kimi', name: 'Kimi', org: 'Moonshot AI', badge: 'long-context', models: '2 models', status: 'Needs key', category: 'cloud' },
  { id: 'qwen', name: 'Qwen', org: 'Alibaba Cloud / DashScope', badge: 'coder · vision', models: '3 models', status: 'Needs key', category: 'cloud' },
  { id: 'ernie', name: 'Baidu ERNIE', org: 'Baidu Qianfan Platform', badge: 'enterprise', models: '2 models', status: 'Needs key', category: 'cloud' },

  // 2. Local / On-device (7)
  { id: 'ollama', name: 'Ollama', org: 'On-device engine', badge: 'local · 3 models', models: 'Connected', status: 'Keyless', category: 'local', active: true },
  { id: 'turbofieldfare', name: 'TurboFieldfare', org: 'On-device engine', badge: 'gemma-4-26b-a4b-it', models: 'Active', status: 'Keyless', category: 'local', active: true },
  { id: 'lmstudio', name: 'LM Studio', org: 'On-device', badge: 'local-model', models: 'Standby', status: 'Keyless', category: 'local' },
  { id: 'llamacpp', name: 'llama.cpp', org: 'On-device', badge: 'local-model', models: 'Standby', status: 'Keyless', category: 'local' },
  { id: 'airllm', name: 'AirLLM', org: 'On-device VRAM optimizer', badge: '70B layer streaming', models: 'Standby', status: 'Keyless', category: 'local' },
  { id: 'vllm', name: 'vLLM Engine', org: 'Local high-throughput', badge: 'local-server :8000', models: 'Standby', status: 'Keyless', category: 'local' },
  { id: 'jan', name: 'Jan / Cortex.cpp', org: 'Local offline engine', badge: 'local runtime', models: 'Standby', status: 'Keyless', category: 'local' },

  // 3. Open-source Hosting & Router (10)
  { id: '9router', name: '9Router', org: 'Local gateway aggregator', badge: 'balanced', models: '2 models', status: 'Needs key', category: 'router' },
  { id: 'huggingface', name: 'Hugging Face', org: 'Inference Endpoints', badge: 'meta-llama/Llama-3.3-70B', models: '1 model', status: 'Needs key', category: 'router' },
  { id: 'together', name: 'Together AI', org: 'Together Inference', badge: 'fast · tools', models: '8 models', status: 'Needs key', category: 'router' },
  { id: 'fireworks', name: 'Fireworks AI', org: 'Function Calling & VLM', badge: 'fast', models: '6 models', status: 'Needs key', category: 'router' },
  { id: 'anyscale', name: 'Anyscale', org: 'Ray LLM Endpoints', badge: 'scale', models: '4 models', status: 'Needs key', category: 'router' },
  { id: 'replicate', name: 'Replicate', org: 'Serverless Models', badge: 'vision', models: '5 models', status: 'Needs key', category: 'router' },
  { id: 'deepinfra', name: 'DeepInfra', org: 'Pay-per-token GPU', badge: 'cheap', models: '6 models', status: 'Needs key', category: 'router' },
  { id: 'lepton', name: 'Lepton AI', org: 'Standard inference API', badge: 'fast', models: '3 models', status: 'Needs key', category: 'router' },
  { id: 'octoai', name: 'OctoAI', org: 'Compute Service', badge: 'media', models: '2 models', status: 'Needs key', category: 'router' },
  { id: 'hyperbolic', name: 'Hyperbolic', org: 'Decentralized GPU', badge: 'cost-effective', models: '4 models', status: 'Needs key', category: 'router' },

  // 4. Specialized / Enterprise (6)
  { id: 'bedrock', name: 'AWS Bedrock', org: 'Claude, Llama, Titan', badge: 'IAM Role / Key', models: 'Multi-vendor', status: 'Needs key', category: 'enterprise' },
  { id: 'azure', name: 'Azure OpenAI', org: 'Enterprise Deployment', badge: 'Azure Endpoint required', models: 'Dedicated', status: 'Needs key', category: 'enterprise' },
  { id: 'cloudflare', name: 'Cloudflare AI', org: 'Workers AI Edge', badge: 'edge · Edge Inference', models: 'Global Edge', status: 'Needs key', category: 'enterprise' },
  { id: 'cerebras', name: 'Cerebras', org: 'Ultra-fast CS-3 LPU', badge: '1800+ tps', models: '2 models', status: 'Needs key', category: 'enterprise' },
  { id: 'sambanova', name: 'SambaNova', org: 'DataScale SN40L', badge: 'full-precision', models: '3 models', status: 'Needs key', category: 'enterprise' },
  { id: 'custom', name: 'Custom Endpoint', org: 'OpenAI-compatible Reverse Proxy', badge: 'Custom URL Loopback / HTTPS', models: '∞', status: 'Keyless', category: 'enterprise' }
];

export const ModelsAndRuntimeSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Mô hình & Điều phối');
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local' | 'router' | 'enterprise'>('all');
  const [search, setSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('TurboFieldfare • On-device');
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8091/v1');
  const [modelId, setModelId] = useState('gemma-4-26b-a4b-it');

  const filteredProviders = PROVIDERS.filter(p => {
    const matchesFilter = filter === 'all' || p.category === filter;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.org.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#111317] text-[#c9cbd0] font-sans selection:bg-[#4f80ff]/30 text-xs">
      {/* ========================================================
          1. macOS Titlebar & VS Code Navigation Bar (Hàng trên cùng - h-9)
      ======================================================== */}
      <header className="h-9 bg-[#1a1c20] border-b border-[#27292e] flex items-center justify-between px-3 select-none sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          {/* macOS Traffic Lights */}
          <div className="flex items-center space-x-1.5 mr-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] hover:opacity-80 cursor-pointer shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:opacity-80 cursor-pointer shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] hover:opacity-80 cursor-pointer shadow-sm" />
          </div>

          {/* VS Code Menu */}
          <nav className="hidden lg:flex items-center space-x-3 text-[#9a9da5]">
            {['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'].map((item) => (
              <span key={item} className="hover:text-white cursor-pointer transition-colors text-[11px]">{item}</span>
            ))}
          </nav>

          {/* Divider & Navigation buttons */}
          <div className="flex items-center space-x-1.5 text-[#71747d] border-l border-[#27292e] pl-2">
            <button className="hover:text-white p-0.5"><ArrowLeft size={12} /></button>
            <button className="hover:text-white p-0.5"><ArrowRight size={12} /></button>
          </div>
        </div>

        {/* Command Palette */}
        <div className="flex items-center bg-[#111317] border border-[#27292e] rounded px-3 py-1 text-[#9a9da5] w-80 lg:w-96 space-x-2">
          <Search size={13} className="text-[#71747d]" />
          <span className="flex-1 text-center font-mono text-[11px] text-[#71747d]">yanacuti1121/Yana-AI ⌘P</span>
        </div>

        {/* Surfaces Switcher */}
        <div className="flex items-center space-x-1">
          {['Studio Home', 'Workspace', 'Design Canvas', 'Tasks', 'Models & Runtime', 'Settings'].map((tab) => (
            <button
              key={tab}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
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

      {/* ========================================================
          2. Nội dung Cài đặt Chính (Control Plane)
      ======================================================== */}
      <main className="max-w-7xl mx-auto p-5 space-y-5">
        
        {/* Back Link */}
        <div className="flex items-center space-x-1 text-[#9a9da5] hover:text-white cursor-pointer transition-colors text-[11px]">
          <ArrowLeft size={12} />
          <span>Workspace</span>
        </div>

        {/* Header Title */}
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[10px] tracking-wider uppercase text-[#4f80ff] font-semibold">CONTROL PLANE</span>
            <h1 className="text-xl font-bold text-white mt-0.5">Cài đặt Yana Studio</h1>
            <p className="text-[#9a9da5] text-xs">Quản lý giao diện, model, runtime và kết nối trong một nơi.</p>
          </div>
          <a href="#" className="text-xs text-[#4f80ff] hover:underline flex items-center space-x-1">
            <span>Xem lại giới thiệu Studio</span>
            <ExternalLink size={11} />
          </a>
        </div>

        {/* Tab Navigation (9 Tabs) */}
        <div className="flex space-x-1 border-b border-[#27292e] pb-1.5 overflow-x-auto">
          {[
            'Tài khoản', 'Giao diện', 'Mô hình & Điều phối', 'Sử dụng', 
            'Tài khoản & Kết nối', 'Quyền hạn', 'Công cụ ngoài', 'Lệnh Yana', 'Riêng tư & Dữ liệu'
          ].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded text-xs transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-[#2b2d32] text-[#4f80ff] font-medium border border-[#4f80ff]/30'
                  : 'text-[#9a9da5] hover:text-white hover:bg-[#1a1c20]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Section Header: Model & Runtime */}
        <div>
          <h2 className="text-sm font-semibold text-white">Model & Runtime</h2>
          <p className="text-[#9a9da5] text-[11px]">Cloud và local cùng đi qua TurnEngine và RuntimeAuthority của Yana.</p>
        </div>

        {/* Global Search Bar */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-2.5 text-[#71747d]" />
          <input 
            type="text"
            placeholder="Tìm model theo tên, provider hoặc khả năng (vision, reasoning, cheap...)"
            className="w-full bg-[#111317] border border-[#27292e] rounded pl-9 pr-3 py-2 text-xs text-white placeholder-[#71747d] focus:outline-none focus:border-[#4f80ff]"
          />
        </div>

        {/* Notification Banner */}
        <div className="bg-[#1a1c20] border border-[#27292e] rounded p-2.5 flex items-center space-x-2 text-[11px] text-[#9a9da5]">
          <Cpu size={14} className="text-[#4f80ff]" />
          <span><strong className="text-white">TurboFieldfare</strong> chạy không cần API key. Quét local để kết nối tức thì.</span>
        </div>

        {/* ========================================================
            3. Hai Cột Controls: Model Đang Dùng vs Local AI Trên Máy
        ======================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Cột 1: Model đang dùng */}
          <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-white text-xs">Model đang dùng</h3>
                <p className="text-[11px] text-[#9a9da5]">Cùng catalog với yana-rt; mỗi provider giữ key riêng.</p>
              </div>
              <span className="bg-[#4f80ff]/10 text-[#4f80ff] border border-[#4f80ff]/30 text-[10px] font-mono px-2 py-0.5 rounded flex items-center space-x-1">
                <Cpu size={10} />
                <span>Local</span>
              </span>
            </div>

            {/* Provider Selector */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9a9da5]">Provider</label>
              <div className="relative">
                <select 
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="w-full bg-[#111317] border border-[#27292e] rounded px-3 py-1.5 text-xs text-white appearance-none focus:outline-none focus:border-[#4f80ff]"
                >
                  <option>TurboFieldfare • On-device</option>
                  <option>Ollama • On-device</option>
                  <option>Groq • Cloud LPU</option>
                  <option>Claude • Anthropic</option>
                  <option>OpenAI • OpenAI</option>
                </select>
                <ChevronDown size={12} className="absolute right-3 top-2.5 text-[#71747d] pointer-events-none" />
              </div>
            </div>

            {/* Endpoint */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9a9da5]">Endpoint</label>
              <input 
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="w-full bg-[#111317] border border-[#27292e] rounded px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#4f80ff]"
              />
              <p className="text-[10px] text-[#71747d]">Provider Yana chính thức dùng endpoint cố định. Custom chỉ nhận HTTPS hoặc loopback HTTP.</p>
            </div>

            {/* Model ID */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9a9da5]">Model ID</label>
              <input 
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full bg-[#111317] border border-[#27292e] rounded px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#4f80ff]"
              />
            </div>

            {/* Error Alert Box */}
            <div className="bg-[#ff5f56]/10 border border-[#ff5f56]/30 rounded p-2.5 flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-2 text-[#ff5f56]">
                <AlertTriangle size={13} />
                <span className="font-mono text-[10px]">Error invoking remote method 'studio:discoverModels': TypeError: fetch failed</span>
              </div>
              <button className="bg-[#2b2d32] hover:bg-[#35383e] text-white px-2 py-0.5 rounded text-[10px] transition-colors">
                Thử lại
              </button>
            </div>

            {/* Candidate Badge */}
            <div className="flex justify-between items-center bg-[#111317] p-2 rounded border border-[#27292e] text-[11px]">
              <span className="text-white font-mono">Gemma 4 26B <span className="text-[#71747d]">gemma-4-26b-a4b-it</span></span>
              <span className="text-[10px] font-mono bg-[#2b2d32] px-1.5 py-0.5 rounded text-[#9a9da5]">local</span>
            </div>
            <p className="text-[10px] text-[#71747d]">Gợi ý offline — Studio sẽ thay bằng danh sách tài khoản của bạn ngay khi kết nối được provider.</p>
          </div>

          {/* Cột 2: Local AI trên máy */}
          <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-white text-xs">Local AI trên máy</h3>
                  <p className="text-[11px] text-[#9a9da5]">Dò endpoint từ trusted host, không qua renderer.</p>
                </div>
                <button className="flex items-center space-x-1 text-xs bg-[#2b2d32] hover:bg-[#35383e] text-white px-2.5 py-1 rounded transition-colors">
                  <RefreshCw size={11} />
                  <span>Quét local</span>
                </button>
              </div>
              <p className="text-[11px] text-[#71747d]">Bấm Quét local để tìm 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare và AirLLM.</p>

              {/* Local List */}
              <div className="space-y-2">
                <div className="bg-[#111317] border border-[#27292e] rounded p-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <HardDrive size={15} className="text-[#27c93f]" />
                    <div>
                      <div className="text-white font-semibold text-xs">Ollama Engine</div>
                      <div className="text-[10px] text-[#71747d] font-mono">http://127.0.0.1:11434 • 3 models active</div>
                    </div>
                  </div>
                  <span className="bg-[#27c93f]/10 text-[#27c93f] border border-[#27c93f]/30 text-[10px] font-mono px-2 py-0.5 rounded">
                    CONNECTED
                  </span>
                </div>

                <div className="bg-[#111317] border border-[#27292e] rounded p-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <Laptop size={15} className="text-[#4f80ff]" />
                    <div>
                      <div className="text-white font-semibold text-xs">LM Studio Server</div>
                      <div className="text-[10px] text-[#71747d] font-mono">http://127.0.0.1:1234/v1 • Port ready</div>
                    </div>
                  </div>
                  <span className="bg-[#2b2d32] text-[#9a9da5] text-[10px] font-mono px-2 py-0.5 rounded">
                    KEYLESS READY
                  </span>
                </div>

                <div className="bg-[#111317] border border-[#27292e] rounded p-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <Terminal size={15} className="text-[#9a9da5]" />
                    <div>
                      <div className="text-white font-semibold text-xs">llama.cpp Runtime</div>
                      <div className="text-[10px] text-[#71747d] font-mono">CLI Daemon Standby • GGUF loader</div>
                    </div>
                  </div>
                  <span className="bg-[#2b2d32] text-[#9a9da5] text-[10px] font-mono px-2 py-0.5 rounded">
                    STANDBY
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom info banner */}
            <div className="bg-[#111317] border border-[#27292e] rounded p-2.5 flex justify-between items-center text-[10px] text-[#9a9da5]">
              <span>Tự động tối ưu hoá VRAM và tensor parallelism qua Apple Metal MPS.</span>
              <span className="text-[#27c93f] flex items-center space-x-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f] inline-block animate-pulse"></span>
                <span>Metal VRAM 64GB OK</span>
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================
            Yana Runtime & Security Boundary
        ======================================================== */}
        <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-white text-xs">Yana runtime</h3>
              <p className="text-[11px] text-[#9a9da5]">Studio gọi trực tiếp binary yana-rt, không dùng gateway cũ.</p>
            </div>
            <button className="flex items-center space-x-1 text-xs bg-[#2b2d32] hover:bg-[#35383e] text-white px-2.5 py-1 rounded transition-colors">
              <Folder size={12} />
              <span>Chọn yana-rt</span>
            </button>
          </div>
          <div className="font-mono text-[11px] bg-[#111317] p-2.5 rounded border border-[#27292e] text-[#9a9da5] flex justify-between items-center">
            <span>/Users/vutam/Yana-AI/tools/yana-studio/runtime/yana-rt</span>
            <span className="text-[#27c93f] bg-[#27c93f]/10 border border-[#27c93f]/30 px-2 py-0.5 rounded text-[10px]">ELF v2.4 executable</span>
          </div>
          <div className="flex items-start space-x-2 text-[11px] text-[#9a9da5] pt-1">
            <Shield size={14} className="text-[#4f80ff] mt-0.5 flex-shrink-0" />
            <div>
              <p><strong className="text-white">Ranh giới quyền hạn:</strong> Chat → TurnEngine → RuntimeAuthority → Giám Thị. Terminal vẫn là shell của người dùng và không phải đường thực thi AI.</p>
              <p className="text-[10px] text-[#71747d] mt-0.5">Lưu key: OS encrypted (safeStorage). Key không được trả lại renderer, không nằm trong localStorage hoặc workspace JSON.</p>
            </div>
          </div>
        </div>

        {/* ========================================================
            4. Thư Viện 41 Nhà Cung Cấp (Provider Library - Bento Grid)
        ======================================================== */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-white">Provider library</h2>
                <span className="bg-[#4f80ff]/10 text-[#4f80ff] border border-[#4f80ff]/30 text-[10px] font-mono px-2 py-0.5 rounded">
                  41 TOTAL PROVIDERS LOADED (Cloud, Local & Inference Gateways)
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
          <div className="flex space-x-2 overflow-x-auto pb-1">
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
                className={`px-2.5 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
                  filter === f.id
                    ? 'bg-[#4f80ff] text-white font-medium'
                    : 'bg-[#1a1c20] text-[#9a9da5] hover:text-white border border-[#27292e]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Grid of Providers (3 Cột Chuẩn Bento Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProviders.map(p => (
              <div 
                key={p.id}
                className={`bg-[#1a1c20] border rounded-lg p-3 transition-all hover:border-[#4f80ff]/50 ${
                  p.active ? 'border-[#4f80ff]/50 bg-[#1a1c20]/90 shadow-sm' : 'border-[#27292e]'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-white text-xs flex items-center space-x-1.5">
                      <span>{p.name}</span>
                      {p.active && <span className="w-1.5 h-1.5 rounded-full bg-[#4f80ff]"></span>}
                    </h3>
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

        {/* ========================================================
            5. Mô Hình Mặc Định, Reasoning & Mô Hình Phụ Trợ
        ======================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-white text-xs">Mô hình mặc định — Auto</h3>
            <p className="text-[11px] text-[#9a9da5]">Chat mới dùng mô hình mặc định bên dưới. Chat đang mở đổi model qua model picker trong composer.</p>
            <div className="bg-[#111317] border border-[#27292e] rounded p-2.5 flex justify-between items-center text-xs">
              <span className="text-[#9a9da5]">Auto đang trỏ tới</span>
              <span className="font-mono text-white bg-[#2b2d32] px-2 py-0.5 rounded text-[11px]">groq/openai/gpt-oss-120b</span>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9a9da5]">Reasoning effort</label>
              <div className="bg-[#111317] border border-[#27292e] rounded p-2 text-[#71747d] text-[11px]">
                Chưa khả dụng (yana-rt hiện không nhận tham số reasoning effort)
              </div>
            </div>
          </div>

          <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-2.5">
            <h3 className="font-semibold text-white text-xs">Mô hình phụ trợ</h3>
            <p className="text-[11px] text-[#9a9da5]">11 luồng hỗ trợ kiến trúc roadmap của Yana Studio.</p>
            {[
              { label: 'Phân tích ảnh', desc: 'Chưa có luồng phân tích ảnh riêng' },
              { label: 'Nén context', desc: 'Chưa có bước nén context tách biệt' },
              { label: 'Tìm skills', desc: 'Chưa có công cụ tìm skills bằng model' },
              { label: 'Phê duyệt thông minh', desc: 'Phê duyệt hiện tại do người dùng quyết định thủ công' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center py-1 border-b border-[#27292e]/40 last:border-0">
                <div>
                  <div className="text-white text-xs">{item.label}</div>
                  <div className="text-[10px] text-[#71747d]">{item.desc}</div>
                </div>
                <span className="text-[10px] font-mono bg-[#2b2d32] text-[#71747d] px-2 py-0.5 rounded">Chưa khả dụng</span>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================
            6. Telemetry & Sử Dụng Token
        ======================================================== */}
        <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#4f80ff]">RUNTIME TELEMETRY</span>
              <h3 className="text-sm font-semibold text-white">Sử dụng token</h3>
              <p className="text-[11px] text-[#9a9da5]">Số token do chính provider báo về qua Yana runtime. Đây không phải hạn mức hay hóa đơn của nhà cung cấp.</p>
            </div>
            <button className="flex items-center space-x-1 text-xs text-[#9a9da5] hover:text-white bg-[#2b2d32] px-2.5 py-1 rounded">
              <RefreshCw size={12} />
              <span>Làm mới</span>
            </button>
          </div>

          {/* Numbers boxes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#111317] p-3 rounded border border-[#27292e]">
              <span className="text-[#9a9da5] text-[11px]">Workspace hiện tại</span>
              <div className="text-2xl font-bold text-white mt-1">21.066</div>
              <span className="text-[10px] text-[#71747d]">8 vòng model đã ghi nhận</span>
            </div>
            <div className="bg-[#111317] p-3 rounded border border-[#27292e]">
              <span className="text-[#9a9da5] text-[11px]">Tất cả dự án</span>
              <div className="text-2xl font-bold text-white mt-1">21.066</div>
              <span className="text-[10px] text-[#71747d]">8 vòng model đã ghi nhận</span>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="space-y-2 pt-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#9a9da5]">Token đầu vào</span>
                <span className="font-mono text-white">19.595 (93%)</span>
              </div>
              <div className="h-1.5 w-full bg-[#111317] rounded-full overflow-hidden">
                <div className="h-full bg-[#4f80ff] rounded-full" style={{ width: '93%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#9a9da5]">Token đầu ra</span>
                <span className="font-mono text-white">1.471 (7%)</span>
              </div>
              <div className="h-1.5 w-full bg-[#111317] rounded-full overflow-hidden">
                <div className="h-full bg-[#27c93f] rounded-full" style={{ width: '7%' }}></div>
              </div>
            </div>
          </div>

          {/* Breakdown theo model */}
          <div className="pt-2 border-t border-[#27292e] space-y-2">
            <div className="text-[11px] font-semibold text-white">Theo provider và model</div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <div>
                  <span className="font-mono text-white">openai/gpt-oss-120b</span>
                  <span className="text-[10px] text-[#71747d] ml-2">groq · 7 vòng model đã ghi nhận</span>
                </div>
                <span className="font-mono text-white">17.401</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <div>
                  <span className="font-mono text-white">gemma-4-26b-a4b-it</span>
                  <span className="text-[10px] text-[#71747d] ml-2">turbofieldfare · 1 vòng model đã ghi nhận</span>
                </div>
                <span className="font-mono text-white">3.665</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            7. External Coding Tools & MCP Protocol
        ======================================================== */}
        <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#4f80ff]">HUMAN TERMINAL & MCP PROTOCOL</span>
              <h3 className="text-sm font-semibold text-white">Remote & external tools</h3>
              <p className="text-[11px] text-[#9a9da5]">Dữ liệu đọc từ runtime, PATH và contract đang có trong Yana.</p>
            </div>
            <button className="flex items-center space-x-1 text-xs text-[#9a9da5] hover:text-white bg-[#2b2d32] px-2.5 py-1 rounded">
              <RefreshCw size={12} />
              <span>Làm mới</span>
            </button>
          </div>

          {/* MCP Stdio Status */}
          <div className="bg-[#111317] border border-[#27292e] rounded p-3 flex justify-between items-center">
            <div>
              <div className="text-white font-semibold text-xs">MCP (Model Context Protocol)</div>
              <div className="text-[11px] text-[#71747d]">Opt-in over stdio. Workspace mutations remain governed.</div>
              <div className="font-mono text-[10px] text-[#4f80ff] mt-1">yana-rt mcp</div>
            </div>
            <span className="bg-[#2b2d32] text-[#9a9da5] font-mono text-[10px] px-2 py-0.5 rounded">
              MCP not in this runtime · stdio
            </span>
          </div>

          {/* External Coding Tools Detection */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#9a9da5]">External coding tools detection</span>
              <span className="text-[10px] text-[#71747d] font-mono">Checked via desktop process PATH</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-[#111317] border border-[#27292e] rounded p-2 text-center">
                <div className="flex items-center justify-center text-[#27c93f] mb-1">
                  <CheckCircle size={14} />
                </div>
                <div className="text-white font-semibold text-[11px]">Claude Code</div>
                <div className="text-[9px] text-[#71747d] truncate font-mono">/usr/local/bin/claude</div>
              </div>

              <div className="bg-[#111317] border border-[#27292e] rounded p-2 text-center">
                <div className="flex items-center justify-center text-[#71747d] mb-1">
                  <XCircle size={14} />
                </div>
                <div className="text-[#9a9da5] font-semibold text-[11px]">Codex</div>
                <div className="text-[9px] text-[#71747d] font-mono">Not found</div>
              </div>

              <div className="bg-[#111317] border border-[#27292e] rounded p-2 text-center">
                <div className="flex items-center justify-center text-[#71747d] mb-1">
                  <XCircle size={14} />
                </div>
                <div className="text-[#9a9da5] font-semibold text-[11px]">Cursor</div>
                <div className="text-[9px] text-[#71747d] font-mono">Not found</div>
              </div>

              <div className="bg-[#111317] border border-[#27292e] rounded p-2 text-center">
                <div className="flex items-center justify-center text-[#71747d] mb-1">
                  <XCircle size={14} />
                </div>
                <div className="text-[#9a9da5] font-semibold text-[11px]">Antigravity</div>
                <div className="text-[9px] text-[#71747d] font-mono">Not found</div>
              </div>

              <div className="bg-[#111317] border border-[#27292e] rounded p-2 text-center">
                <div className="flex items-center justify-center text-[#27c93f] mb-1">
                  <CheckCircle size={14} />
                </div>
                <div className="text-white font-semibold text-[11px]">Gemini CLI</div>
                <div className="text-[9px] text-[#71747d] truncate font-mono">/opt/homebrew/bin/gemini</div>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* ========================================================
          Footer Status Bar (Đáy màn hình chuẩn IDE)
      ======================================================== */}
      <footer className="h-6 bg-[#0c0e12] border-t border-[#27292e] flex items-center justify-between px-3 text-[10px] text-[#71747d] font-mono select-none sticky bottom-0 z-50">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1 text-[#27c93f]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]"></span>
            <span>yana-rt v2.4 (active daemon)</span>
          </span>
          <span>RAM: 4.2 / 64 GB</span>
          <span className="text-[#4f80ff]">Active Model: gemma-4-26b-a4b-it (Local)</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>TurnEngine: Deterministic L1</span>
          <span>UTF-8</span>
          <span>Spaces: 2</span>
        </div>
      </footer>
    </div>
  );
};

export default ModelsAndRuntimeSettings;
```

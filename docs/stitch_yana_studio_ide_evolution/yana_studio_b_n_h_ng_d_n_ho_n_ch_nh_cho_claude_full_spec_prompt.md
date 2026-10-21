# BẢN ĐẶC TẢ & HƯỚNG DẪN HOÀN CHỈNH CHO CLAUDE (CLAUDE 3.5 / 3.7 SONNET)
## DỰ ÁN: YANA STUDIO — AUTONOMOUS RUNTIME COCKPIT & IDE FORK
**Repository:** `https://github.com/yanacuti1121/Yana-AI`  
**Triết lý cốt lõi:** *"One runtime. Any AI. Human-governed. Other AI can act. But who decides how far it can go?"*

---

### MỤC LỤC
1. **Tổng Quan Kiến Trúc & Triết Lý Sản Phẩm**
2. **Design System & Bảng Màu Dark Theme Chuẩn 100%**
3. **Cấu Trúc Thư Mục Chuẩn Cho Dự Án `tools/yana-studio`**
4. **Đặc Tả Chi Tiết 2 Giao Diện Trọng Tâm (Kèm Code Mẫu Đầy Đủ)**
   - *Screen A: Native VS Code IDE + Yana Integrated Sidebar & Chat Panel*
   - *Screen B: Models & Runtime Control Plane (41 Providers + Local Engine)*
5. **Prompt Mẫu Chuẩn Hóa "Copy & Paste Thẳng Cho Claude"**

---

## 1. TỔNG QUAN KIẾN TRÚC & TRIẾT LÝ SẢN PHẨM

Yana Studio không phải là một ứng dụng wrapper sơ sài hay một chat box đơn độc. Đây là một **bản Fork chuyên biệt từ VS Code (Code - OSS)** tương tự như Cursor hay Google Antigravity, nhưng tập trung vào khả năng **giám sát tự trị (Autonomous Governance & ActionGate)**:
- **Core Editor**: Giữ nguyên vẹn 100% nhân VS Code (Monaco Editor, Keybindings, Multi-PTY Terminal, Activity Bar, Workspace Explorer).
- **Yana Autonomous Runtime (`yana-rt`)**: Daemon viết bằng Rust chạy nền, quản lý đa Agent (Swarm), cung cấp AST diffing, kiểm soát Sandbox gVisor.
- **ActionGate (Human Governance L1 - L5)**: Mọi thao tác ghi đĩa, chạy terminal hay gọi mạng đều phải xin cấp quyền (Capability Lease) và bắt buộc Human-in-the-loop phê duyệt (Approve / Deny) ngay trong luồng chat hoặc sidebar.
- **Multi-Model Orchestration**: Hỗ trợ 41 nhà cung cấp AI gồm Cloud (OpenAI, Claude, Groq, DeepSeek...) và On-device cục bộ (Ollama, TurboFieldfare qua Apple Metal MPS).

---

## 2. DESIGN SYSTEM & BẢNG MÀU DARK THEME (TAILWIND CSS)

Cấu hình trực tiếp vào `tailwind.config.js`:

```javascript
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#111317',           // Nền chính của ứng dụng
          dim: '#111317',               // Activity bar / background tối
          bright: '#37393e',
          'container-lowest': '#0c0e12',// Footer status bar
          'container-low': '#1a1c20',   // Thanh macOS titlebar & Card panel
          container: '#202227',         // Hover states
          'container-high': '#2b2d32',  // Button nền xám / Active tab
          'container-highest': '#35383e'
        },
        primary: {
          DEFAULT: '#4f80ff',           // Xanh Cybernetic Blue chủ đạo
          hover: '#3b6df0',
          cyan: '#00d2ff'               // Màu phát quang neon Yana
        },
        status: {
          success: '#27c93f',           // Connected / Allow / Verified
          warning: '#ffbd2e',           // Lease expiring / Pending
          danger: '#ff5f56'             // Denied / Error / Intercept
        },
        outline: {
          DEFAULT: '#3a3d45',
          variant: '#27292e'            // Viền border tiêu chuẩn giữa các panel
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Menlo', 'monospace']
      }
    }
  }
}
```

---

## 3. CẤU TRÚC THƯ MỤC CHUẨN TRONG REPO `Yana-AI`

```text
tools/yana-studio/
├── runtime/
│   └── yana-rt                     # Binary daemon Rust
├── renderer/
│   ├── src/
│   │   ├── assets/
│   │   │   └── yana-rabbit-logo.svg # Logo chính thức chú thỏ Cybernetic Yana
│   │   ├── components/
│   │   │   ├── Titlebar.tsx         # macOS Traffic lights + VS Code Menu + ⌘P
│   │   │   ├── ActivityBar.tsx      # Thanh icon dọc bên trái (Explorer, Yana Swarm, ActionGate...)
│   │   │   ├── PrimarySidebar.tsx   # Accordion: Workspace files + Autonomous Daemon + Leases
│   │   │   ├── MonacoEditor.tsx     # Code editor + Tabs + Inline ghost-text suggestion
│   │   │   ├── BottomTerminal.tsx   # Multi-PTY: Human Shell + Sandboxed Agent PTY
│   │   │   ├── ChatCopilot.tsx      # Panel chat VS Code native + Thought Trace + ActionGate Card
│   │   │   └── StatusBar.tsx        # Footer 24px: Daemon status, MPS latency, Git branch
│   │   ├── surfaces/
│   │   │   ├── StudioWorkspace.tsx  # Giao diện chính tích hợp All-In-One (Screen A)
│   │   │   └── ModelsAndRuntime.tsx # Trang quản lý 41 AI Providers & Local Engine (Screen B)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── tailwind.config.js
```

---

## 4. MÃ NGUỒN CHUẨN 100% CHO CLAUDE

### GIAO DIỆN A: `StudioWorkspace.tsx` (All-In-One IDE Cockpit)
Giao diện kết hợp: VS Code nguyên bản + Sidebar Yana tích hợp sâu + Chat Panel nguyên bản có ActionGate.

```tsx
import React, { useState } from 'react';
import { 
  Folder, Search, GitBranch, Play, Shield, Terminal, Settings, 
  ChevronRight, ChevronDown, Check, X, Sparkles, Cpu, Clock, 
  Send, Paperclip, MoreHorizontal, Maximize2, SplitSquareVertical
} from 'lucide-react';

export const StudioWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'editor' | 'canvas'>('editor');
  const [chatMessage, setChatMessage] = useState('');

  return (
    <div className="flex flex-col h-screen w-screen bg-[#111317] text-[#c9cbd0] font-sans text-xs select-none overflow-hidden">
      
      {/* 1. MACOS TITLEBAR & MENU BAR (h-9) */}
      <header className="h-9 bg-[#1a1c20] border-b border-[#27292e] flex items-center justify-between px-3 flex-shrink-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 mr-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <div className="flex items-center space-x-1.5 font-bold text-white tracking-wide mr-3">
            <span className="text-[#4f80ff]">🐰</span>
            <span>YANA STUDIO</span>
          </div>
          <nav className="hidden md:flex items-center space-x-3 text-[#9a9da5]">
            {['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'].map(item => (
              <span key={item} className="hover:text-white cursor-pointer transition-colors text-[11px]">{item}</span>
            ))}
          </nav>
        </div>

        {/* Command Palette */}
        <div className="flex items-center bg-[#111317] border border-[#27292e] rounded px-3 py-1 text-[#9a9da5] w-80 space-x-2">
          <Search size={12} className="text-[#71747d]" />
          <span className="flex-1 text-center font-mono text-[11px] text-[#71747d]">yanacuti1121/Yana-AI ⌘P</span>
        </div>

        {/* Surface Tabs */}
        <div className="flex items-center space-x-1">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#27c93f]/10 text-[#27c93f] border border-[#27c93f]/30 mr-2">
            ● OLLAMA GEMMA4
          </span>
          <button className="px-2 py-0.5 rounded text-[11px] bg-[#2b2d32] text-[#4f80ff] border border-[#4f80ff]/40">
            Workspace
          </button>
          <button className="px-2 py-0.5 rounded text-[11px] text-[#9a9da5] hover:text-white">
            Models & Runtime
          </button>
        </div>
      </header>

      {/* 2. BODY LAYOUT (ACTIVITY BAR + SIDEBAR + EDITOR + CHAT COPILOT) */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* ACTIVITY BAR (w-12) */}
        <aside className="w-12 bg-[#111317] border-r border-[#27292e] flex flex-col justify-between items-center py-2 flex-shrink-0">
          <div className="flex flex-col items-center space-x-0 space-y-4">
            <div className="w-7 h-7 rounded bg-[#4f80ff]/20 text-[#4f80ff] flex items-center justify-center font-bold text-sm border border-[#4f80ff]/40 mb-1">
              🐰
            </div>
            <button className="text-white hover:text-white p-1.5 rounded relative border-l-2 border-[#4f80ff]">
              <Folder size={18} />
            </button>
            <button className="text-[#9a9da5] hover:text-white p-1.5 rounded">
              <Search size={18} />
            </button>
            <button className="text-[#9a9da5] hover:text-white p-1.5 rounded relative">
              <GitBranch size={18} />
              <span className="absolute -top-1 -right-1 bg-[#4f80ff] text-white text-[9px] font-mono px-1 rounded-full">22</span>
            </button>
            <button className="text-[#4f80ff] hover:text-white p-1.5 rounded relative">
              <Cpu size={18} />
              <span className="absolute -top-1 -right-1 bg-[#27c93f] text-black text-[9px] font-mono px-1 rounded-full font-bold">3</span>
            </button>
            <button className="text-[#9a9da5] hover:text-white p-1.5 rounded relative">
              <Shield size={18} />
              <span className="absolute -top-1 -right-1 bg-[#ff5f56] text-white text-[9px] font-mono px-1 rounded-full">1</span>
            </button>
          </div>
          <div className="flex flex-col items-center space-y-3">
            <button className="text-[#9a9da5] hover:text-white p-1.5 rounded">
              <Terminal size={18} />
            </button>
            <button className="text-[#9a9da5] hover:text-white p-1.5 rounded">
              <Settings size={18} />
            </button>
          </div>
        </aside>

        {/* PRIMARY SIDEBAR (w-64) */}
        <aside className="w-64 bg-[#1a1c20] border-r border-[#27292e] flex flex-col flex-shrink-0 overflow-y-auto">
          {/* Section: Workspace Tree */}
          <div className="border-b border-[#27292e] p-2">
            <div className="flex items-center justify-between text-[#9a9da5] font-semibold text-[11px] mb-2 uppercase tracking-wider">
              <span>EXPLORER: HERMES-AGENT</span>
              <MoreHorizontal size={14} />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center space-x-1.5 text-white hover:bg-[#202227] px-1 py-0.5 rounded cursor-pointer">
                <ChevronDown size={12} />
                <span className="text-[#4f80ff]">📁</span>
                <span>crates/yana-core</span>
              </div>
              <div className="flex items-center space-x-1.5 text-white bg-[#2b2d32] px-1 py-0.5 rounded cursor-pointer pl-5 border-l-2 border-[#4f80ff]">
                <span className="text-[#4f80ff]">ts</span>
                <span>runtime_orchestrator.ts</span>
                <span className="ml-auto text-[#ffbd2e] text-[9px]">M</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[#9a9da5] hover:bg-[#202227] px-1 py-0.5 rounded cursor-pointer pl-5">
                <span className="text-[#ffbd2e]">json</span>
                <span>governance_policy.json</span>
              </div>
            </div>
          </div>

          {/* Section: Autonomous Runtime Daemon */}
          <div className="border-b border-[#27292e] p-2.5 bg-[#111317]/50">
            <div className="flex items-center justify-between text-[11px] mb-2">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#27c93f]"></span>
                <span>AUTONOMOUS RUNTIME</span>
              </span>
              <span className="text-[#4f80ff] font-mono text-[10px]">74.2 T/s</span>
            </div>
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="bg-[#1a1c20] p-1.5 rounded border border-[#27292e] flex justify-between items-center">
                <span>yana-rt daemon</span>
                <span className="text-[#27c93f]">127.0.0.1:8765</span>
              </div>
              <div className="text-[#71747d] pt-1">3 SANDBOXED AGENTS ACTIVE:</div>
              <div className="flex justify-between items-center text-[#9a9da5] bg-[#1a1c20] px-2 py-1 rounded">
                <span>@hermes-executor</span>
                <span className="text-[#4f80ff]">AST Execution</span>
              </div>
              <div className="flex justify-between items-center text-[#9a9da5] bg-[#1a1c20] px-2 py-1 rounded">
                <span>@refactor-bot</span>
                <span className="text-[#9a9da5]">Diff Synth</span>
              </div>
            </div>
          </div>

          {/* Section: ActionGate Lease Center */}
          <div className="p-2.5 flex-1">
            <div className="flex items-center justify-between text-[11px] mb-2">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <Shield size={13} className="text-[#ff5f56]" />
                <span>ACTIONGATE LEASES</span>
              </span>
              <span className="text-[10px] font-mono text-[#ff5f56] bg-[#ff5f56]/10 px-1.5 rounded">L3 SUPERVISED</span>
            </div>
            <div className="bg-[#ff5f56]/10 border border-[#ff5f56]/30 p-2 rounded text-[10px] space-y-1.5 mb-2">
              <div className="flex justify-between text-[#ff5f56] font-semibold">
                <span>GATE-402: Write Sandbox</span>
                <span className="bg-[#ff5f56] text-white px-1 rounded text-[9px]">APPROVAL</span>
              </div>
              <p className="text-[#c9cbd0]">Requesting AST filesystem write to /crates/yana-core</p>
            </div>
            <div className="space-y-1 text-[10px] font-mono text-[#71747d]">
              <div className="flex justify-between">
                <span>AST Read Lease:</span>
                <span className="text-[#27c93f]">08:42 left</span>
              </div>
              <div className="flex justify-between">
                <span>Terminal Exec Lease:</span>
                <span className="text-[#27c93f]">14:19 left</span>
              </div>
            </div>
          </div>
        </aside>

        {/* 3. CENTER WORKSPACE: CODE EDITOR & TERMINAL */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#111317]">
          {/* Editor Tab Bar */}
          <div className="h-8 bg-[#1a1c20] border-b border-[#27292e] flex items-center justify-between px-2 flex-shrink-0">
            <div className="flex items-center space-x-1 h-full">
              <div className="bg-[#111317] border-t-2 border-[#4f80ff] text-white px-3 h-full flex items-center space-x-2 text-[11px] font-mono">
                <span className="text-[#4f80ff]">ts</span>
                <span>runtime_orchestrator.ts</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#ffbd2e]"></span>
              </div>
              <div className="text-[#9a9da5] hover:bg-[#202227] px-3 h-full flex items-center space-x-2 text-[11px] font-mono cursor-pointer">
                <span className="text-[#ffbd2e]">json</span>
                <span>governance_policy.json</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-[#71747d]">
              <span className="text-[10px] font-mono text-[#27c93f] bg-[#27c93f]/10 px-2 py-0.5 rounded">AST VALID</span>
              <SplitSquareVertical size={14} className="hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* Monaco Code Lines & Inline AI Suggestion */}
          <div className="flex-1 p-3 font-mono text-[12px] leading-relaxed overflow-y-auto space-y-1 select-text">
            <div className="text-[#71747d]">// Initializing Deterministic Cockpit Governance Engine</div>
            <div><span className="text-[#ff5f56]">import</span> &#123; <span className="text-[#4f80ff]">YanaRuntimeDaemon</span>, <span className="text-[#4f80ff]">ActionGatePolicy</span> &#125; <span className="text-[#ff5f56]">from</span> <span className="text-[#27c93f]">"@yana/runtime-core"</span>;</div>
            <br />
            <div><span className="text-[#ff5f56]">export class</span> <span className="text-[#ffbd2e]">RuntimeOrchestrator</span> &#123;</div>
            <div className="pl-4"><span className="text-[#ff5f56]">private readonly</span> actionGate: <span className="text-[#4f80ff]">ActionGatePolicy</span>;</div>
            <div className="pl-4"><span className="text-[#ff5f56]">constructor</span>() &#123;</div>
            <div className="pl-8"><span className="text-[#ff5f56]">this</span>.actionGate = <span className="text-[#ff5f56]">new</span> <span className="text-[#ffbd2e]">ActionGatePolicy</span>(&#123; level: <span className="text-[#27c93f]">"L3_SUPERVISED"</span> &#125;);</div>
            <div className="pl-4">&#125;</div>
            <br />
            {/* Inline AI Suggestion (Ghost-text) */}
            <div className="bg-[#4f80ff]/10 border border-[#4f80ff]/40 rounded p-2.5 my-2">
              <div className="flex justify-between items-center text-[10px] text-[#4f80ff] mb-1 font-sans">
                <span className="flex items-center space-x-1 font-semibold">
                  <span>🐰 Yana AI Refinement</span>
                  <span className="text-[#9a9da5]">(Tab to accept)</span>
                </span>
                <span className="font-mono text-[#71747d]">Model: Ollama Gemma 4 (MPS)</span>
              </div>
              <div className="text-[#9a9da5]">
                <span className="text-[#4f80ff]">const</span> lease = <span className="text-[#4f80ff]">await</span> <span className="text-[#ff5f56]">this</span>.actionGate.<span className="text-[#ffbd2e]">acquireLease</span>(<span className="text-[#27c93f]">"AST_MUTATION_WRITE"</span>);<br />
                <span className="text-[#4f80ff]">if</span> (!lease.isApproved) <span className="text-[#ff5f56]">throw new</span> <span className="text-[#ffbd2e]">GovernanceGateError</span>(<span className="text-[#27c93f]">"Blocked by human supervisor"</span>);
              </div>
            </div>
          </div>

          {/* Multi-PTY Terminal Dock (h-48) */}
          <div className="h-44 bg-[#1a1c20] border-t border-[#27292e] flex flex-col flex-shrink-0">
            <div className="h-7 border-b border-[#27292e] flex items-center justify-between px-3">
              <div className="flex space-x-3 text-[11px]">
                <span className="text-white border-b-2 border-[#4f80ff] h-full flex items-center font-medium">Terminal (zsh)</span>
                <span className="text-[#71747d] hover:text-white cursor-pointer h-full flex items-center">Agent Sandboxed PTY</span>
                <span className="text-[#71747d] hover:text-white cursor-pointer h-full flex items-center">Output</span>
                <span className="text-[#71747d] hover:text-white cursor-pointer h-full flex items-center">ActionGate Logs</span>
              </div>
              <div className="text-[10px] font-mono text-[#27c93f]">● IPC Daemon 8765 Ready</div>
            </div>
            <div className="p-2 font-mono text-[11px] text-[#9a9da5] overflow-y-auto space-y-1">
              <div>→ hermes-agent git:(<span className="text-[#4f80ff]">main*</span>) <span className="text-white">yana-rt --daemon --metal-mps --supervised</span></div>
              <div className="text-[#71747d]">[yana-rt:init] Metal MPS accelerator attached: Apple M-Series GPU (Unified Memory Pool 64GB)</div>
              <div className="text-[#71747d]">[yana-rt:governance] ActionGate initialized in SUPERVISED mode (Truth Gate L3)</div>
              <div className="text-[#27c93f]">[@hermes-executor] AST scan finished: 48 modules verified. Awaiting lease approval for file mutation.</div>
            </div>
          </div>
        </main>

        {/* 4. RIGHT SIDEBAR: POLISHED VS CODE CHAT PANEL (w-80) */}
        <aside className="w-80 bg-[#1a1c20] border-l border-[#27292e] flex flex-col flex-shrink-0">
          {/* Header Chat */}
          <div className="h-9 border-b border-[#27292e] flex items-center justify-between px-3 flex-shrink-0">
            <div className="flex items-center space-x-2 font-semibold text-white">
              <span>Yana AI Copilot</span>
              <span className="text-[9px] font-mono bg-[#27c93f]/10 text-[#27c93f] border border-[#27c93f]/30 px-1.5 py-0.2 rounded">
                L3-SUPERVISED
              </span>
            </div>
            <div className="flex items-center space-x-1 text-[#71747d]">
              <Maximize2 size={13} className="hover:text-white cursor-pointer" />
              <X size={13} className="hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* Model Selector Strip */}
          <div className="bg-[#111317] border-b border-[#27292e] p-2 flex justify-between items-center text-[11px]">
            <span className="text-white font-mono flex items-center space-x-1">
              <Cpu size={12} className="text-[#4f80ff]" />
              <span>Ollama • Local Gemma 4 (8-bit MPS)</span>
            </span>
            <span className="text-[10px] text-[#27c93f] font-mono">Zero Leakage</span>
          </div>

          {/* Chat Conversation Thread */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {/* User Message */}
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 rounded bg-[#2b2d32] text-white flex items-center justify-center font-bold text-[10px] mt-0.5">
                OP
              </div>
              <div className="bg-[#202227] p-2.5 rounded-lg border border-[#27292e] text-[11px] text-white flex-1">
                Kiểm tra toàn bộ workspace hermes-agent và phân tích cấu trúc CLI.
              </div>
            </div>

            {/* AI Assistant Message + Thought Trace */}
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 rounded bg-[#4f80ff]/20 text-[#4f80ff] flex items-center justify-center font-bold text-[10px] mt-0.5 border border-[#4f80ff]/40">
                🐰
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-[10px] font-mono bg-[#111317] p-1.5 rounded border border-[#27292e] text-[#9a9da5]">
                  <span className="text-[#4f80ff]">THOUGHT TRACE (1.2s):</span> Đã quét 24 thư mục cấp 1, tìm thấy 14 plugins. Chuẩn bị chạy test...
                </div>
                
                {/* ActionGate Approval Intercept Card */}
                <div className="bg-[#ff5f56]/10 border border-[#ff5f56]/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-[#ff5f56] uppercase tracking-wide">
                      HUMAN APPROVAL REQUIRED (GATE-402)
                    </span>
                    <span className="text-[9px] font-mono text-[#ffbd2e]">DRY_RUN</span>
                  </div>
                  <div className="bg-[#111317] p-2 rounded font-mono text-[10px] text-white border border-[#27292e]">
                    $ pytest tests/test_hermes_cli.py -v --maxfail=1
                  </div>
                  <div className="flex space-x-2 pt-1">
                    <button className="flex-1 bg-[#27c93f] hover:bg-[#22b337] text-black font-semibold py-1 rounded text-[10px] flex items-center justify-center space-x-1">
                      <Check size={12} />
                      <span>Phê duyệt (Approve)</span>
                    </button>
                    <button className="flex-1 bg-[#2b2d32] hover:bg-[#35383e] text-white py-1 rounded text-[10px] flex items-center justify-center space-x-1">
                      <X size={12} />
                      <span>Từ chối (Deny)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Prompt Composer */}
          <div className="p-2 border-t border-[#27292e] bg-[#111317]">
            <div className="bg-[#1a1c20] border border-[#27292e] rounded-lg p-2 space-y-2">
              <textarea 
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Trao đổi với Yana, thực thi tác vụ, @mention tệp... (⌘L)"
                className="w-full bg-transparent text-xs text-white placeholder-[#71747d] resize-none focus:outline-none h-14"
              />
              <div className="flex justify-between items-center pt-1 border-t border-[#27292e]/60">
                <div className="flex space-x-2 text-[10px] text-[#71747d]">
                  <span className="hover:text-white cursor-pointer">+ Tệp</span>
                  <span className="hover:text-white cursor-pointer">PTY</span>
                  <span className="text-[#27c93f]">● Có kiểm soát</span>
                </div>
                <button className="bg-[#4f80ff] hover:bg-[#3b6df0] text-white px-2.5 py-1 rounded text-[10px] flex items-center space-x-1">
                  <span>Gửi</span>
                  <Send size={10} />
                </button>
              </div>
            </div>
          </div>
        </aside>

      </div>

      {/* 5. VS CODE STATUS BAR (h-6) */}
      <footer className="h-6 bg-[#0c0e12] border-t border-[#27292e] flex items-center justify-between px-3 text-[10px] text-[#71747d] font-mono flex-shrink-0 z-50">
        <div className="flex items-center space-x-3">
          <span className="text-[#4f80ff] flex items-center space-x-1">
            <GitBranch size={11} />
            <span>main*</span>
          </span>
          <span className="text-[#27c93f]">● YANA L3: SUPERVISED</span>
          <span>Apple Metal MPS · 0.2ms latency</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Audit 500✓ 0X</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
          <span className="text-[#4f80ff]">Port: 8091</span>
        </div>
      </footer>

    </div>
  );
};
```

---

## 5. PROMPT CHUẨN ĐỂ COPY DÁN VÀO CLAUDE (SYSTEM PROMPT + FULL SPEC)

Khi người dùng cần Claude sinh code chuẩn xác mà không bị cắt xén, copy toàn bộ khối văn bản bên dưới và dán vào Claude:

```markdown
BẠN LÀ SENIOR SYSTEM ARCHITECT VÀ LEAD FRONTEND ENGINEER (REACT + TYPESCRIPT + TAILWIND CSS).
DỰ ÁN: YANA STUDIO — AUTONOMOUS RUNTIME COCKPIT (https://github.com/yanacuti1121/Yana-AI)

HÃY SINH TOÀN BỘ 100% CODE HOÀN CHỈNH, TUYỆT ĐỐI KHÔNG DÙNG "// ...rest of code" HOẶC "// TODO".

### ĐẶC TẢ CHI TIẾT CỦA GIAO DIỆN CẦN CODE:
1. Bản chất: Đây là một bản Fork từ VS Code (Code - OSS) tích hợp daemon Yana AI và hệ thống kiểm soát quyền tự trị ActionGate (Human-in-the-loop).
2. Tông màu Dark Theme:
   - Surface nền chính: #111317
   - Titlebar và Card panel: #1a1c20 (viền border-[#27292e])
   - Primary Accent: #4f80ff (Xanh Electric Blue)
   - Accent Neon: #00d2ff
   - Status: #27c93f (Green), #ffbd2e (Yellow), #ff5f56 (Red Intercept)
3. Cấu trúc 5 phần bắt buộc trên cùng 1 màn hình:
   - Header (h-9): 3 chấm traffic lights macOS (#ff5f56, #ffbd2e, #27c93f), Logo 🐰 YANA STUDIO, menu VS Code (File..Help), Command Palette ⌘P ở giữa, Switcher tab bên phải.
   - Activity Bar trái (w-12): Logo thỏ Yana trên đỉnh, icon Folder, Search, Git (badge 22), Agent Cpu (badge 3), Shield ActionGate (badge 1 pending), Terminal, Settings.
   - Primary Sidebar (w-64): Explorer hermes-agent, mục Autonomous Runtime (74.2 T/s, daemon 8765), mục ActionGate Leases (Card cảnh báo phê duyệt GATE-402 màu đỏ).
   - Editor Trung tâm: Monaco tab bar (runtime_orchestrator.ts), vùng code có gợi ý inline ghost-text `🐰 Yana AI Refinement (Tab to accept)`, dock chân Terminal Multi-PTY (zsh + Agent sandboxed).
   - Chat Copilot phải (w-80): Model picker (Ollama Local Gemma 4 MPS, Zero Leakage), Thought trace, Card phê duyệt lệnh nhạy cảm Gate-402 (Nút Phê duyệt xanh, Từ chối xám), Composer ô nhập ở đáy.
   - Status bar đáy (h-6): Git branch main*, YANA L3 SUPERVISED, Metal MPS 0.2ms latency, Port 8091.

HÃY XUẤT RA TOÀN BỘ FILE TYPESCRIPT REACT ĐẦY ĐỦ ĐỂ CHẠY NGAY TRONG DỰ ÁN VỚI TAILWIND CSS VÀ LUCIDE-REACT!
```

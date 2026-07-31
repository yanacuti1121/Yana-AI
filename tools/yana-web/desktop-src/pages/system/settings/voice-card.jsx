// Yana AI — Settings: Voice & Speech card
import React from 'react';
import { L, Card } from '../../../components.jsx';
import { YSeg } from './atoms.jsx';

const VOICE_LANGS = [
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ko-KR", label: "한국어" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
];

const SPEED_OPTS_MAP = {
  "Tiếng Việt": ["Chậm", "Bình thường", "Nhanh"],
  "한국어": ["느림", "보통", "빠름"],
  "中文": ["慢", "正常", "快"],
};

export function VoiceCard({ lang }) {
  const isVI = lang === "Tiếng Việt";
  const speedOpts = SPEED_OPTS_MAP[lang] || ["Slow", "Normal", "Fast"];
  const speedRate = { [speedOpts[0]]: 0.7, [speedOpts[1]]: 1.0, [speedOpts[2]]: 1.4 };

  const defaultVoiceLang = { "Tiếng Việt": "vi-VN", "한국어": "ko-KR", "中文": "zh-CN" }[lang] || "en-US";
  const [voiceLang, setVoiceLang] = React.useState(
    () => localStorage.getItem("yana.voice.lang") || defaultVoiceLang
  );
  const [speed, setSpeed] = React.useState(
    () => localStorage.getItem("yana.voice.speed") || speedOpts[1]
  );
  const [voices, setVoices] = React.useState([]);
  const [selected, setSelected] = React.useState(
    () => localStorage.getItem("yana.voice.name") || ""
  );
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    function loadVoices() {
      const all = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const prefix = voiceLang.split("-")[0];
      const filtered = all.filter(v => v.lang.startsWith(prefix));
      setVoices(filtered);
      if (filtered.length > 0 && !filtered.find(v => v.name === selected)) {
        setSelected(filtered[0].name);
        localStorage.setItem("yana.voice.name", filtered[0].name);
      }
    }
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => { if (window.speechSynthesis) window.speechSynthesis.removeEventListener("voiceschanged", loadVoices); };
  }, [voiceLang]);

  function persist(key, val) {
    localStorage.setItem(key, val);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key, value: val } }));
  }

  function testVoice() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      { "Tiếng Việt": "Xin chào, tôi là Yana AI. Bạn nghe rõ không?", "한국어": "안녕하세요, 저는 Yana AI입니다. 잘 들리나요?", "中文": "你好，我是 Yana AI。你能听清楚吗？" }[lang] || "Hello, I am Yana AI. Can you hear me clearly?"
    );
    utter.lang = voiceLang;
    utter.rate = speedRate[speed] || 1.0;
    const v = voices.find(v => v.name === selected);
    if (v) utter.voice = v;
    setTesting(true);
    utter.onend = () => setTesting(false);
    utter.onerror = () => setTesting(false);
    window.speechSynthesis.speak(utter);
  }

  const hasTTS = !!window.speechSynthesis;

  return (
    <Card title={L("Voice & Speech", "Giọng nói & Phản hồi", "음성 및 스피치", "语音与语音输出")}>
      {!hasTTS && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "8px 0 4px" }}>
          {L("Text-to-speech is not available in this browser.", "Trình duyệt này chưa hỗ trợ đọc văn bản.", "이 브라우저에서는 텍스트 음성 변환을 사용할 수 없습니다.", "此浏览器不支持文字转语音。")}
        </div>
      )}

      {/* Language */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Language", "Ngôn ngữ giọng nói", "음성 언어", "语音语言")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Language for text-to-speech output", "Ngôn ngữ cho đầu ra giọng nói", "텍스트 음성 변환에 사용할 언어", "文字转语音输出所用的语言")}</div>
        </div>
        <select value={voiceLang} onChange={e => { setVoiceLang(e.target.value); persist("yana.voice.lang", e.target.value); }}
          style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          {VOICE_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Voice */}
      {voices.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Voice", "Giọng đọc", "음성", "语音")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{voices.length + L(" voices available", " giọng khả dụng", "개 음성 사용 가능", " 个可用语音")}</div>
          </div>
          <select value={selected} onChange={e => { setSelected(e.target.value); persist("yana.voice.name", e.target.value); }}
            style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 200 }}>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </div>
      )}

      {/* Speed */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Speed", "Tốc độ", "속도", "速度")}</div>
        <YSeg options={speedOpts} value={speed} onChange={v => { setSpeed(v); persist("yana.voice.speed", v); }} />
      </div>

      {/* Test */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "calc(10px * var(--sp))" }}>
        <button onClick={testVoice} disabled={testing || !hasTTS} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "7px 16px",
          borderRadius: 99, border: "1px solid var(--border)", cursor: testing || !hasTTS ? "default" : "pointer",
          background: testing ? "var(--primary-soft)" : "transparent",
          color: "var(--primary)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit",
          opacity: !hasTTS ? 0.4 : 1, transition: "background .15s",
        }}>
          {testing ? "🔊 " + L("Speaking…", "Đang đọc…", "말하는 중…", "朗读中…") : "▶ " + L("Test voice", "Thử giọng", "음성 테스트", "试听语音")}
        </button>
      </div>
    </Card>
  );
}

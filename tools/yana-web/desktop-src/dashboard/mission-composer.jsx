// Yana AI — Dashboard: the mission composer (greeting, local weather, quick-start input)
import React from 'react';
import { L, Icons } from '../components.jsx';

function greetingFor(hour, name) {
  const who = name ? ", " + name : "";
  if (hour >= 5  && hour < 12) return L("Good morning" + who,   "Chào buổi sáng" + who, "좋은 아침이에요" + who, "早上好" + who);
  if (hour >= 12 && hour < 18) return L("Good afternoon" + who, "Chào buổi chiều" + who, "좋은 오후예요" + who, "下午好" + who);
  if (hour >= 18 && hour < 22) return L("Good evening" + who,   "Chào buổi tối" + who, "좋은 저녁이에요" + who, "晚上好" + who);
  return L("Up late" + who, "Khuya rồi" + who, "늦은 시간이네요" + who, "夜深了" + who);
}

// WMO weather codes → emoji + label (open-meteo current.weather_code)
function describeWeather(code) {
  if (code === 0)              return ["☀️", L("Clear", "Quang đãng", "맑음", "晴")];
  if (code <= 2)               return ["⛅", L("Partly cloudy", "Ít mây", "구름 조금", "多云")];
  if (code === 3)              return ["☁️", L("Overcast", "Nhiều mây", "흐림", "阴")];
  if (code === 45 || code === 48) return ["🌫️", L("Fog", "Sương mù", "안개", "雾")];
  if (code <= 57)              return ["🌦️", L("Drizzle", "Mưa phùn", "이슬비", "毛毛雨")];
  if (code <= 67)              return ["🌧️", L("Rain", "Mưa", "비", "雨")];
  if (code <= 77)              return ["🌨️", L("Snow", "Tuyết", "눈", "雪")];
  if (code <= 82)              return ["🌧️", L("Showers", "Mưa rào", "소나기", "阵雨")];
  if (code <= 86)              return ["🌨️", L("Snow showers", "Mưa tuyết", "소낙눈", "阵雪")];
  return ["⛈️", L("Thunderstorm", "Dông bão", "천둥번개", "雷暴")];
}

function useLocalWeather() {
  const [weather, setWeather] = React.useState(null);
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetch("https://api.open-meteo.com/v1/forecast?latitude=" + latitude.toFixed(3) +
              "&longitude=" + longitude.toFixed(3) + "&current=temperature_2m,weather_code&timezone=auto")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d && d.current) setWeather(d.current); })
          .catch(() => {});
      },
      () => {},            // permission denied → no widget, no nagging
      { timeout: 10000, maximumAge: 30 * 60 * 1000 }
    );
  }, []);
  return weather;
}

export function MissionComposer({ onNav, missionCount }) {
  const D = window.YANA;
  const [v, setV] = React.useState("");
  const [account, setAccount] = React.useState(null);
  const [now, setNow] = React.useState(() => new Date());
  const weather = useLocalWeather();

  React.useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAccount(d.username || null))
      .catch(() => {});
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const suggestions = [
    ["Ship v0.9 safely", "Phát hành v0.9 an toàn", "v0.9 안전하게 출시", "安全发布 v0.9"],
    ["Summarize what changed overnight", "Tóm tắt thay đổi qua đêm", "밤사이 변경사항 요약", "总结昨夜的变更"],
    ["Prune stale memories", "Dọn ký ức cũ", "오래된 메모리 정리", "清理陈旧记忆"],
  ];

  async function begin(text) {
    const goal = (text || v).trim();
    if (!goal) return;
    try {
      const r = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: goal }),
      });
      if (r.ok) {
        const { mission } = await r.json();
        D._openMission = mission.id;
      }
    } catch (_) {}
    onNav("missions");
  }

  const connectedN = D.providers.filter((p) => YanaVault.hasKey(p.id)).length;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto", padding: "calc(34px * var(--sp)) 0 calc(40px * var(--sp))", textAlign: "center" }}>
      <h1 className="h-display" style={{ margin: "0 0 18px", fontSize: 30 }}>{greetingFor(now.getHours(), account)}</h1>
      <div className="glass-strong" style={{ borderRadius: 18, padding: "10px 10px 10px 20px", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") begin(); }}
          placeholder={L("What do you want to accomplish today?", "Hôm nay bạn muốn hoàn thành điều gì?", "오늘 무엇을 이루고 싶으신가요?", "今天你想完成什么？")}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15.5, fontFamily: "inherit", color: "var(--ink)" }}
        />
        <button onClick={() => begin()} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "9px 17px", borderRadius: 13,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13.5, fontWeight: 500, flex: "none",
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 32%, transparent)",
        }}>{Icons.spark(15)} {L("New Mission", "Nhiệm vụ mới", "새 미션", "新任务")}</button>
      </div>
      <div style={{ display: "flex", gap: 7, justifyContent: "center", flexWrap: "wrap", marginTop: 13 }}>
        {suggestions.map(([en, vi, ko, zh]) => (
          <button key={en} onClick={() => begin(en)} className="chip neutral" style={{ cursor: "pointer", fontSize: 12 }}>{L(en, vi, ko, zh)}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 22, fontSize: 12.5, color: "var(--ink-3)", flexWrap: "wrap" }}>
        <span className="dot on pulse"></span>
        <span>{L("Lake status:", "Trạng thái hồ:", "호수 상태:", "湖面状态：")} <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{L("Calm", "Tĩnh lặng", "잔잔함", "平静")}</b></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {weather && <span style={{ opacity: .5 }}>·</span>}
        {weather && (
          <span title={describeWeather(weather.weather_code)[1]}>
            {describeWeather(weather.weather_code)[0]} {Math.round(weather.temperature_2m)}°C
          </span>
        )}
        <span style={{ opacity: .5 }}>·</span>
        <span>{connectedN} {L("providers connected", "nhà cung cấp đã kết nối", "개 프로바이더 연결됨", "个提供商已连接")}</span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{missionCount} {L("missions running", "nhiệm vụ đang chạy", "개 미션 진행 중", "个任务运行中")}</span>
      </div>
    </div>
  );
}

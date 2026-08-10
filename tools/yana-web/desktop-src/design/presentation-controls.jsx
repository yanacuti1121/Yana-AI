import React from 'react';
import { L } from '../components.jsx';
import {
  PRESENTATION_DEFAULTS,
  normalizeBrandBalance,
  rebalanceBrandChannel,
} from './preferences.js';

function SliderField({ id, label, value, min, max, unit = '%', onChange, tone }) {
  return (
    <div className="yana-slider-field" data-tone={tone || 'neutral'}>
      <div className="yana-slider-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value}{unit}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function PreferenceSwitch({ id, label, description, checked, onChange }) {
  return (
    <label className="yana-preference-switch" htmlFor={id}>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="yana-preference-switch-track" aria-hidden="true"><i /></span>
    </label>
  );
}

export function PresentationControls({ values, onChange }) {
  const baseId = React.useId();
  const balance = normalizeBrandBalance(values);
  const motifOptions = [
    ['Off', L('Off', 'Tắt', '끔', '关闭')],
    ['Subtle', L('Subtle', 'Nhẹ', '은은함', '柔和')],
    ['Visible', L('Visible', 'Rõ', '선명함', '明显')],
  ];

  function updateChannel(channel, nextValue) {
    onChange(rebalanceBrandChannel(balance, channel, nextValue));
  }

  return (
    <section className="yana-presentation-panel yana-glass" aria-labelledby={`${baseId}-title`}>
      <div className="yana-presentation-intro">
        <div>
          <h3 id={`${baseId}-title`}>{L('Cyber-Sakura canvas', 'Không gian Cyber-Sakura', '사이버 사쿠라 캔버스', '赛博樱花画布')}</h3>
          <p>{L(
            'Tune the presentation layer only. Runtime, safety, and memory settings are not changed.',
            'Chỉ tinh chỉnh lớp hiển thị. Runtime, an toàn và bộ nhớ không bị thay đổi.',
            '표현 레이어만 조정합니다. 런타임, 안전, 메모리 설정은 변경되지 않습니다.',
            '仅调整视觉呈现层，不会更改运行时、安全或记忆设置。'
          )}</p>
        </div>
        <div className="yana-state-preview" aria-label={L('State colour preview', 'Xem trước màu trạng thái', '상태 색상 미리보기', '状态颜色预览')}>
          <span className="yana-state-chip yana-state--thinking"><i aria-hidden="true" />{L('System', 'Hệ thống', '시스템', '系统')}</span>
          <span className="yana-state-chip yana-state--focus"><i aria-hidden="true" />{L('You', 'Bạn', '사용자', '你')}</span>
          <span className="yana-state-chip yana-state--success"><i aria-hidden="true" />Yana-rt</span>
        </div>
      </div>

      <fieldset className="yana-balance-fieldset">
        <legend>{L('Colour balance', 'Cân bằng màu', '색상 균형', '颜色平衡')} · 100%</legend>
        <div
          className="yana-balance-meter"
          style={{
            '--balance-blue': `${balance.brandBlue}%`,
            '--balance-pink': `${balance.brandBlue + balance.brandPink}%`,
          }}
          aria-hidden="true"
        />
        <div className="yana-control-grid yana-control-grid--three">
          <SliderField id={`${baseId}-blue`} label={L('Lotus blue', 'Xanh hoa sen', '로터스 블루', '莲花蓝')} value={balance.brandBlue} min={0} max={100} tone="blue" onChange={(value) => updateChannel('brandBlue', value)} />
          <SliderField id={`${baseId}-pink`} label={L('Sakura pink', 'Hồng sakura', '사쿠라 핑크', '樱花粉')} value={balance.brandPink} min={0} max={100} tone="pink" onChange={(value) => updateChannel('brandPink', value)} />
          <SliderField id={`${baseId}-green`} label={L('Matcha green', 'Xanh matcha', '말차 그린', '抹茶绿')} value={balance.brandGreen} min={0} max={100} tone="green" onChange={(value) => updateChannel('brandGreen', value)} />
        </div>
      </fieldset>

      <div className="yana-control-grid">
        <SliderField id={`${baseId}-glow`} label={L('Glow intensity', 'Cường độ ánh sáng', '글로우 강도', '光晕强度')} value={values.glowIntensity ?? PRESENTATION_DEFAULTS.glowIntensity} min={0} max={100} onChange={(value) => onChange({ glowIntensity: value })} />
        <SliderField id={`${baseId}-font`} label={L('Interface scale', 'Cỡ giao diện', '인터페이스 크기', '界面缩放')} value={values.fontScale ?? PRESENTATION_DEFAULTS.fontScale} min={90} max={125} onChange={(value) => onChange({ fontScale: value })} />
        <SliderField id={`${baseId}-surface`} label={L('Surface opacity', 'Độ đục bề mặt', '표면 불투명도', '表面不透明度')} value={values.surfaceOpacity ?? PRESENTATION_DEFAULTS.surfaceOpacity} min={70} max={100} onChange={(value) => onChange({ surfaceOpacity: value })} />
      </div>

      <div className="yana-presentation-footer">
        <fieldset className="yana-motif-control">
          <legend>{L('Floral watermark', 'Họa tiết hoa', '꽃 워터마크', '花卉水印')}</legend>
          <div role="group" aria-label={L('Floral watermark visibility', 'Độ hiển thị họa tiết hoa', '꽃 워터마크 표시', '花卉水印可见度')}>
            {motifOptions.map(([option, label]) => (
              <button
                key={option}
                type="button"
                aria-pressed={(values.motifVisibility || PRESENTATION_DEFAULTS.motifVisibility) === option}
                onClick={() => onChange({ motifVisibility: option })}
              >{label}</button>
            ))}
          </div>
        </fieldset>

        <div className="yana-accessibility-controls">
          <PreferenceSwitch
            id={`${baseId}-motion`}
            label={L('Reduce motion', 'Giảm chuyển động', '모션 줄이기', '减少动效')}
            description={L('Stops ambient and looping effects', 'Dừng hiệu ứng nền và lặp', '주변 및 반복 효과 중지', '停止环境和循环动效')}
            checked={values.reduceMotion === true}
            onChange={(value) => onChange({ reduceMotion: value })}
          />
          <PreferenceSwitch
            id={`${baseId}-contrast`}
            label={L('Contrast boost', 'Tăng tương phản', '대비 향상', '增强对比度')}
            description={L('Strengthens text and boundaries', 'Làm rõ chữ và đường viền', '텍스트와 경계를 강화', '增强文字与边界')}
            checked={values.contrastBoost === true}
            onChange={(value) => onChange({ contrastBoost: value })}
          />
        </div>
      </div>

      <button className="yana-presentation-reset" type="button" onClick={() => onChange(PRESENTATION_DEFAULTS)}>
        {L('Reset presentation', 'Đặt lại hiển thị', '표현 설정 초기화', '重置视觉设置')}
      </button>
    </section>
  );
}

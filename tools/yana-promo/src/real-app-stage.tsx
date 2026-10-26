import React from 'react';
import {Img, staticFile} from 'remotion';
import {bound, ease, mix} from './motion-state';

type Shot = {from: number; asset: string; cut?: boolean};

const shots: readonly Shot[] = [
  {from: 95, asset: 'home'},
  {from: 180, asset: 'editor'},
  {from: 337, asset: 'typing-1', cut: true},
  {from: 351, asset: 'typing-2', cut: true},
  {from: 365, asset: 'typing-3', cut: true},
  {from: 379, asset: 'typing-4', cut: true},
  {from: 393, asset: 'typing-5', cut: true},
  {from: 562, asset: 'editor-scroll'},
  {from: 675, asset: 'guide'},
  {from: 787, asset: 'guide-approval'},
  {from: 1012, asset: 'mcp'},
  {from: 1237, asset: 'models'},
  {from: 1325, asset: 'providers'},
  {from: 1480, asset: 'models-scroll'},
  {from: 1575, asset: 'workspace-trust'},
  {from: 1750, asset: 'editor'},
  {from: 1912, asset: 'home'},
  {from: 1950, asset: 'workspace-trust'},
  {from: 1985, asset: 'models'},
  {from: 2020, asset: 'editor'},
];

const Screenshot: React.FC<{asset: string; opacity: number}> = ({asset, opacity}) => (
  <Img src={staticFile(`real-app/${asset}.png`)} style={{
    position: 'absolute', left: 0, top: 0, width: 1600, height: 'auto',
    maxWidth: 'none', transform: 'translateY(-50px)', opacity,
  }} />
);

export const RealAppStage: React.FC<{f: number}> = ({f}) => {
  const next = shots.findIndex(shot => shot.from > f);
  const index = next === -1 ? shots.length - 1 : Math.max(0, next - 1);
  const current = shots[index];
  const opacity = current.cut || index === 0 ? 1 : bound((f - current.from) / 8);
  return <div style={{position: 'relative', width: 1600, height: 920, overflow: 'hidden',
    borderRadius: 14, background: '#181818', boxShadow: '0 38px 100px #24365a44, 0 3px 12px #1c2b4530'}}>
    {opacity < 1 && index > 0 && <Screenshot asset={shots[index - 1].asset} opacity={1} />}
    <Screenshot asset={current.asset} opacity={opacity} />
  </div>;
};

const captions = [
  [112.5, 180, 'Mở Yana Studio. Bắt đầu từ dự án.'],
  [180, 337, 'Code và hội thoại trong cùng workspace.'],
  [337, 450, 'Soạn yêu cầu bằng tiếng Việt.'],
  [450, 562, 'Yêu cầu đã soạn, sẵn sàng gửi.'],
  [562, 675, 'Cuộn code. Giữ ngữ cảnh.'],
  [675, 787, 'Hướng dẫn ngay trong dự án.'],
  [787, 900, 'Đọc hướng dẫn về quyền phê duyệt.'],
  [900, 1012, 'Hiểu phạm vi trước khi giao việc.'],
  [1012, 1125, 'Xem công cụ ngoài và MCP.'],
  [1125, 1237, 'Cấu hình tích hợp ngay trong app.'],
  [1237, 1325, 'Khám phá danh sách model.'],
  [1325, 1480, 'Xem cấu hình nhà cung cấp.'],
  [1480, 1575, 'Lướt danh sách. Xem thêm lựa chọn.'],
  [1575, 1687.5, 'Workspace hỏi trước khi mở terminal.'],
  [1687.5, 1750, 'Bạn quyết định quyền của workspace.'],
  [1750, 1912, 'Trở lại code. Tiếp tục mạch làm việc.'],
  [1912, 2040, 'Một workspace cho công việc của bạn.'],
] as const;

export const realCaptionAt = (f: number) => captions.find(caption => f >= caption[0] && f < caption[1]);

// Camera targets follow the captured layouts, including the native chat composer.
const cameraPoses = [
  [95, 460, 410, .62, -7], [150, 160, 130, 1, -1],
  [220, 160, 130, 1, -1], [300, 25, 65, 1.18, 0],
  [375, -450, -100, 1.3, 0], [530, -450, -100, 1.3, 0],
  [590, 30, 70, 1.16, 0], [640, 30, 70, 1.16, 0],
  [700, 160, 130, 1, 0], [787, 30, -160, 1.16, 0],
  [960, 30, -220, 1.16, 0], [1040, 80, 110, 1.08, 0],
  [1210, 80, 70, 1.08, 0], [1260, 150, 120, 1, -1],
  [1360, -80, 60, 1.16, 0], [1530, -100, 30, 1.15, 0],
  [1610, 0, 30, 1.2, 0], [1720, 0, 0, 1.2, 0],
  [1770, 80, 100, 1.1, 0], [1880, 20, 50, 1.15, 0],
  [1925, 250, 160, .88, -3], [2020, 250, 160, .88, 2],
  [2065, 750, 365, .25, 0],
] as const;
export const realCameraAt = (f: number) => {
  const next = cameraPoses.findIndex(p => p[0] >= f);
  const b = next < 0 ? cameraPoses[cameraPoses.length - 1] : cameraPoses[next];
  const a = next <= 0 ? b : cameraPoses[next - 1];
  const t = a[0] === b[0] ? 1 : ease((f - a[0]) / (b[0] - a[0]));
  return {x: mix(a[1], b[1], t), y: mix(a[2], b[2], t), scale: mix(a[3], b[3], t), tilt: mix(a[4], b[4], t)};
};

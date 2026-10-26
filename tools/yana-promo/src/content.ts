export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const timeline = [
  {id: 'intro', from: 0, duration: 150, title: 'AI làm việc. Bạn giữ quyền.'},
  {id: 'workspace', from: 150, duration: 210, title: 'Mọi thứ. Cùng một nơi.'},
  {id: 'context', from: 360, duration: 330, title: 'Hiểu code. Hiểu ngữ cảnh.'},
  {id: 'approval', from: 690, duration: 420, title: 'Cần quyền? Yana chờ bạn.'},
  {id: 'evidence', from: 1110, duration: 300, title: 'Mỗi quyết định. Một dấu vết.'},
  {id: 'models', from: 1410, duration: 300, title: 'Đổi model. Giữ quyền.'},
  {id: 'montage', from: 1710, duration: 300, title: 'Tập trung vào việc của bạn.'},
  {id: 'outro', from: 2010, duration: 240, title: 'AI làm việc. Bạn giữ quyền.'},
] as const;
export type SceneId = typeof timeline[number]['id'];
export const TOTAL_FRAMES = 2250;
export const teaserTimeline: {id: SceneId; from: number; duration: number; offset: number}[] = [
  {id: 'intro', from: 0, duration: 120, offset: 20},
  {id: 'workspace', from: 120, duration: 150, offset: 30},
  {id: 'approval', from: 270, duration: 270, offset: 100},
  {id: 'outro', from: 540, duration: 210, offset: 25},
];

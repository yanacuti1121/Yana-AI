import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [file, seconds, frames] of [['yana-demo-vi.mp4', 75, 2250], ['yana-teaser-vi.mp4', 25, 750]]) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(root, 'out', file)], {encoding: 'utf8'});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const media = JSON.parse(result.stdout);
  const video = media.streams.find(s => s.codec_type === 'video');
  const audio = media.streams.find(s => s.codec_type === 'audio');
  assert(video && audio, `${file}: missing stream`);
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1920); assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, '30/1'); assert.equal(Number(video.nb_frames), frames);
  assert.equal(audio.codec_name, 'aac');
  assert(Math.abs(Number(media.format.duration) - seconds) < 0.1);
  console.log(`${file}: H.264/AAC, 1920x1080, 30fps, ${frames} frames, ${media.format.duration}s`);
}

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of process.argv.length > 2 ? process.argv.slice(2) : ['main', 'teaser']) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', `public/audio/${name}.wav`, '-af', 'loudnorm=I=-16:TP=-2:LRA=8', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', `public/audio/${name}.mp3`], {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Audio encoding failed for ${name}: ${result.status}`);
}
console.log('Encoded both original scores as local MP3 files.');

// Checks features/office-pptx.js with the real PptxGenJS in extensions/yana-agent/office: Markdown becomes the right
// slides, bad input is rejected, and a real .pptx is written whose zip contains one slide file per slide and the
// slide text. Usage: node tests/office-pptx.test.cjs <absolute path to extensions/yana-agent>
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const pptx = require(path.join(ext, 'features', 'office-pptx.js'));
const JSZip = require(path.join(ext, 'office', 'node_modules', 'jszip'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const throws = fn => { try { fn(); return false; } catch { return true; } };

const deck = '---\nmarp: true\n---\n\n# Intro\n\nHello world\n\n---\n\n## Points\n\n- one\n- two\n\n---\n\n- only bullets\n';

(async () => {
	const slides = pptx.parseDeck(deck);
	check('front matter is skipped and 3 slides found', slides.length === 3, String(slides.length));
	check('title taken from the first heading', slides[0].title === 'Intro' && slides[1].title === 'Points');
	check('bullets and paragraphs are separated', slides[1].bullets.join() === 'one,two' && slides[0].paragraphs.join() === 'Hello world');
	check('a slide without a heading is kept', slides[2].title === '' && slides[2].bullets[0] === 'only bullets');
	check('CRLF input parses the same', pptx.parseDeck(deck.replace(/\n/g, '\r\n')).length === 3);
	check('null byte text does not crash', !throws(() => pptx.parseDeck('# A\u0000B\n- x\n')));
	check('empty text is rejected', throws(() => pptx.parseDeck('')));
	check('only separators is rejected', throws(() => pptx.parseDeck('---\n---\n---\n')));
	check('too many slides is rejected', throws(() => pptx.parseDeck(Array.from({ length: pptx.MAX_SLIDES + 1 }, (_, i) => `# S${i}`).join('\n---\n'))));
	check('a very long line is truncated', pptx.parseDeck(`# ${'x'.repeat(5000)}`)[0].title.length <= 2000);

	const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yana-pptx-')), 'deck.pptx');
	const hostile = '# <script>alert(1)</script> & "quotes"\n\n- a < b > c\n';
	try {
		const result = await pptx.buildPptx({ extensionPath: ext, markdown: `${deck}\n---\n\n${hostile}`, outputFile: out });
		check('buildPptx reports 4 slides', result.slides === 4, String(result.slides));
		const bytes = fs.readFileSync(out);
		check('file is a zip', bytes.subarray(0, 2).toString('latin1') === 'PK');
		const zip = await JSZip.loadAsync(bytes);
		const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
		check('zip has one slide file per slide', slideFiles.length === 4, slideFiles.join());
		const first = await zip.file('ppt/slides/slide1.xml').async('string');
		check('slide 1 contains its title text', first.includes('Intro') && first.includes('Hello world'));
		const last = await zip.file('ppt/slides/slide4.xml').async('string');
		check('hostile text is XML-escaped in the file', !last.includes('<script>') && last.includes('&lt;script&gt;'), last.slice(0, 200));
	} catch (error) {
		check('real pptx build', false, error.message);
	}

	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

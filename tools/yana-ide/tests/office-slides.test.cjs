// Checks features/office-slides.js with the real Marp packages in extensions/yana-agent/office: the preview renders
// slides and escapes raw HTML, bad input is rejected, export arguments never go through a shell, and (unless
// SKIP_EXPORT=1) one real PDF export runs through Chrome and produces a PDF file. Needs Chrome for the export check.
// Usage: node tests/office-slides.test.cjs <absolute path to extensions/yana-agent>
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2];
const slides = require(path.join(ext, 'features', 'office-slides.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const deck = '# Title\n\nHello\n\n---\n\n# Second\n\n- one\n- two\n';

(async () => {
	const preview = slides.renderPreview(ext, deck);
	check('preview has two slides', (preview.html.match(/<section/g) || []).length === 2, String((preview.html.match(/<section/g) || []).length));
	check('preview returns css', typeof preview.css === 'string' && preview.css.length > 100);

	const hostile = slides.renderPreview(ext, '# Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n');
	check('raw script tag is escaped', !hostile.html.includes('<script>alert(1)'));
	check('raw img tag is escaped', !/<img[^>]*onerror/i.test(hostile.html));

	for (const [label, value] of [['empty text', ''], ['whitespace only', '  \n '], ['non-string', null], ['oversize text', 'a'.repeat(slides.MAX_MARKDOWN_BYTES + 1)]]) {
		let threw = false;
		try { slides.renderPreview(ext, value); } catch { threw = true; }
		check(`rejects ${label}`, threw);
	}
	check('accepts text at the size limit', (() => { try { slides.checkMarkdown('a'.repeat(slides.MAX_MARKDOWN_BYTES)); return true; } catch { return false; } })());
	check('handles null byte and CRLF text', (() => { try { slides.renderPreview(ext, '# A\r\n\r\nx\u0000y\r\n'); return true; } catch { return false; } })());

	const args = slides.exportArgs(ext, '/tmp/in.md', '/tmp/out file; rm x.pdf', 'pdf');
	check('output path stays a single argument', args.includes('/tmp/out file; rm x.pdf') && args.includes('--no-stdin') && args.length === 7, JSON.stringify(args));
	check('pdf and pptx flags are right', slides.exportArgs(ext, 'a', 'b', 'pdf').includes('--pdf') && slides.exportArgs(ext, 'a', 'b', 'pptx').includes('--pptx'));
	check('unsupported format throws', (() => { try { slides.exportArgs(ext, 'a', 'b', 'exe'); return false; } catch { return true; } })());

	let emptyExportRejected = false;
	try { await slides.exportSlides({ extensionPath: ext, markdown: '', format: 'pdf', outputFile: '/tmp/never.pdf' }); } catch { emptyExportRejected = true; }
	check('export of empty text is rejected before anything runs', emptyExportRejected);

	if (process.env.SKIP_EXPORT !== '1') {
		const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yana-export-')), 'deck.pdf');
		try {
			await slides.exportSlides({ extensionPath: ext, markdown: deck, format: 'pdf', outputFile: out });
			const head = fs.readFileSync(out).subarray(0, 5).toString('latin1');
			check('real PDF export wrote a PDF', head === '%PDF-', head);
			check('PDF is not trivially small', fs.statSync(out).size > 2000, String(fs.statSync(out).size));
		} catch (error) {
			check('real PDF export', false, error.message);
		}
	}

	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

// Checks the Typst report export with the real typst binary: Markdown becomes the right Typst, hostile text cannot run
// Typst code, a real PDF is written and read back, and failures leave nothing behind.
// Usage: node tests/office-typst.test.cjs <absolute path to extensions/yana-agent>
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2];
const typst = require(path.join(ext, 'features', 'office-typst.js'));
const documents = require(path.join(ext, 'features', 'office-documents.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const rejects = async fn => { try { await fn(); return false; } catch { return true; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-office-typst-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const typstBinary = typst.findTypst();

(async () => {
	check('typst is found on this machine', Boolean(typstBinary));
	check('findTypst returns null when nothing exists', typst.findTypst(() => false) === null);

	// ---- conversion
	const { source, assets } = typst.toTypst('---\ntitle: x\n---\n\n# Title\n\nHello **bold** and *it* and `code` and [site](https://a.example).\n\n- one\n- two\n\n1. first\n2. second\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n```\nraw code\n```\n');
	check('front matter is dropped', !source.includes('title: x'));
	check('heading, bold, italic, code are converted', source.includes('#heading(level: 1)[#"Title"]') && source.includes('#strong[#"bold"]') && source.includes('#emph[#"it"]') && source.includes('#raw("code")'), source);
	check('a link shows its address and is not live', source.includes('#underline[#"site"]#" (https://a.example)"') && !source.includes('#link('));
	check('lists and numbered lists are converted', source.includes('#list([#"one"], [#"two"])') && source.includes('#enum([#"first"], [#"second"])'), source);
	check('a table and a rule and a code block are converted', source.includes('#table(columns: 2') && source.includes('#line(length: 100%)') && source.includes('#raw(block: true, "raw code")'), source);
	check('snake_case words are not turned into italics', !typst.toTypst('use my_var_name here\n').source.includes('#emph'));

	// ---- hostile text stays text
	const hostile = '# #panic("x")\n\n#read("/etc/hosts") and #import "@preview/x:1.0.0": * $x$ @ref <label> */ \\ "quotes" \\" end\n\n| #panic("t") | `]` |\n| --- | --- |\n| "; #read("/etc/passwd") | \\ |\n\n- ] #panic("l") [\n';
	const hostileOut = path.join(dir, 'hostile.pdf');
	await typst.buildTypstPdf({ markdown: hostile, outputFile: hostileOut, typstBinary });
	const read = (await documents.readDocument(ext, hostileOut)).text;
	check('hostile Typst code is printed as text, never run', read.includes('#panic') && read.includes('#read') && read.includes('@preview'), read);
	check('nothing was read from the file system', !/localhost|root:|nobody/.test(read), read);

	// ---- a real report, read back
	const report = '# Báo cáo quý\n\nXin chào **Việt Nam**: tiếng Việt có dấu.\n\n- Mục một\n- Mục hai\n\n| Tên | Số |\n| --- | --- |\n| Táo | 3 |\n| Lê | 5 |\n';
	const out = path.join(dir, 'report.pdf');
	const built = await typst.buildTypstPdf({ markdown: report, outputFile: out, typstBinary });
	const bytes = fs.readFileSync(out);
	check('the file is a PDF', bytes.subarray(0, 5).toString('latin1') === '%PDF-' && built.images === 0);
	const back = (await documents.readDocument(ext, out)).text;
	check('text, list and table are in the PDF', /Báo cáo quý/.test(back) && /Mục một/.test(back) && /Táo/.test(back), back);
	check('Vietnamese diacritics survive', /Việt Nam/.test(back), back);

	// ---- images
	const withImage = await typst.buildTypstPdf({ markdown: `# Pic\n\n![logo](data:image/png;base64,${PNG.toString('base64')})\n`, outputFile: path.join(dir, 'pic.pdf'), typstBinary });
	check('an inline image is embedded', withImage.images === 1 && fs.statSync(path.join(dir, 'pic.pdf')).size > 1000);
	const bad = typst.toTypst('![x](/etc/passwd)\n![y](https://a.example/x.png)\n![z](data:image/png;base64,AAAA)\n');
	check('a file path, a web address and a fake inline image are never embedded', bad.assets.length === 0 && (bad.source.match(/image not available/g) || []).length === 3, bad.source);

	// ---- limits and failures
	const started = Date.now();
	const slow = '*'.repeat(100000) + '\n' + '['.repeat(50000) + '\n' + '`'.repeat(100000) + '\n';
	typst.toTypst(slow);
	check('pathological inline text converts in well under a second', Date.now() - started < 1000, `${Date.now() - started} ms`);
	check('empty text is rejected', await rejects(() => typst.buildTypstPdf({ markdown: '', outputFile: path.join(dir, 'e.pdf'), typstBinary })));
	check('a missing typst is a clear error', await rejects(() => typst.buildTypstPdf({ markdown: '# x\n', outputFile: path.join(dir, 'n.pdf'), typstBinary: null })));
	const leftovers = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('yana-typst-')).length;
	const before = leftovers();
	await rejects(() => typst.buildTypstPdf({ markdown: '# x\n', outputFile: path.join(dir, 'f.pdf'), typstBinary: '/bin/false' }));
	check('a failed run leaves no temp folder and no output file', leftovers() === before && !fs.existsSync(path.join(dir, 'f.pdf')));
	const many = '| h |\n| --- |\n' + Array.from({ length: 800 }, (_, i) => `| r${i} |`).join('\n') + '\n';
	check('a table is capped at 500 rows', (typst.toTypst(many).source.match(/\[#"r\d+"\]/g) || []).length <= 500);

	fs.rmSync(dir, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})().catch(error => { console.log('FAIL unexpected', error.stack); process.exit(1); });

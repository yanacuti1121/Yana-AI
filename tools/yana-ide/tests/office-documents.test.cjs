// Checks reading Word/PowerPoint/Excel/PDF files into Markdown and writing Word, OpenDocument and Excel files
// (office batches 2 and 3). Uses the real officeparser, PptxGenJS, Marp and jszip in extensions/yana-agent/office.
// Usage: node tests/office-documents.test.cjs <absolute path to extensions/yana-agent>
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const documents = require(path.join(ext, 'features', 'office-documents.js'));
const xlsx = require(path.join(ext, 'features', 'office-xlsx.js'));
const pptx = require(path.join(ext, 'features', 'office-pptx.js'));
const slides = require(path.join(ext, 'features', 'office-slides.js'));
const files = require(path.join(ext, 'features', 'office-files.js'));
const JSZip = require(path.join(ext, 'office', 'node_modules', 'jszip'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const rejects = async fn => { try { await fn(); return false; } catch { return true; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-office-docs-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// Any network use while reading a document is a failure: OCR and font loaders must stay offline.
const attempts = [];
for (const [object, method] of [[http, 'request'], [https, 'request'], [net, 'connect']]) {
	const original = object[method];
	object[method] = function (...args) { attempts.push(`${method}`); return original.apply(this, args); };
}

(async () => {
	// ---- helpers (tidy, paginate)
	check('front matter and heading ids are removed', documents.tidy('---\ntitle: x\n---\n\n# A {#a}\n\n<a id="t1"></a>\n\ntext\n', '.docx') === '# A\n\ntext\n', JSON.stringify(documents.tidy('---\ntitle: x\n---\n\n# A {#a}\n\n<a id="t1"></a>\n\ntext\n', '.docx')));
	check('a pptx slide title becomes a heading', documents.tidy('---\n\n**Intro**\n\nHello\n', '.pptx').includes('# Intro'));
	const longTable = '| h |\n| --- |\n' + Array.from({ length: 25 }, (_, i) => `| r${i} |`).join('\n') + '\n';
	check('a long table is split into slides with the header repeated', documents.paginateTables(longTable).split('\n---\n').length === 3);
	check('a short table is left alone', documents.paginateTables('| h |\n| --- |\n| a |\n') === '| h |\n| --- |\n| a |\n');

	// ---- Word and OpenDocument: write then read back
	const md = '# Report\n\nHello **world**.\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n';
	for (const format of ['docx', 'odt']) {
		const bytes = await documents.renderDocument(ext, md, format);
		const file = path.join(dir, `out.${format}`);
		fs.writeFileSync(file, bytes);
		check(`${format} is a zip`, bytes.subarray(0, 2).toString('latin1') === 'PK');
		const back = await documents.readDocument(ext, file);
		check(`${format} round trip keeps heading, bold, list and table`, /# Report/.test(back.text) && /\*\*world\*\*/.test(back.text) && /- one/.test(back.text) && /\| a \| b \|/.test(back.text), back.text);
		check(`${format} reading removes metadata and anchors`, !back.text.startsWith('---') && !/\{#/.test(back.text) && !/<a id/.test(back.text), back.text);
	}
	const withImage = await documents.renderDocument(ext, `# T\n\n![pic](data:image/png;base64,${PNG.toString('base64')})\n`, 'docx');
	const docxZip = await JSZip.loadAsync(withImage);
	check('docx export embeds a data URI image', Object.keys(docxZip.files).some(name => /^word\/media\/.+/.test(name) && !name.endsWith('/')), Object.keys(docxZip.files).join());
	check('unsupported write format is rejected', await rejects(() => documents.renderDocument(ext, md, 'exe')));

	// ---- PowerPoint written by our builder, read back as slides
	const deck = path.join(dir, 'deck.pptx');
	await pptx.buildPptx({ extensionPath: ext, markdown: '# Intro\n\nHello\n\n---\n\n## Points\n\n- one\n- two\n', outputFile: deck });
	const read = await documents.readDocument(ext, deck);
	check('pptx is read as slides separated by ---', read.text.split('\n---\n').length >= 2 && /# Intro/.test(read.text) && /- one/.test(read.text), read.text);
	check('speaker-note placeholders are not added', !/Note:/.test(read.text), read.text);

	// ---- Excel: write tables, check the package, read back
	const sheetMd = '# Sales\n\n| name | qty | note |\n| --- | --- | --- |\n| Apple | 3 | =1+1 |\n| Pear | 5.5 | a\\|b |\n\n## Costs\n\n| item | cost |\n| --- | --- |\n| Rent | -20 |\n';
	const built = await xlsx.buildXlsx({ extensionPath: ext, markdown: sheetMd });
	check('two tables become two named sheets', built.sheets.join() === 'Sales,Costs', built.sheets.join());
	const xlsxFile = path.join(dir, 'book.xlsx');
	fs.writeFileSync(xlsxFile, built.bytes);
	const z = await JSZip.loadAsync(built.bytes);
	const sheet1 = await z.file('xl/worksheets/sheet1.xml').async('string');
	check('numbers are numeric cells and text is a string cell', sheet1.includes('<c r="B2"><v>3</v></c>') && sheet1.includes('<v>5.5</v>') && sheet1.includes('Apple'), sheet1);
	check('a cell starting with = is stored as text, never a formula', sheet1.includes('t="inlineStr"><is><t xml:space="preserve">=1+1</t>') && !sheet1.includes('<f>'));
	check('the header row is bold', sheet1.includes('<c r="A1" s="1"'));
	check('an escaped pipe stays inside its cell', sheet1.includes('a|b'));
	const back = await documents.readDocument(ext, xlsxFile);
	check('xlsx is read back as tables with the values', /Apple/.test(back.text) && /Rent/.test(back.text) && /5\.5/.test(back.text), back.text);
	check('no table means a clear error', await rejects(() => xlsx.buildXlsx({ extensionPath: ext, markdown: '# only text\n' })));
	const nasty = await xlsx.buildXlsx({ extensionPath: ext, markdown: '# a/b:c*d?[x]\n\n| h\u0001 |\n| --- |\n| <script>&"\u0000 |\n' });
	const nastyZip = await JSZip.loadAsync(nasty.bytes);
	const nastySheet = await nastyZip.file('xl/worksheets/sheet1.xml').async('string');
	check('XML characters are escaped and control characters dropped', nastySheet.includes('&lt;script&gt;&amp;&quot;') && !/[\u0000-\u0008]/.test(nastySheet));
	check('forbidden sheet-name characters are replaced', !/[\[\]:*?/\\]/.test(nasty.sheets[0]) && nasty.sheets[0].length <= 31, nasty.sheets[0]);
	const many = '| h |\n| --- |\n' + Array.from({ length: xlsx.MAX_ROWS + 50 }, (_, i) => `| r${i} |`).join('\n');
	const manyBook = await JSZip.loadAsync((await xlsx.buildXlsx({ extensionPath: ext, markdown: many })).bytes);
	check('rows are capped', ((await manyBook.file('xl/worksheets/sheet1.xml').async('string')).match(/<row /g) || []).length === xlsx.MAX_ROWS);
	const tooMany = Array.from({ length: xlsx.MAX_SHEETS + 5 }, (_, i) => `# t${i}\n\n| h |\n| --- |\n| x |\n`).join('\n');
	check('sheets are capped', (await xlsx.buildXlsx({ extensionPath: ext, markdown: tooMany })).sheets.length === xlsx.MAX_SHEETS);
	const dupes = await xlsx.buildXlsx({ extensionPath: ext, markdown: '# Same\n\n| h |\n| --- |\n| 1 |\n\n# Same\n\n| h |\n| --- |\n| 2 |\n' });
	check('duplicate sheet names are made unique', new Set(dupes.sheets.map(n => n.toLowerCase())).size === 2, dupes.sheets.join());
	check('column letters are right', xlsx.columnName(0) === 'A' && xlsx.columnName(25) === 'Z' && xlsx.columnName(26) === 'AA' && xlsx.columnName(51) === 'AZ');

	// ---- regression tests for the 2026-10-14 security review
	const slowTidy = text => { const started = Date.now(); documents.tidy(text, '.docx'); return Date.now() - started; };
	check('tidy is linear on a long run of " {#" (was 2.2 s per 120 KB)', slowTidy(' {#'.repeat(120000)) < 500);
	const typed = await xlsx.buildXlsx({ extensionPath: ext, markdown: "# 'Quoted'\n\n| id | n |\n| --- | --- |\n| 007 | 7 |\n| 0 | 0.5 |\n| 12345678901234567890 | -3 |\n\n# History\n\n| h |\n| --- |\n| x |\n" });
	check('sheet names lose edge apostrophes and avoid the reserved name', typed.sheets[0] === 'Quoted' && typed.sheets[1].toLowerCase() !== 'history', typed.sheets.join());
	const typedSheet = await (await JSZip.loadAsync(typed.bytes)).file('xl/worksheets/sheet1.xml').async('string');
	check('007 stays text and 7 stays a number', typedSheet.includes('<t xml:space="preserve">007</t>') && typedSheet.includes('<c r="B2"><v>7</v></c>'), typedSheet);
	check('0, 0.5 and -3 are numbers; a 20 digit id stays text', typedSheet.includes('<c r="A3"><v>0</v></c>') && typedSheet.includes('<v>0.5</v>') && typedSheet.includes('<v>-3</v>') && typedSheet.includes('12345678901234567890</t>'), typedSheet);
	const abortFile = path.join(dir, 'abort.docx');
	fs.writeFileSync(abortFile, await documents.renderDocument(ext, Array.from({ length: 12000 }, (_, i) => `Paragraph ${i} with filler words.`).join('\n\n'), 'docx'));
	// The signal must actually reach officeparser. The key is `abortSignal`; `signal` is silently ignored there, which is how the
	// 60 s limit once did nothing. A limit already over (0 ms) must therefore reject, deterministically.
	check('an aborted conversion is really stopped (read)', await rejects(() => documents.readDocument(ext, abortFile, { timeoutMs: 0 })));
	const normal = await documents.readDocument(ext, abortFile);
	check('the same document reads fine with the normal limit', /Paragraph 11999/.test(normal.text) || normal.notice !== '');
	const zipBomb = new JSZip();
	zipBomb.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
	zipBomb.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
	zipBomb.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + '<w:p><w:r><w:t>x</w:t></w:r></w:p>'.repeat(70000) + '</w:body></w:document>');
	const bombFile = path.join(dir, 'bomb.docx');
	fs.writeFileSync(bombFile, await zipBomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
	const bombStarted = Date.now();
	const bombError = await documents.readDocument(ext, bombFile).then(() => '', error => error.message);
	check('a valid docx with 210000 XML elements is refused by the element limit', /element limit/i.test(bombError) && Date.now() - bombStarted < 10000, `${bombError.slice(0, 100)} ${Date.now() - bombStarted} ms`);
	const okFile = path.join(dir, 'ok.docx');
	fs.writeFileSync(okFile, await documents.renderDocument(ext, '# Fine\n\nA normal document still opens.\n', 'docx'));
	check('a normal docx is still read under the limits', /normal document/.test((await documents.readDocument(ext, okFile)).text));

	// ---- PDF from Marp, read back
	const pdfFile = path.join(dir, 'slides.pdf');
	await slides.exportSlides({ extensionPath: ext, markdown: '---\nmarp: true\n---\n\n# PDF title\n\nSome readable body text.\n', format: 'pdf', outputFile: pdfFile });
	const pdf = await documents.readDocument(ext, pdfFile);
	check('pdf text is read', /PDF title/.test(pdf.text) && /readable body/.test(pdf.text), pdf.text);

	// ---- limits and bad input
	check('unsupported type is rejected', await rejects(() => documents.readDocument(ext, path.join(dir, 'a.exe'))));
	const fake = path.join(dir, 'fake.docx');
	fs.writeFileSync(fake, 'this is not a zip at all');
	check('a fake docx is rejected with a message', await rejects(() => documents.readDocument(ext, fake)));
	const truncated = path.join(dir, 'cut.docx');
	fs.writeFileSync(truncated, (await documents.renderDocument(ext, md, 'docx')).subarray(0, 200));
	check('a truncated docx is rejected', await rejects(() => documents.readDocument(ext, truncated)));
	const big = path.join(dir, 'big.pdf');
	fs.closeSync(fs.openSync(big, 'w'));
	fs.truncateSync(big, documents.MAX_DOCUMENT_BYTES + 1);
	check('a document over 25 MB is rejected before parsing', await rejects(() => documents.readDocument(ext, big)));
	check('a folder is rejected', await rejects(() => documents.readDocument(ext, path.join(dir, 'folder.docx'))));
	fs.mkdirSync(path.join(dir, 'folder.docx'));
	check('a folder named like a document is rejected', await rejects(() => documents.readDocument(ext, path.join(dir, 'folder.docx'))));
	const huge = await documents.renderDocument(ext, Array.from({ length: 12000 }, (_, i) => `Paragraph number ${i} with some filler words to take space.`).join('\n\n'), 'docx');
	const hugeFile = path.join(dir, 'huge.docx');
	fs.writeFileSync(hugeFile, huge);
	const clipped = await documents.readDocument(ext, hugeFile);
	check('a very long document is cut to the slide text limit and flagged', clipped.notice !== '' && Buffer.byteLength(clipped.text, 'utf8') <= files.MAX_TEXT_BYTES, `${Buffer.byteLength(clipped.text, 'utf8')}`);
	check('reading and writing documents opened no network connection', attempts.length === 0, attempts.join());

	fs.rmSync(dir, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})().catch(error => { console.log('FAIL unexpected', error.stack); process.exit(1); });

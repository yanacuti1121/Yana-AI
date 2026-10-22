// Checks the office file support (batch 1): opening .md/.txt/.csv, embedding only user-picked images, tables and
// images in the editable PPTX, HTML export, and the limits. Uses the real Marp and PptxGenJS in extensions/yana-agent/office.
// Usage: node tests/office-files.test.cjs <absolute path to extensions/yana-agent>
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const files = require(path.join(ext, 'features', 'office-files.js'));
const pptx = require(path.join(ext, 'features', 'office-pptx.js'));
const slides = require(path.join(ext, 'features', 'office-slides.js'));
const JSZip = require(path.join(ext, 'office', 'node_modules', 'jszip'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const throws = fn => { try { fn(); return false; } catch { return true; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-office-files-'));
const write = (name, content) => { const file = path.join(dir, name); fs.writeFileSync(file, content); return file; };

// 1x1 PNG, real bytes
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

(async () => {
	// ---- text files
	const md = write('deck.md', '﻿# Hi\n\n- a\n');
	check('md file is read and the BOM removed', files.readTextFile(md).text === '# Hi\n\n- a\n');
	check('txt file is read', files.readTextFile(write('n.txt', 'hello')).text === 'hello');
	check('unsupported type is rejected', throws(() => files.readTextFile(write('a.exe', 'x'))));
	check('binary content is rejected', throws(() => files.readTextFile(write('b.md', 'a\u0000b'))));
	check('file over 256 KB is rejected', throws(() => files.readTextFile(write('big.md', 'x'.repeat(files.MAX_TEXT_BYTES + 1)))));
	check('missing file is rejected', throws(() => files.readTextFile(path.join(dir, 'nope.md'))));
	fs.mkdirSync(path.join(dir, 'folder.md'));
	check('a directory named like a file is rejected', throws(() => files.readTextFile(path.join(dir, 'folder.md'))));

	// ---- csv
	const csv = files.readTextFile(write('sales.csv', 'name,qty\nApple,3\n"Big, Red",5\n'));
	check('csv becomes a table slide', csv.text.startsWith('# sales\n\n| name | qty |\n| --- | --- |\n| Apple | 3 |\n| Big, Red | 5 |'), csv.text);
	check('semicolon csv is detected', files.csvToMarkdown('a;b\n1;2\n', 't').markdown.includes('| a | b |'));
	check('tab csv is detected', files.csvToMarkdown('a\tb\n1\t2\n', 't').markdown.includes('| 1 | 2 |'));
	check('pipe and backslash in cells are escaped', files.csvToMarkdown('h\na|b\\c\n', 't').markdown.includes('| a\\|b\\\\c |'));
	check('a --- cell cannot start a new slide', !/^---$/m.test(files.csvToMarkdown('h\n---\n', 't').markdown.replace(/\| --- \|/g, '')));
	check('newline inside a quoted cell stays in the cell', files.csvToMarkdown('h\n"a\nb"\n', 't').markdown.includes('| a b |'));
	check('CRLF csv parses', files.parseCsv('a,b\r\n1,2\r\n').length === 2);
	check('empty csv is rejected', throws(() => files.csvToMarkdown('', 't')));
	const long = files.csvToMarkdown('n\n' + Array.from({ length: 25 }, (_, i) => `r${i}`).join('\n'), 'big');
	check('a long table is split across slides with the header repeated', long.markdown.split('\n---\n').length === 3 && long.markdown.includes('# big (3/3)'), String(long.markdown.split('\n---\n').length));
	const huge = files.csvToMarkdown('n\n' + Array.from({ length: files.MAX_CSV_ROWS + 50 }, (_, i) => `r${i}`).join('\n'), 'huge');
	check('csv rows are capped and flagged', huge.clipped === true && huge.rows <= files.MAX_CSV_ROWS);
	check('a long cell is truncated', files.csvToMarkdown(`h\n${'x'.repeat(1000)}\n`, 't').markdown.split('\n')[4].length < 260);

	// ---- images
	const png = write('pic.png', PNG);
	const registry = new files.ImageRegistry();
	check('valid PNG is read', files.readImage(png).mime === 'image/png');
	check('valid JPG is read', files.readImage(write('p.jpg', JPG)).mime === 'image/jpeg');
	check('wrong magic bytes are rejected', throws(() => files.readImage(write('fake.png', 'not a png at all, just text'))));
	check('svg is not accepted', throws(() => files.readImage(write('a.svg', '<svg onload="alert(1)"/>'))));
	check('image over 5 MB is rejected', throws(() => files.readImage(write('huge.png', Buffer.concat([PNG, Buffer.alloc(files.MAX_IMAGE_BYTES)])))));
	const allowed = registry.allow(png);
	check('allow returns an encoded ref and a name', allowed.ref.endsWith('pic.png') && allowed.alt === 'pic');

	const resolved = files.resolveImages(`# T\n\n![pic](${allowed.ref})\n`, registry);
	check('a picked image is embedded as a data URI', resolved.notes.embedded === 1 && resolved.markdown.includes('data:image/png;base64,'));
	const stranger = write('other.png', PNG);
	const refused = files.resolveImages(`![x](${encodeURI(stranger)})\n`, registry);
	check('an image the user did not pick is never read', refused.notes.missing.length === 1 && !refused.markdown.includes('base64'));
	const traversal = files.resolveImages(`![x](${encodeURI(path.join(dir, '..', path.basename(dir), 'other.png'))})\n`, registry);
	check('a path with .. cannot reach an unpicked image', traversal.notes.embedded === 0);
	const link = path.join(dir, 'link.png');
	fs.symlinkSync(stranger, link);
	check('a symlink to an unpicked image is not followed', files.resolveImages(`![x](${encodeURI(link)})\n`, registry).notes.embedded === 0);
	const web = files.resolveImages('![t](https://evil.example/x.png)\n![u](ftp://evil.example/y.png)\n', registry);
	check('web images are removed, not downloaded', web.notes.blocked === 2 && !web.markdown.includes('evil.example/x.png)'));
	// ---- regression tests for the 2026-10-14 security review
	const goodUri = `data:image/png;base64,${PNG.toString('base64')}`;
	check('a valid inline PNG is kept', files.resolveImages(`![d](${goodUri})\n`, registry).markdown === `![d](${goodUri})\n`);
	check('a fake inline image is removed', files.resolveImages('![d](data:image/png;base64,AAAA)\n', registry).notes.embedded === 0);
	check('an inline svg or html data URI is removed', files.resolveImages('![d](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)\n![e](data:text/html;base64,PGI+)\n', registry).notes.embedded === 0);
	const bomb = Buffer.from(PNG);
	bomb.writeUInt32BE(40000, 16);
	bomb.writeUInt32BE(40000, 20);
	check('an inline PNG declaring a huge canvas is removed', files.resolveImages(`![d](data:image/png;base64,${bomb.toString('base64')})\n`, registry).notes.embedded === 0);
	check('a picked PNG declaring a huge canvas is rejected', throws(() => files.readImage(write('bomb.png', bomb))));
	const slow = markdown => { const started = Date.now(); files.resolveImages(markdown, registry); return Date.now() - started; };
	check('a run of "![" is linear (was 1.8 s per 64 KB)', slow('!['.repeat(32768)) < 500);
	check('a run of "![a](" is linear (was 11 s per 256 KB)', slow('![a]('.repeat(52000)) < 500);
	check('a run of "![a](data:" is linear', slow('![a](data:'.repeat(26000)) < 500);
	check('a long run of "![a]" is linear', slow('![a]'.repeat(65000)) < 500);
	const touched = [];
	const realpath = fs.realpathSync;
	fs.realpathSync = (...args) => { touched.push(String(args[0])); return realpath(...args); };
	const hostile = files.resolveImages('![a](//attacker/share/x.png)\n![b](\\\\host\\share\\y.png)\n![c](file:////attacker/z.png)\n![d](/etc/hosts)\n', registry);
	fs.realpathSync = realpath;
	check('a path found in a document never reaches the file system', touched.length === 0 && hostile.notes.missing.length === 4, touched.join());
	const spaced = write('image (1).png', PNG);
	const spacedRef = registry.allow(spaced).ref;
	check('a file name with parentheses gets a safe reference', !/[()]/.test(spacedRef), spacedRef);
	check('...and is embedded', files.resolveImages(`![s](${spacedRef})\n`, registry).notes.embedded === 1);
	const drive = files.resolveImages('![w](C:%5CUsers%5Cme%5Cx.png)\n', registry);
	check('a Windows drive path is not mistaken for a web URL', drive.notes.blocked === 0 && drive.notes.missing.length === 1);
	check('control characters are removed from csv cells', !/[\u0001\u0002]/.test(files.csvToMarkdown('h\na\u0001b\u0002\n', 't').markdown));
	check('a non-image reference is not read', files.resolveImages(`![x](${encodeURI(md)})\n`, registry).notes.embedded === 0);

	// ---- slides: preview and html export with an embedded image
	const markdown = `---\nmarp: true\n---\n\n# Deck\n\n![pic](${allowed.ref})\n`;
	const embedded = files.resolveImages(markdown, registry).markdown;
	check('preview of embedded markdown renders the image', slides.renderPreview(ext, embedded, 40 * 1024 * 1024).html.includes('data:image/png;base64,'));
	check('the 256 KB limit still applies to the user text', throws(() => slides.renderPreview(ext, 'x'.repeat(300 * 1024))));
	const htmlOut = path.join(dir, 'deck.html');
	await slides.exportSlides({ extensionPath: ext, markdown: embedded, format: 'html', outputFile: htmlOut, limit: 40 * 1024 * 1024 });
	const html = fs.readFileSync(htmlOut, 'utf8');
	check('html export is written and contains the slide text', html.includes('Deck') && html.length > 1000, String(html.length));
	check('html export carries the embedded image', html.includes('data:image/png;base64,'));

	// ---- editable pptx: table and image
	const deck = '# Numbers\n\n| name | qty |\n| --- | --- |\n| Apple | 3 |\n| a\\|b | 5 |\n\n---\n\n# Picture\n\n- text\n\n![pic](' + allowed.ref + ')\n';
	const parsed = pptx.parseDeck(deck);
	check('table rows are parsed and the separator dropped', parsed[0].table.length === 3 && parsed[0].table[0].join() === 'name,qty');
	check('an escaped pipe stays inside the cell', parsed[0].table[2][0] === 'a|b', parsed[0].table[2][0]);
	check('image reference is parsed', parsed[1].images.length === 1 && parsed[1].images[0].alt === 'pic');
	const out = path.join(dir, 'deck.pptx');
	await pptx.buildPptx({ extensionPath: ext, markdown: deck, outputFile: out, resolveImage: ref => registry.resolve(ref) });
	const zip = await JSZip.loadAsync(fs.readFileSync(out));
	const names = Object.keys(zip.files);
	check('pptx contains the embedded image file', names.some(name => /^ppt\/media\/.*\.png$/.test(name)), names.join());
	const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
	check('pptx slide 1 has a real table with the cell text', slide1.includes('<a:tbl>') && slide1.includes('Apple'));
	const noImage = path.join(dir, 'noimg.pptx');
	await pptx.buildPptx({ extensionPath: ext, markdown: deck, outputFile: noImage });
	const zip2 = await JSZip.loadAsync(fs.readFileSync(noImage));
	check('without a resolver the image is skipped, not fetched', !Object.keys(zip2.files).some(name => name.startsWith('ppt/media/') && !name.endsWith('/')));
	check('a table with more rows than the limit is clipped', pptx.parseDeck('| a |\n' + Array.from({ length: 80 }, () => '| x |').join('\n'))[0].table.length === 30);

	// ---- pptx: control characters, picture limits, skipped count
	check('control characters never reach the pptx text', !/[\u0001\u0002]/.test(JSON.stringify(pptx.parseDeck('# T\u0001x\n\n| a\u0002b |\n| --- |\n| c\u0001d |\n'))));
	const many = '# P\n\n' + Array.from({ length: 5 }, () => `![pic](${allowed.ref})`).join('\n') + '\n';
	let resolverCalls = 0;
	const counted = await pptx.buildPptx({ extensionPath: ext, markdown: many, outputFile: path.join(dir, 'many.pptx'), resolveImage: ref => { resolverCalls++; return registry.resolve(ref); } });
	check('at most two pictures per slide, the rest counted as skipped', counted.skippedImages === 3, String(counted.skippedImages));
	check('the same picture is read from disk once', resolverCalls === 1, String(resolverCalls));
	const manySlides = Array.from({ length: 6 }, (_, i) => `# S${i}\n\n![pic](${allowed.ref})\n`).join('\n---\n\n');
	const bigImage = { mime: 'image/png', data: Buffer.alloc(files.MAX_TOTAL_IMAGE_BYTES / 4 + 1, 1) };
	check('the total size of pictures in a deck is capped', await (async () => { try { await pptx.buildPptx({ extensionPath: ext, markdown: manySlides, outputFile: path.join(dir, 'big.pptx'), resolveImage: () => bigImage }); return false; } catch { return true; } })());
	const noResolver = await pptx.buildPptx({ extensionPath: ext, markdown: many, outputFile: path.join(dir, 'none.pptx') });
	check('with no resolver every picture is skipped and counted', noResolver.skippedImages === 5);

	// ---- slides: html export must not run scripts from the text; format names; temp folders
	const trap = '---\nmarp: true\n---\n\n# Trap\n\n<script>window.__yana_pwn=1</script>\n\n<img src=x onerror="alert(1)">\n';
	const trapFile = path.join(dir, 'trap.html');
	await slides.exportSlides({ extensionPath: ext, markdown: trap, format: 'html', outputFile: trapFile });
	const trapHtml = fs.readFileSync(trapFile, 'utf8');
	check('exported html does not contain a live script from the text', !trapHtml.includes('<script>window.__yana_pwn') && !/<img src=x onerror/.test(trapHtml));
	check('exported html still has the slide', trapHtml.includes('Trap'));
	check('"html" export passes no marp --html flag', !slides.exportArgs(ext, 'in.md', 'out.html', 'html').includes('--html'));
	check('format names from the prototype are rejected', ['constructor', '__proto__', 'toString', 'hasOwnProperty'].every(name => throws(() => slides.exportArgs(ext, 'in.md', 'o', name))));
	const leftovers = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('yana-slides-')).length;
	const before = leftovers();
	try { await slides.exportSlides({ extensionPath: ext, markdown: '# x\n', format: 'constructor', outputFile: path.join(dir, 'x') }); } catch { /* expected */ }
	check('a rejected export leaves no temp folder behind', leftovers() === before, `${leftovers()} vs ${before}`);

	fs.rmSync(dir, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})().catch(error => { console.log('FAIL unexpected', error.stack); process.exit(1); });

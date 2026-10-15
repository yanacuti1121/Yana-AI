'use strict';
// Registry tính năng của Yana trong IDE. Thêm tính năng mới:
//   1. tạo features/<ten>.js export { id, activate(context) }
//   2. thêm vào danh sách dưới đây
//   3. khai báo view/command của nó trong package.json
// Một tính năng lỗi khi kích hoạt không được kéo sập các tính năng còn lại.

const vscode = require('vscode');

const FEATURES = [
	require('./changes'),
	require('./home'),
	require('./welcome'),
	require('./guide'),
	require('./ide-preferences'),
	require('./control-center'),
	require('./studio-screens'),
	require('./conversations'),
	require('./statusbar'),
	require('./tasks'),
	require('./governance'),
	require('./tools'),
	require('./models'),
	require('./project'),
	require('./system'),
	require('./canvas'),
	require('./office'),
	require('./credits'),
	require('./skills'),
	require('./update-check'),
];

const FIRST_RUN_KEY = 'yana.firstRunRevealed';

// Lần đầu mở Yana Studio: mở sẵn view Yana bên trái. Sau đó tôn trọng lựa chọn của người dùng.
async function revealOnFirstRun(context) {
	if (context.globalState.get(FIRST_RUN_KEY)) return;
	await context.globalState.update(FIRST_RUN_KEY, true);
	// Webview ở thanh phải chỉ được dựng khi container của nó được mở ít nhất một lần.
	await vscode.commands.executeCommand('workbench.view.extension.yana');
	await vscode.commands.executeCommand('workbench.view.extension.yana-explorer');
}

function activateAll(context) {
	const output = vscode.window.createOutputChannel('Yana', { log: true });
	context.subscriptions.push(output);
	revealOnFirstRun(context).catch(error => output.error(`first-run reveal failed: ${error.message}`));
	for (const feature of FEATURES) {
		try {
			feature.activate(context);
			output.info(`feature ${feature.id} activated`);
		} catch (error) {
			output.error(`feature ${feature.id} failed to activate: ${error.stack || error.message}`);
		}
	}
}

module.exports = { activateAll };

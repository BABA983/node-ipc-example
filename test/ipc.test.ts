import { afterAll, assert, beforeAll, suite, test, } from 'vitest';
import { IPCClient } from '../src/client';
import { createIPCServer, IPCServer } from '../src/server';
import { fork, spawn } from 'child_process';
import path from 'path';
import { IDisposable } from '../src/lifecycle';

suite('ipc', async () => {
	let ipcServer: IPCServer;
	const disposableStore: IDisposable[] = [];

	beforeAll(async () => {
		ipcServer = await createIPCServer(process.cwd());
		const disposable = ipcServer.registerHandler('echo', {
			handle: async (data) => {
				return data;
			},
		});
		disposableStore.push(disposable);
	});

	test('test echo', async () => {
		const ipcClient = new IPCClient('echo', ipcServer.getEnv().NODE_IPC_HANDLE);
		const response = await ipcClient.call('string');
		assert.equal(response, 'string');
		const response2 = await ipcClient.call(123);
		assert.equal(response2, 123);
		const response3 = await ipcClient.call(true);
		assert.equal(response3, true);
		const response4 = await ipcClient.call({
			message: 'ipcServer.registerHandler',
		});
		assert.deepEqual(response4, {
			message: 'ipcServer.registerHandler',
		});
	});

	test('spawn new process call ipc echo', async () => {
		const child = spawn(path.join(process.cwd(), 'node_modules/.bin/tsx'), [path.resolve(__dirname, 'client.ts')], {
			env: {
				...process.env,
				NODE_IPC_HANDLE: ipcServer.getEnv().NODE_IPC_HANDLE,
				NODE_IPC_CHANNEL: 'echo',
				NODE_IPC_DATA: '123',
			},

			// stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
		});

		const response: unknown[] = [];

		return new Promise((resolve, reject) => {
			child.send('string');
			child.send(123);
			child.send(true);
			child.send({
				message: 'ipcServer.registerHandler',
			});
			setTimeout(() => {
				child.kill('SIGINT');
			}, 1000);
			child.on('message', (data) => {
				response.push(data);
			});
			child.on('exit', (code) => {
				assert.equal(response[0], 'string');
				assert.equal(response[1], 123);
				assert.equal(response[2], true);
				assert.deepEqual(response[3], {
					message: 'ipcServer.registerHandler',
				});
				resolve(null);
			});
		});
	});

	afterAll(() => {
		disposableStore.forEach(disposable => disposable.dispose());
		ipcServer.dispose();
	});

});

import { IPCClient } from '../src/client';

const ipcHandlePath = process.env['NODE_IPC_HANDLE'];
const channelName = process.env['NODE_IPC_CHANNEL'];
const data = process.env['NODE_IPC_DATA'];
if (!ipcHandlePath) {
	throw new Error('Missing NODE_IPC_HANDLE');
}

if (!channelName) {
	throw new Error('Missing NODE_IPC_CHANNEL');
}

const ipcClient = new IPCClient(channelName, ipcHandlePath);

const pendingRequest: unknown[] = [];

process.on('message', (data) => {
	pendingRequest.push(data);
});

process.on('SIGINT', async (signal) => {
	for await (const request of pendingRequest) {
		const data = await ipcClient.call(request);
		process.send?.(data);
	}
	process.exit(0);
});

process.on('exit', () => {
	console.log('client exit');
});




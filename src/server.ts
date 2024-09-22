import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { IDisposable } from './lifecycle';

export interface IIPCHandler {
	handle(data: unknown): Promise<unknown>;
}

export interface IIPCServer {
	readonly ipcHandlePath: string;
	getEnv(): { [key: string]: string; };
	registerHandler(channel: string, handler: IIPCHandler): IDisposable;
}

export class IPCServer implements IIPCServer, IDisposable {

	private handlers = new Map<string, IIPCHandler>();

	get ipcHandlePath(): string { return this._ipcHandlePath; }

	constructor(private readonly server: http.Server, private readonly _ipcHandlePath: string) {
		this.server.on('request', this.onRequest.bind(this));
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		if (!req.url) {
			console.warn(`Request lacks url`);
			return;
		}
		const handler = this.handlers.get(req.url);

		if (!handler) {
			console.warn(`IPC handler for ${req.url} not found`);
			return;
		}
		const chunks: Buffer[] = [];
		req.on('data', d => chunks.push(d));
		req.on('end', () => {
			const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
			handler.handle(request).then(result => {
				res.writeHead(200);
				res.end(JSON.stringify(result));
			}, () => {
				res.writeHead(500);
				res.end();
			});
		});
	}

	registerHandler(channel: string, handler: IIPCHandler): IDisposable {
		this.handlers.set(`/${channel}`, handler);
		return {
			dispose: () => {
				this.handlers.delete(channel);
			}
		};
	}

	getEnv(): { [key: string]: string; } {
		return { NODE_IPC_HANDLE: this.ipcHandlePath };
	}

	dispose() {
		this.server.close();

		if (this._ipcHandlePath && process.platform !== 'win32') {
			try {
				fs.unlinkSync(this._ipcHandlePath);
			} catch (error) {
				// noop
			}
		}
	}

}

function getIPCHandlePath(hash: string) {
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\node-ipc-${hash}-sock`;
	}
	if (process.platform === 'darwin' && process.env['XDG_RUNTIME_DIR']) {
		return path.join(process.env['XDG_RUNTIME_DIR'] as string, `node-ipc-${hash}.sock`);
	}
	return path.join(os.tmpdir(), `node-ipc-${hash}.sock`);
}


export async function createIPCServer(context?: string): Promise<IPCServer> {
	const server = http.createServer();
	const hash = crypto.createHash('sha256');

	if (!context) {
		const buffer = await new Promise<Buffer>((resolve, reject) => crypto.randomBytes(20, (err, buf) => err ? reject(err) : resolve(buf)));
		hash.update(buffer);
	} else {
		hash.update(context);
	}

	const ipcHandlePath = getIPCHandlePath(hash.digest('hex').substring(0, 10));

	console.log('ipcHandlePath', ipcHandlePath);

	if (process.platform !== 'win32') {
		try {
			await fs.promises.unlink(ipcHandlePath);
		} catch (err) {
			// noop
			// console.warn(`Failed to remove existing IPC socket at ${ipcHandlePath}`, err);
		}
	}


	return new Promise((resolve, reject) => {
		try {
			server.on('error', err => reject(err));
			server.listen(ipcHandlePath);
			resolve(new IPCServer(server, ipcHandlePath));
		} catch (err) {
			reject(err);
		}
	});
}

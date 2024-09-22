import * as http from 'http';

export class IPCClient {

	private ipcHandlePath: string;

	constructor(private channelName: string, _handlePath?: string) {
		const ipcHandlePath = _handlePath ?? process.env['NODE_IPC_HANDLE'];

		if (!ipcHandlePath) {
			throw new Error('Missing NODE_IPC_HANDLE');
		}

		this.ipcHandlePath = ipcHandlePath;
	}

	call(data: unknown, options: { disableMarshalling?: boolean; } = { disableMarshalling: false }): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const req = http.request({
				socketPath: this.ipcHandlePath,
				path: `/${this.channelName}`,
				method: 'POST',
			}, res => {
				if (res.statusCode !== 200) {
					return reject(new Error(`Bad status code: ${res.statusCode}`));
				}

				const chunks: Buffer[] = [];
				res.on('data', d => chunks.push(d));
				res.on('end', () => {
					if (options.disableMarshalling) {
						resolve(chunks);
					} else {
						try {
							resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
						} catch (err) {
							reject(err);
						}
					}
				});
			});

			req.on('error', (err) => reject(err));
			req.write(JSON.stringify(data));
			req.end();
		});
	}
}

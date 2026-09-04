import { afterEach, describe, expect, it, vi } from 'vitest';
import GM_dl from '../src/dl.js';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('GM_dl', () => {
	it('downloads a Blob through an object URL', async () => {
		const objectUrl = 'blob:download';
		const anchor = document.createElement('a');
		const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
		const remove = vi.spyOn(anchor, 'remove');
		const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
		const appendChild = vi.spyOn(document.body, 'appendChild');
		vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
		vi.spyOn(URL, 'revokeObjectURL');

		await GM_dl(new Blob(['content'], { type: 'text/plain' }), 'file.txt');

		expect(createElement).toHaveBeenCalledWith('a');
		expect(anchor).toMatchObject({ href: objectUrl, download: 'file.txt' });
		expect(appendChild).toHaveBeenCalledWith(anchor);
		expect(click).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledOnce();
	});

	it('uses GM_download when native downloads are available', async () => {
		const download = vi.fn((options: { onload: () => void }) => {
			options.onload();
			return { abort: vi.fn() };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'native' });
		vi.stubGlobal('GM_download', download);

		const onload = vi.fn();
		await GM_dl({ url: 'https://example.com/file', name: 'file.txt', onload });

		expect(download).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://example.com/file',
				name: 'file.txt',
			})
		);
		expect(onload).toHaveBeenCalledOnce();
	});

	it('rejects an already-aborted Blob download', async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(GM_dl(new Blob(['content']), 'file.txt', controller.signal)).rejects.toMatchObject(
			{
				name: 'AbortError',
			}
		);
	});

	it('rejects native downloads on provider errors and forwards the error', async () => {
		const providerError = { error: 'not_succeeded', status: 500, statusText: 'Server Error' };
		const download = vi.fn((options: { onerror: (error: typeof providerError) => void }) => {
			options.onerror(providerError);
			return { abort: vi.fn() };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'native' });
		vi.stubGlobal('GM_download', download);

		const onerror = vi.fn();
		await expect(GM_dl({ url: 'https://example.com/file', onerror })).rejects.toBe(providerError);
		expect(onerror).toHaveBeenCalledWith(providerError);
	});

	it('rejects native downloads on timeout and invokes ontimeout', async () => {
		const download = vi.fn((options: { ontimeout: () => void }) => {
			options.ontimeout();
			return { abort: vi.fn() };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'native' });
		vi.stubGlobal('GM_download', download);

		const ontimeout = vi.fn();
		await expect(GM_dl({ url: 'https://example.com/file', ontimeout })).rejects.toMatchObject({
			name: 'TimeoutError',
			message: 'The download timed out.',
		});
		expect(ontimeout).toHaveBeenCalledOnce();
	});

	it('aborts a native download and invokes onabort', async () => {
		const abort = vi.fn();
		const download = vi.fn(() => ({ abort }));
		vi.stubGlobal('GM_info', { downloadMode: 'native' });
		vi.stubGlobal('GM_download', download);
		const controller = new AbortController();
		const onabort = vi.fn();

		const promise = GM_dl({ url: 'https://example.com/file', signal: controller.signal, onabort });
		controller.abort();

		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
		expect(abort).toHaveBeenCalledOnce();
		expect(onabort).toHaveBeenCalledOnce();
	});

	it('rejects HTTP errors from the XHR fallback', async () => {
		let request:
			| { onload: (response: { status: number; statusText: string; response: Blob }) => void }
			| undefined;
		const xmlHttpRequest = vi.fn((options: typeof request) => {
			request = options;
			return { abort: vi.fn() };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'disabled' });
		vi.stubGlobal('GM', { xmlHttpRequest });

		const onerror = vi.fn();
		const promise = GM_dl({ url: 'https://example.com/file', onerror });
		if (!request) throw new Error('XHR request options were not captured');
		request.onload({ status: 404, statusText: 'Not Found', response: new Blob() });

		await expect(promise).rejects.toEqual({
			error: 'not_succeeded',
			details: 'HTTP 404: Not Found',
		});
		expect(onerror).toHaveBeenCalledWith({
			error: 'not_succeeded',
			details: 'HTTP 404: Not Found',
		});
	});

	it('rejects network errors from the XHR fallback', async () => {
		let request:
			| { onerror: (error: { error: string; status: number; statusText: string }) => void }
			| undefined;
		const xmlHttpRequest = vi.fn((options: typeof request) => {
			request = options;
			return { abort: vi.fn() };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'disabled' });
		vi.stubGlobal('GM', { xmlHttpRequest });

		const promise = GM_dl({ url: 'https://example.com/file' });
		if (!request) throw new Error('XHR request options were not captured');
		request.onerror({ error: 'network', status: 0, statusText: 'Offline' });

		await expect(promise).rejects.toEqual({
			error: 'not_succeeded',
			details: 'network - 0: Offline',
		});
	});

	it('rejects XHR timeouts and invokes ontimeout', async () => {
		let request: { ontimeout: () => void } | undefined;
		const xmlHttpRequest = vi.fn((options: typeof request) => {
			request = options;
			return { abort: vi.fn() };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'disabled' });
		vi.stubGlobal('GM', { xmlHttpRequest });
		const ontimeout = vi.fn();

		const promise = GM_dl({ url: 'https://example.com/file', ontimeout });
		if (!request) throw new Error('XHR request options were not captured');
		request.ontimeout();

		await expect(promise).rejects.toMatchObject({ name: 'TimeoutError' });
		expect(ontimeout).toHaveBeenCalledOnce();
	});

	it('aborts an XHR fallback and invokes onabort', async () => {
		let request: { onabort: () => void };
		const abort = vi.fn();
		const xmlHttpRequest = vi.fn((options: typeof request) => {
			request = options;
			return { abort };
		});
		vi.stubGlobal('GM_info', { downloadMode: 'disabled' });
		vi.stubGlobal('GM', { xmlHttpRequest });
		const controller = new AbortController();
		const onabort = vi.fn();

		const promise = GM_dl({ url: 'https://example.com/file', signal: controller.signal, onabort });
		controller.abort();

		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
		expect(abort).toHaveBeenCalledOnce();
		expect(onabort).toHaveBeenCalledOnce();
	});
});

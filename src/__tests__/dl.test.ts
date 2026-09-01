import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, gmXhr } from '../dl.js';

describe('main', () => {
	beforeEach(() => {
		// clear any globals
		// @ts-expect-error
		delete globalThis.GM_xmlhttpRequest;
		// @ts-expect-error
		delete globalThis.GM_download;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('gmXhr resolves with the response and calls original onload', async () => {
		const response = { status: 200, response: 'ok', statusText: 'OK' } as any;

		// mock GM_xmlhttpRequest

		globalThis.GM_xmlhttpRequest = (details: any) => {
			details.onload?.(response);
			return { abort: () => {} };
		};

		const onload = vi.fn();
		const res = await gmXhr({ method: 'GET', url: 'http://x', onload });
		expect(res).toBe(response);
		expect(onload).toHaveBeenCalled();
	});

	it('downloadFile with Blob triggers DOM download', async () => {
		// Ensure URL.createObjectURL exists in this environment

		if (typeof URL.createObjectURL !== 'function') {
			URL.createObjectURL = () => 'blob://polyfill';

			URL.revokeObjectURL = () => {};
		}

		const createSpy = vi.spyOn(URL, 'createObjectURL');
		const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		const blob = new Blob(['hello']);
		await downloadFile(blob, 'file.txt');

		expect(createSpy).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();

		// restore
		createSpy.mockRestore();
		revokeSpy.mockRestore();
		clickSpy.mockRestore();
	});

	it('downloadFile fetches via gmXhr and triggers download', async () => {
		const blob = new Blob(['data']);
		const response = { status: 200, response: blob, statusText: 'OK' } as any;

		// Ensure URL.createObjectURL exists in this environment

		if (typeof URL.createObjectURL !== 'function') {
			URL.createObjectURL = () => 'blob://polyfill';

			URL.revokeObjectURL = () => {};
		}

		const createSpy = vi.spyOn(URL, 'createObjectURL');
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		globalThis.GM_xmlhttpRequest = (details: any) => {
			details.onload?.(response);
			return { abort: () => {} };
		};

		await downloadFile('http://example.com/file', 'file.txt');

		expect(createSpy).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();

		createSpy.mockRestore();
		clickSpy.mockRestore();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGMXmlhttpRequest = vi.fn();

vi.mock('$', () => ({
	GM_xmlhttpRequest: mockGMXmlhttpRequest,
	GM_download: undefined,
	GM_info: {},
}));

const { GM_dl, GM_dl_xhr, GM_xhr } = await import('../dl.js');

describe('main', () => {
	beforeEach(() => {

		// Ensure URL polyfills exist for non-browser environments
		if (typeof URL.createObjectURL !== 'function') {
			URL.createObjectURL = () => 'blob://polyfill';
		}
		if (typeof URL.revokeObjectURL !== 'function') {
			URL.revokeObjectURL = () => {};
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('gmXhr resolves with the response and calls original onload', async () => {
		const response = { status: 200, response: 'ok', statusText: 'OK' } as any;

		mockGMXmlhttpRequest.mockImplementation((details: any) => {
			details.onload?.(response);
			return { abort: () => {} };
		});

		const onload = vi.fn();
		const res = await GM_xhr({ method: 'GET', url: 'http://x', onload });
		expect(res).toBe(response);
		expect(onload).toHaveBeenCalledWith(response);
	});

	it('gmXhr emits onprogress without triggering settlement', async () => {
		const progress = { loaded: 50, total: 100 } as any;
		const response = { status: 200, response: 'ok', statusText: 'OK' } as any;

		mockGMXmlhttpRequest.mockImplementation((details: any) => {
			details.onprogress?.(progress);
			details.onload?.(response);
			return { abort: () => {} };
		});

		const onprogress = vi.fn();
		const onload = vi.fn();
		const res = await GM_xhr({ method: 'GET', url: 'http://x', onprogress, onload });

		expect(onprogress).toHaveBeenCalledWith(progress);
		expect(onload).toHaveBeenCalledWith(response);
		expect(res).toBe(response);
	});

	it('downloadFile with Blob triggers DOM download', async () => {
		const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		const blob = new Blob(['hello']);
		await GM_dl(blob, 'file.txt');

		expect(createSpy).toHaveBeenCalledWith(blob);
		expect(clickSpy).toHaveBeenCalled();
	});

	it('downloadFile fetches via gmXhr and triggers download', async () => {
		const blob = new Blob(['data']);
		const response = { status: 200, response: blob, statusText: 'OK' } as any;

		const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		mockGMXmlhttpRequest.mockImplementation((details: any) => {
			details.onload?.(response);
			return { abort: () => {} };
		});

		await GM_dl('http://example.com/file', 'file.txt');

		expect(createSpy).toHaveBeenCalledWith(blob);
		expect(clickSpy).toHaveBeenCalled();
	});

	it('GM_dl_xhr fetches a blob and emits the same load/error behavior', async () => {
		const blob = new Blob(['data']);
		const response = { status: 200, response: blob, statusText: 'OK' } as any;
		const onload = vi.fn();
		const onerror = vi.fn();
		const ontimeout = vi.fn();
		const onprogress = vi.fn();
		const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		mockGMXmlhttpRequest.mockImplementation((details: any) => {
			details.onprogress?.({ loaded: 10, total: 10 });
			details.onload?.(response);
			return { abort: () => {} };
		});

		await GM_dl_xhr({
			url: 'http://example.com/file',
			name: 'file.txt',
			headers: { Accept: 'application/octet-stream' },
			onload,
			onerror,
			ontimeout,
			onprogress,
		});

		expect(onprogress).toHaveBeenCalled();
		expect(onload).toHaveBeenCalledTimes(1);
		expect(onerror).not.toHaveBeenCalled();
		expect(ontimeout).not.toHaveBeenCalled();
		expect(createSpy).toHaveBeenCalledWith(blob);
		expect(clickSpy).toHaveBeenCalled();
	});
});

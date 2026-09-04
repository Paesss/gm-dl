import { describe, expect, it, vi } from 'vitest';
import { createAbortablePromise, isGmDownloadAvailable, toDownloadRequest } from '../src/utils.js';

describe('toDownloadRequest', () => {
	it('normalizes a URL and default name', () => {
		expect(toDownloadRequest('https://example.com/file')).toEqual({
			url: 'https://example.com/file',
			name: 'download',
			signal: undefined,
		});
	});

	it('preserves option values and prefers the option signal', () => {
		const optionSignal = new AbortController().signal;
		const fallbackSignal = new AbortController().signal;
		const onload = vi.fn();

		expect(
			toDownloadRequest(
				{ url: 'file.txt', name: 'custom.txt', signal: optionSignal, onload },
				'fallback',
				fallbackSignal
			)
		).toEqual({
			url: 'file.txt',
			name: 'custom.txt',
			signal: optionSignal,
			onload,
		});
	});
});

describe('isGmDownloadAvailable', () => {
	it('detects native and browser download modes', () => {
		Object.defineProperty(globalThis, 'GM_info', {
			configurable: true,
			value: { downloadMode: 'native' },
		});
		expect(isGmDownloadAvailable()).toBe(true);

		Object.defineProperty(globalThis, 'GM_info', {
			configurable: true,
			value: { downloadMode: 'browser' },
		});
		expect(isGmDownloadAvailable()).toBe(true);
	});

	it('rejects disabled mode', () => {
		Object.defineProperty(globalThis, 'GM_info', {
			configurable: true,
			value: { downloadMode: 'disabled' },
		});
		expect(isGmDownloadAvailable()).toBe(false);
	});
});

describe('createAbortablePromise', () => {
	it('rejects with the signal reason and calls the cancellation hooks', async () => {
		const controller = new AbortController();
		const cancel = vi.fn();
		const onAbort = vi.fn();
		const promise = createAbortablePromise({
			signal: controller.signal,
			onAbort,
			run: () => cancel,
		});
		const reason = new Error('cancelled');

		controller.abort(reason);

		await expect(promise).rejects.toBe(reason);
		expect(cancel).toHaveBeenCalledOnce();
		expect(onAbort).toHaveBeenCalledOnce();
	});

	it('rejects immediately without running when already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const run = vi.fn();

		await expect(createAbortablePromise({ signal: controller.signal, run })).rejects.toMatchObject({
			name: 'AbortError',
		});
		expect(run).not.toHaveBeenCalled();
	});

	it('continues rejecting when the cancellation handle throws', async () => {
		const controller = new AbortController();
		const onAbort = vi.fn();
		const promise = createAbortablePromise({
			signal: controller.signal,
			onAbort,
			run: () => () => {
				throw new Error('cancel failed');
			},
		});

		controller.abort();

		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
		expect(onAbort).toHaveBeenCalledOnce();
	});
});

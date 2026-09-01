/** biome-ignore-all lint/suspicious/noExplicitAny: Suppressed for testing purposes */
import { describe, expect, it } from 'vitest';
import {
	bindAbortSignal,
	createSettledContext,
	getAbortError,
	normalizeDownloadOptions,
} from '../utils.js';

describe('utils', () => {
	it('getAbortError returns DOMException when no signal reason', () => {
		const err = getAbortError();
		expect(err && (err as any).name).toBe('AbortError');
	});

	it('getAbortError returns signal.reason when provided', () => {
		const controller = new AbortController();
		const reason = new Error('boom');
		controller.abort(reason);
		const err = getAbortError(controller.signal);
		expect(err).toBe(reason);
	});

	it('normalizeDownloadOptions normalizes string and blob inputs', () => {
		const fromString = normalizeDownloadOptions('https://example.com/file');
		expect((fromString as any).url).toBe('https://example.com/file');
		expect((fromString as any).name).toBe('download');

		const obj = { url: 'x', name: 'y', signal: undefined } as any;
		const returned = normalizeDownloadOptions(obj);
		expect(returned).toBe(obj);
	});

	it('createSettledContext ensures single invocation and cleanup', () => {
		let cleaned = false;
		const ctx = createSettledContext(() => () => {
			cleaned = true;
		});

		const wrapped = ctx.wrap((v: number) => v * 2);
		const res = (wrapped as any)(3);
		expect(res).toBe(6);
		expect(cleaned).toBe(true);
		expect(ctx.settled).toBe(true);

		// subsequent calls do nothing
		const second = (wrapped as any)(4);
		expect(second).toBeUndefined();
	});

	it('bindAbortSignal handles undefined signal and immediate abort', () => {
		const noop = bindAbortSignal(
			undefined,
			() => {},
			() => undefined
		);
		expect(typeof noop).toBe('function');

		const controller = new AbortController();
		const reason = new Error('x');
		controller.abort(reason);

		let called = false;
		bindAbortSignal(
			controller.signal,
			(r) => {
				called = true;
				expect(r).toBe(reason);
			},
			() => ({ abort: () => {} })
		);
		expect(called).toBe(true);
	});

	it('bindAbortSignal calls handle.abort on abort', () => {
		const controller = new AbortController();
		let abortedHandle = false;
		let called = false;

		const handle = {
			abort: () => {
				abortedHandle = true;
			},
		};
		bindAbortSignal(
			controller.signal,
			() => {
				called = true;
			},
			() => handle
		);

		controller.abort(new Error('now'));
		expect(called).toBe(true);
		expect(abortedHandle).toBe(true);
	});
});

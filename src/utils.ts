import type { ExtendedDownloadRequest } from './types.js';

/**
 * Returns the abort reason or a default DOMException AbortError.
 */
export function getAbortError(signal?: AbortSignal): Error {
	return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * Normalizes overloaded download options into a unified ExtendedDownloadRequest object.
 */
export function normalizeDownloadOptions(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name?: string,
	signalParam?: AbortSignal
): ExtendedDownloadRequest {
	if (
		typeof optionsOrUrl === 'string' ||
		optionsOrUrl instanceof Blob ||
		optionsOrUrl instanceof File
	) {
		return {
			url: optionsOrUrl,
			name: name ?? 'download',
			signal: signalParam,
		};
	}
	return optionsOrUrl;
}

/**
 * Binds an AbortSignal to a Tampermonkey request handle.
 * Returns a cleanup function that removes the listener.
 */
export function bindAbortSignal(
	signal: AbortSignal | undefined,
	onAbort: (reason: Error) => void,
	getHandle: () => Tampermonkey.AbortHandle<void> | undefined
): () => void {
	if (!signal) return () => {};

	if (signal.aborted) {
		onAbort(getAbortError(signal));
		return () => {};
	}

	const abortHandler = () => {
		getHandle()?.abort();
		onAbort(getAbortError(signal));
	};

	signal.addEventListener('abort', abortHandler, { once: true });

	// Safety re-check to prevent race conditions during handle creation
	if (signal.aborted) {
		abortHandler();
	}

	return () => signal.removeEventListener('abort', abortHandler);
}

/**
 * Creates an idempotent execution context for Promise-based event callbacks.
 * Guarantees that only the first triggered callback executes, invokes cleanup,
 * and ignores all subsequent calls.
 */
export function createSettledContext(getCleanup: () => () => void) {
  let isSettled = false;

  return {
    get settled() {
      return isSettled;
    },
    // biome-ignore lint/suspicious/noExplicitAny: false positive
    wrap<T extends (...args: any[]) => any>(fn: T): T {
      return ((...args: Parameters<T>) => {
        if (isSettled) return;
        isSettled = true;
        getCleanup()();
        return fn(...args);
      }) as T;
    },
  };
}

export const isBlobOrFile = (v: unknown): v is Blob | File => {
    // File inherits from Blob in browsers, so instanceof Blob is sufficient and avoids `any`.
    return v instanceof Blob;
  };
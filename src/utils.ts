
import type { ExtendedDownloadRequest } from './types.js';

const NOOP = () => {};

export const isBlobOrFile = (v: unknown): v is Blob | File => v instanceof Blob;

export function resolveAbortError(signal?: AbortSignal): Error {
	return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}


export function toDownloadRequest(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name = 'download',
	signal?: AbortSignal
): ExtendedDownloadRequest {
	if (optionsOrUrl instanceof URL) {
		return { url: optionsOrUrl.toString(), name, signal };
	} else if (typeof optionsOrUrl === 'string' || isBlobOrFile(optionsOrUrl)) {
		return { url: optionsOrUrl, name, signal };
	}
    const { name: optionsName, signal: optionsSignal } = optionsOrUrl;
	return {
		...optionsOrUrl,
		name: optionsName ?? name,
		signal: optionsSignal ?? signal,
	};
}

export function isGmDownloadAvailable(): boolean {
	const downloadMode = GM_info?.downloadMode;
	if (downloadMode === 'disabled') return false;
	return (
		downloadMode === 'native' || downloadMode === 'browser' || typeof GM_download === 'function'
	);
}

export function attachAbortListener<H extends GmAbortHandle<any> = GmAbortHandle>(
	signal: AbortSignal | undefined,
	onAbort: (reason: Error) => void,
	getAbortHandle: () => H | undefined
): () => void {
	if (!signal) return NOOP;

	if (signal.aborted) {
		onAbort(resolveAbortError(signal));
		return NOOP;
	}

	const abortHandler = () => {
		getAbortHandle()?.abort();
		onAbort(resolveAbortError(signal));
	};

	signal.addEventListener('abort', abortHandler, { once: true });
	return () => signal.removeEventListener('abort', abortHandler);
}

/**
 * Creates a wrapper for terminal callbacks (load, error, timeout, abort).
 * Guarantees that only the first terminal callback runs and triggers cleanup.
 */
export function createOnceGuard(cleanup: () => void) {
	let settled = false;

	return <Args extends unknown[], R>(fn?: (...args: Args) => R) =>
		(...args: Args): R | undefined => {
			if (settled) return;
			settled = true;
			cleanup();
			return fn?.(...args);
		};
}

/**
 * Helper to manage AbortSignal lifecycle, settled wrapper cleanup,
 * and standard handle binding for GM network calls.
 */
export function executeAbortable<H extends GmAbortHandle<any> = GmAbortHandle>(
	signal: AbortSignal | undefined,
	reject: (reason: unknown) => void,
	executor: (guard: ReturnType<typeof createOnceGuard>) => H | undefined,
	onAbort?: () => void
): void {
	let cleanup = NOOP;
	let abortHandle: H | undefined;

	const guard = createOnceGuard(() => cleanup());

	cleanup = attachAbortListener(
		signal,
		guard((reason) => {
			onAbort?.();
			reject(reason);
		}),
		() => abortHandle
	);

	if (signal?.aborted) return;

	try {
		abortHandle = executor(guard);
	} catch (err) {
		cleanup();
		reject(err);
	}
}

export function triggerBlobDownload(
	blob: Blob | File,
	filename: string,
	revokeDelayMs = 10000
): void {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(objectUrl), revokeDelayMs);
}

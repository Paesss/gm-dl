import { resolveAbortError } from './errors.js';
import type { ExtendedDownloadRequest } from './types.js';

export const isBlobOrFile = (v: unknown): v is Blob | File => v instanceof Blob;

export function toDownloadRequest(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name = 'download',
	signal?: AbortSignal
): ExtendedDownloadRequest {
	if (typeof optionsOrUrl === 'string' || isBlobOrFile(optionsOrUrl)) {
		return { url: optionsOrUrl, name, signal };
	}
	return {
		...optionsOrUrl,
		name: optionsOrUrl.name ?? name,
		signal: optionsOrUrl.signal ?? signal,
	};
}

export function isGmDownloadAvailable(): boolean {
	const downloadMode = typeof GM_info !== 'undefined' ? GM_info?.downloadMode : undefined;
	if (downloadMode === 'disabled') return false;
	return (
		downloadMode === 'native' || downloadMode === 'browser' || typeof GM_download === 'function'
	);
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

interface AbortablePromiseOptions<T> {
	signal?: AbortSignal;
	onAbort?: () => void;
	run: (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: unknown) => void
	) => (() => void) | undefined;
}

/**
 * Creates a Promise tied to an AbortSignal, automatically cleaning up
 * event listeners and calling the cancellation handle on abort.
 */
export function createAbortablePromise<T>({
	signal,
	onAbort,
	run,
}: AbortablePromiseOptions<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let cancelHandle: (() => void) | undefined;

		const cleanup = () => {
			if (signal) {
				signal.removeEventListener('abort', handleAbort);
			}
		};

		const handleAbort = () => {
			try {
				cancelHandle?.();
			} catch {}
			onAbort?.();
			safeReject(resolveAbortError(signal));
		};

		const safeResolve = (val: T | PromiseLike<T>) => {
			cleanup();
			resolve(val);
		};

		const safeReject = (err?: unknown) => {
			cleanup();
			reject(err);
		};

		if (signal?.aborted) {
			handleAbort();
			return;
		}

		if (signal) {
			signal.addEventListener('abort', handleAbort, { once: true });
		}

		try {
			cancelHandle = run(safeResolve, safeReject);
		} catch (err) {
			safeReject(err);
		}
	});
}

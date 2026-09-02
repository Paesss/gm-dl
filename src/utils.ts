import { GM_download, GM_info, type GmAbortHandle } from 'vite-plugin-monkey/dist/client';
import type { ExtendedDownloadRequest } from './types.js';

const NOOP = () => {};

export const isBlobOrFile = (v: unknown): v is Blob | File => v instanceof Blob;

export function getAbortError(signal?: AbortSignal): Error {
    return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}

export function normalizeDownloadOptions(
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
    const downloadMode = GM_info?.downloadMode;
    if (downloadMode === 'disabled') return false;
    return downloadMode === 'native' || downloadMode === 'browser' || typeof GM_download === 'function';
}

export function bindAbortSignal<H extends GmAbortHandle<any> = GmAbortHandle>(
    signal: AbortSignal | undefined,
    onAbort: (reason: Error) => void,
    getHandle: () => H | undefined
): () => void {
    if (!signal) return NOOP;

    if (signal.aborted) {
        onAbort(getAbortError(signal));
        return NOOP;
    }

    const abortHandler = () => {
        getHandle()?.abort();
        onAbort(getAbortError(signal));
    };

    signal.addEventListener('abort', abortHandler, { once: true });
    return () => signal.removeEventListener('abort', abortHandler);
}

/**
 * Creates a wrapper for terminal callbacks (load, error, timeout, abort).
 * Guarantees that only the first terminal callback runs and triggers cleanup.
 */
export function createSettled(cleanup: () => void) {
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
export function executeWithSignal<H extends GmAbortHandle<any> = GmAbortHandle>(
    signal: AbortSignal | undefined,
    reject: (reason: unknown) => void,
    executor: (wrap: ReturnType<typeof createSettled>) => H,
    onAbort?: () => void
): void {
    let cleanup = NOOP;
    let abortHandle: H | undefined;

    const wrap = createSettled(() => cleanup());

    cleanup = bindAbortSignal(
        signal,
        wrap((reason) => {
            onAbort?.();
            reject(reason);
        }),
        () => abortHandle
    );

    if (signal?.aborted) return;

    try {
        abortHandle = executor(wrap);
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
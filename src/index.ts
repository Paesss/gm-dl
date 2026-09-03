import { resolveAbortError, resolveTimeoutError } from './errors.js';
import type { ExtendedDownloadRequest } from './types.js';
import {
    executeAbortable,
    isBlobOrFile,
    isGmDownloadAvailable,
    toDownloadRequest,
    triggerBlobDownload,
} from './utils.js';

const MAX_XHR_FILE_SIZE_MB = 500;
const MAX_XHR_FILE_SIZE_BYTES = MAX_XHR_FILE_SIZE_MB * 1024 ** 2;

function GM_download_native(options: ExtendedDownloadRequest): Promise<void> {
    return new Promise((resolve, reject) => {
        const {
            signal,
            onload: originalOnload,
            onerror: originalOnError,
            ontimeout: originalOnTimeout,
            onabort: originalOnAbort,
            ...gmDetails
        } = options;

        executeAbortable(
            signal,
            reject,
            (guard) =>
                GM_download({
                    ...gmDetails,
                    onload: guard(() => {
                        originalOnload?.();
                        resolve();
                    }),
                    onerror: guard((err) => {
                        originalOnError?.call(err, err);
                        reject(err);
                    }),
                    ontimeout: guard(() => {
                        originalOnTimeout?.();
                        reject(resolveTimeoutError('The download timed out.'));
                    }),
                }),
            originalOnAbort
        );
    });
}

function GM_dl_xhr(details: ExtendedDownloadRequest): Promise<void> {
    return new Promise((resolve, reject) => {
        const {
            url,
            name: filename,
            signal,
            onerror: originalOnError,
            ontimeout: originalOnTimeout,
            onabort: originalOnAbort,
            onload: originalOnload,
            onprogress: originalOnProgress,
            ...gmDetails
        } = details;

        if (typeof url !== 'string') {
            reject(new TypeError('GM_dl_xhr requires a string URL'));
            return;
        }

        let checkedFileSize = false;
        const checkFileSize = (bytes: number) => {
            checkedFileSize = true;
            if (bytes > MAX_XHR_FILE_SIZE_BYTES) {
                const fileSizeMB = (bytes / (1024 * 1024)).toFixed(2);
                console.warn(
                    `[GM_dl_xhr] Warning: File size of ${fileSizeMB} MB exceeds the ${MAX_XHR_FILE_SIZE_MB} MB threshold.`
                );
            }
        };

        executeAbortable(
            signal,
            reject,
            (guard) =>
                GM.xmlHttpRequest({
                    ...gmDetails,
                    url,
                    method: 'GET',
                    responseType: 'blob',
                    onprogress: (progress) => {
                        if (!checkedFileSize) {
                            if (typeof progress.total === 'number' && progress.total > 0) {
                                // Known total: Check once and finalize
                                checkFileSize(progress.total);
                            } else if (
                                typeof progress.loaded === 'number' &&
                                progress.loaded > MAX_XHR_FILE_SIZE_BYTES
                            ) {
                                // Unknown total: Check continuously until loaded exceeds max threshold
                                checkFileSize(progress.loaded);
                            }
                        }
                        originalOnProgress?.call(progress, progress);
                    },
                    onload: guard((res) => {
                        if (res.status < 200 || res.status >= 300) {
                            const details = `HTTP ${res.status}: ${res.statusText}`;
                            const errResponse: GmDownloadErrorEvent = {
                                error: 'not_succeeded',
                                details,
                            };
                            originalOnError?.call(errResponse, errResponse);
                            reject(new Error(details));
                            return;
                        }

                        const blob = res.response;
                        if (!checkedFileSize && blob?.size) {
                            checkFileSize(blob.size);
                        }

                        triggerBlobDownload(blob, filename);
                        originalOnload?.();
                        resolve();
                    }),
                    onerror: guard((err) => {
                        const errResponse: GmDownloadErrorEvent = {
                            error: 'not_succeeded',
                            details:
                                err && typeof err === 'object' && 'details' in err
                                    ? String(err.details)
                                    : String(err),
                        };
                        originalOnError?.call(errResponse, errResponse);
                        reject(err);
                    }),
                    ontimeout: guard(() => {
                        originalOnTimeout?.();
                        reject(resolveTimeoutError('The download timed out.'));
                    }),
                    onabort: guard(() => {
                        originalOnAbort?.();
                        reject(resolveAbortError(signal));
                    }),
                }),
            originalOnAbort
        );
    });
}

function GM_dl(url: string | Blob | File, name: string, signal?: AbortSignal): Promise<void>;
function GM_dl(options: ExtendedDownloadRequest): Promise<void>;
async function GM_dl(
    optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
    name?: string,
    signalParam?: AbortSignal
): Promise<void> {
    const details = toDownloadRequest(optionsOrUrl, name, signalParam);
    const { url, signal } = details;

    if (isBlobOrFile(url)) {
        if (signal?.aborted) {
            throw resolveAbortError(signal);
        }
        triggerBlobDownload(url, details.name);
        details.onload?.();
        return;
    }

    if (isGmDownloadAvailable()) {
        return await GM_download_native(details);
    }

    return await GM_dl_xhr(details);
}

export default GM_dl;
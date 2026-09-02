
import type { ExtendedDownloadRequest, ExtendedRequest } from './types.js';

import {
	executeAbortable,
	isBlobOrFile,
	isGmDownloadAvailable,
	resolveAbortError,
	toDownloadRequest,
	triggerBlobDownload,
} from './utils.js';


export function GM_xhr<R extends GmResponseType = 'blob', C = any>(
	details: ExtendedRequest<R, C>
): Promise<GmResponseEvent<R, C>> {
	return new Promise((resolve, reject) => {
		const {
			signal,
			onload: originalOnload,
			onerror: originalOnError,
			ontimeout: originalOnTimeout,
			onabort: originalOnAbort,
			onprogress: originalOnProgress,
			...gmDetails
		} = details;

		executeAbortable(
			signal,
			reject,
			(guard) =>
				GM.xmlHttpRequest({
					...gmDetails,
					onload: guard((res) => {
						originalOnload?.call(res, res);
						resolve(res);
					}),
					onerror: guard((err) => {
						originalOnError?.call(err, err);
						reject(err);
					}),
					ontimeout: guard(() => {
						originalOnTimeout?.call(undefined as never);
						reject(new Error('Request timed out'));
					}),
					onabort: guard(() => {
						originalOnAbort?.call(undefined as never);
						reject(resolveAbortError(signal));
					}),
					// Progress events are non-terminal, so they bypass guard
					onprogress: (progress) => {
						originalOnProgress?.call(progress, progress);
					},
				}),
			() => originalOnAbort?.call(undefined as never)
		);
	});
}


export function GM_download_native(options: ExtendedDownloadRequest): Promise<void> {
	return new Promise((resolve, reject) => {
		const {
			signal,
			onload: originalOnload,
			onerror: originalOnError,
			ontimeout: originalOnTimeout,
			//onprogress: originalOnProgress,
			...gmDetails
		} = options;

		executeAbortable(signal, reject, (guard) =>
			GM_download({
				...gmDetails,
				onload: guard(() => {
					originalOnload?.call(undefined as never);
					resolve();
				}),
				onerror: guard((err) => {
					originalOnError?.call(err, err);
					reject(err);
				}),
				ontimeout: guard(() => {
					originalOnTimeout?.call(undefined as never);
					reject(new Error('Download timed out'));
				}),
				// Progress events are non-terminal, so they bypass guard
				/**onprogress: (prog) => {
					originalOnProgress?.call(prog, prog);
				},**/
			})
		);
	});
}
const MAX_XHR_FILE_SIZE_MB = 500;
const MAX_XHR_FILE_SIZE_BYTES = MAX_XHR_FILE_SIZE_MB * 1024 ** 2;


export async function GM_dl_xhr(details: ExtendedDownloadRequest): Promise<void> {
	const {
		url,
		name: filename,
		signal,
		headers,
		timeout,
		onerror: originalOnError,
		ontimeout: originalOnTimeout,
		onload: originalOnload,
		onprogress: originalOnProgress,
	} = details;

	if (typeof url !== 'string') {
		throw new TypeError('GM_dl_xhr requires a string URL');
	}

	try {
		let checkedFileSize = false;
		const checkFileSize = (bytes: number) => {
			if (!checkedFileSize && bytes > MAX_XHR_FILE_SIZE_BYTES) {
				checkedFileSize = true;
				const fileSizeMB = (bytes / (1024 * 1024)).toFixed(2);
				console.warn(
					`[GM_dl_xhr] Warning: File size of ${fileSizeMB} mb exceeds the ${MAX_XHR_FILE_SIZE_MB} mb threshold.
                    This may lead to performance issues or browser limitations.`
				);
			}
		};

		const response = await GM_xhr({
			method: 'GET',
			url,
			headers,
			timeout,
			signal,
			responseType: 'blob',
			onprogress: (progress) => {
				if (progress.total) {
					checkFileSize(progress.total);
				} else if (progress.loaded) {
					checkFileSize(progress.loaded);
				}
				originalOnProgress?.call(progress, progress);
			},
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const blob = response.response as Blob;
		if (blob?.size) {
			checkFileSize(blob.size);
		}

		triggerBlobDownload(blob, filename);
		originalOnload?.call(undefined as never);
	} catch (error: unknown) {
		const isError = error instanceof Error;
		const isTimeout = isError && error.message === 'Request timed out';
		const isAbort = isError && error.name === 'AbortError';

		if (isTimeout) {
			originalOnTimeout?.();
		} else if (!isAbort) {
			const errResponse: GmDownloadErrorEvent = {
				error: 'not_succeeded',
				details: isError ? error.message : String(error),
			};
			originalOnError?.call(errResponse as never, errResponse);
		}

		throw error;
	}
}

export function GM_dl(url: string | Blob | File, name: string, signal?: AbortSignal): Promise<void>;
export function GM_dl(options: ExtendedDownloadRequest): Promise<void>;
export async function GM_dl(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name?: string,
	signalParam?: AbortSignal
): Promise<void> {
	const details = toDownloadRequest(optionsOrUrl, name, signalParam);
	const { url, signal } = details;

	// Direct Blob/File fallback (GM_download expects string URLs)
	if (isBlobOrFile(url)) {
		if (signal?.aborted) {
			throw resolveAbortError(signal);
		}
		triggerBlobDownload(url, details.name);
		details.onload?.call(undefined as never);
		return;
	}

	if (isGmDownloadAvailable()) {
		return GM_download_native(details);
	}

	return GM_dl_xhr(details);
}

export default GM_dl;

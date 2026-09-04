import { resolveAbortError, resolveTimeoutError } from './errors.js';
import type { ExtendedDownloadRequest } from './types.js';
import {
	createAbortablePromise,
	isBlobOrFile,
	isGmDownloadAvailable,
	toDownloadRequest,
	triggerBlobDownload,
} from './utils.js';

const MAX_XHR_FILE_SIZE_MB = 500;
const MAX_XHR_FILE_SIZE_BYTES = MAX_XHR_FILE_SIZE_MB * 1024 ** 2;

function checkXhrFileSize(bytes: number): void {
	if (bytes > MAX_XHR_FILE_SIZE_BYTES) {
		const fileSizeMB = (bytes / 1024 ** 2).toFixed(2);
		console.warn(
			`[GM_dl_xhr] Warning: File size of ${fileSizeMB} MB exceeds the ${MAX_XHR_FILE_SIZE_MB} MB threshold.`
		);
	}
}

function GM_download_native(options: ExtendedDownloadRequest): Promise<void> {
	const { signal, onload, onerror, ontimeout, onabort, ...gmDetails } = options;

	return createAbortablePromise({
		signal,
		onAbort: onabort,
		run: (resolve, reject) => {
			const handle = GM_download({
				...gmDetails,
				onload: () => {
					onload?.();
					resolve();
				},
				onerror: (err) => {
					onerror?.call(err, err);
					reject(err);
				},
				ontimeout: () => {
					ontimeout?.();
					reject(resolveTimeoutError('The download timed out.'));
				},
			});

			return () => handle?.abort();
		},
	});
}

function GM_dl_xhr(details: ExtendedDownloadRequest): Promise<void> {
	const {
		url,
		name: filename,
		signal,
		onerror,
		ontimeout,
		onabort,
		onload,
		onprogress,
		...gmDetails
	} = details;

	if (typeof url !== 'string') {
		return Promise.reject(new TypeError('GM_dl_xhr requires a string URL'));
	}

	return createAbortablePromise({
		signal,
		onAbort: onabort,
		run: (resolve, reject) => {
			let checkedFileSize = false;

			const xhr = GM.xmlHttpRequest({
				...gmDetails,
				url,
				method: 'GET',
				responseType: 'blob',
				onprogress: (progress) => {
					if (!checkedFileSize) {
						const size = progress.total > 0 ? progress.total : progress.loaded;
						if (size > 0) {
							checkXhrFileSize(size);
							checkedFileSize = true;
						}
					}
					onprogress?.call(progress, progress);
				},
				onload: (res) => {
					if (res.status < 200 || res.status >= 300) {
						const downloadError: GmDownloadErrorEvent = {
							error: 'not_succeeded',
							details: `HTTP ${res.status}: ${res.statusText}`,
						};
						onerror?.call(downloadError, downloadError);
						reject(downloadError);
						return;
					}

					const blob = res.response;
					if (!checkedFileSize && blob?.size) {
						checkXhrFileSize(blob.size);
					}

					triggerBlobDownload(blob, filename);
					onload?.();
					resolve();
				},
				onerror: (err) => {
					const downloadError: GmDownloadErrorEvent = {
						error: 'not_succeeded',
						details: `${err.error} - ${err.status}: ${err.statusText}`,
					};
					onerror?.call(downloadError, downloadError);
					reject(downloadError);
				},
				ontimeout: () => {
					ontimeout?.();
					reject(resolveTimeoutError('The download timed out.'));
				},
				onabort: () => {
					onabort?.();
					reject(resolveAbortError(signal));
				},
			});

			return () => xhr?.abort();
		},
	});
}

export function GM_dl(url: string | Blob | File, name: string, signal?: AbortSignal): Promise<void>;
export function GM_dl(options: ExtendedDownloadRequest): Promise<void>;
export async function GM_dl(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name?: string,
	signalParam?: AbortSignal
): Promise<void> {
	const details = toDownloadRequest(optionsOrUrl, name, signalParam);

	if (isBlobOrFile(details.url)) {
		if (details.signal?.aborted) {
			throw resolveAbortError(details.signal);
		}
		triggerBlobDownload(details.url, details.name);
		details.onload?.();
		return;
	}

	if (isGmDownloadAvailable()) {
		return GM_download_native(details);
	}

	return GM_dl_xhr(details);
}

export default GM_dl;

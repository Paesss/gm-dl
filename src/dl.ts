import {
	GM_download,
	GM_xmlhttpRequest,
	type GmDownloadErrorEvent,
	type GmResponseEvent,
	type GmResponseType,
} from 'vite-plugin-monkey/dist/client';
import type { ExtendedDownloadRequest, ExtendedRequest } from './types.js';
import {
	executeWithSignal,
	getAbortError,
	isBlobOrFile,
	isGmDownloadAvailable,
	normalizeDownloadOptions,
	triggerBlobDownload,
} from './utils.js';

export function GM_xhr<R extends GmResponseType = 'text', C = any>(
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

		executeWithSignal(
			signal,
			reject,
			(wrap) =>
				GM_xmlhttpRequest({
					...gmDetails,
					onload: wrap((res) => {
						originalOnload?.call(res, res);
						resolve(res);
					}),
					onerror: wrap((err) => {
						originalOnError?.call(err, err);
						reject(err);
					}),
					ontimeout: wrap(() => {
						originalOnTimeout?.call(undefined as never);
						reject(new Error('Request timed out'));
					}),
					onabort: wrap(() => {
						originalOnAbort?.call(undefined as never);
						reject(getAbortError(signal));
					}),
					// Progress events are non-terminal, so they bypass wrap
					onprogress: (progress) => {
						originalOnProgress?.call(progress, progress);
					},
				}),
			() => originalOnAbort?.call(undefined as never)
		);
	});
}

export function GM_download_native(
	url: string | Blob | File,
	name: string,
	signal?: AbortSignal
): Promise<void>;
export function GM_download_native(options: ExtendedDownloadRequest): Promise<void>;
export function GM_download_native(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name?: string,
	signalParam?: AbortSignal
): Promise<void> {
	const details = normalizeDownloadOptions(optionsOrUrl, name, signalParam);

	return new Promise((resolve, reject) => {
		const {
			signal,
			onload: originalOnload,
			onerror: originalOnError,
			ontimeout: originalOnTimeout,
			onprogress: originalOnProgress,
			...gmDetails
		} = details;

		executeWithSignal(signal, reject, (wrap) =>
			GM_download({
				...gmDetails,
				onload: wrap(() => {
					originalOnload?.call(undefined as never);
					resolve();
				}),
				onerror: wrap((err) => {
					originalOnError?.call(err, err);
					reject(err);
				}),
				ontimeout: wrap(() => {
					originalOnTimeout?.call(undefined as never);
					reject(new Error('Download timed out'));
				}),
				// Progress events are non-terminal, so they bypass wrap
				onprogress: (prog) => {
					originalOnProgress?.call(prog, prog);
				},
			})
		);
	});
}

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
		const response = await GM_xhr({
			method: 'GET',
			url,
			headers,
			timeout,
			signal,
			responseType: 'blob',
			onprogress: originalOnProgress,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		triggerBlobDownload(response.response as Blob, filename);
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
	const details = normalizeDownloadOptions(optionsOrUrl, name, signalParam);
	const { url, signal } = details;

	// Direct Blob/File fallback (GM_download expects string URLs)
	if (isBlobOrFile(url)) {
		if (signal?.aborted) {
			throw getAbortError(signal);
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

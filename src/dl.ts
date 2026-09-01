import type { ExtendedDownloadRequest, ExtendedRequest } from './types.js';
import { bindAbortSignal, createSettledContext, getAbortError, isBlobOrFile, normalizeDownloadOptions } from './utils.js';

/**
 * Triggers a file download in the browser DOM using a Blob URL and hidden anchor element.
 */
function triggerBlobDownload(blob: Blob | File, filename: string, revokeDelayMs: number = 60_000): void {
	const blobUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = blobUrl;
	anchor.download = filename;
	anchor.style.display = 'none';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();

	// Revoke after 60s to allow browser download manager to process safely
	setTimeout(() => URL.revokeObjectURL(blobUrl), revokeDelayMs);
}

// ============================================================================
// Main API Wrappers
// ============================================================================


/**
 * Promisified wrapper for GM_xmlhttpRequest supporting AbortController signals.
 */
export function gmXhr<TContext = unknown>(
  details: ExtendedRequest<TContext>
): Promise<Tampermonkey.Response<TContext>> {
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

    let cleanup = () => {};
    let abortHandle: Tampermonkey.AbortHandle<void> | undefined;

    const { wrap } = createSettledContext(() => cleanup);

    cleanup = bindAbortSignal(
      signal,
      wrap((reason) => {
        originalOnAbort?.call(undefined as never);
        reject(reason);
      }),
      () => abortHandle
    );

    if (signal?.aborted) return;

    abortHandle = GM_xmlhttpRequest({
      ...gmDetails,
      onload: wrap((res) => {
        originalOnload?.call(res, res);
        resolve(res);
      }),
      onprogress: wrap((progress) => {
        originalOnProgress?.call(progress, progress);
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
    });
  });
}

/**
 * Promisified wrapper for GM_download supporting AbortController signals.
 */
export function gmDownload(options: ExtendedDownloadRequest): Promise<void>;
export function gmDownload(
  url: string | Blob | File,
  name: string,
  signal?: AbortSignal
): Promise<void>;
export function gmDownload(
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

    let cleanup = () => {};
    let abortHandle: Tampermonkey.AbortHandle<void> | undefined;

    const { wrap } = createSettledContext(() => cleanup);

    cleanup = bindAbortSignal(
      signal,
      wrap((reason) => reject(reason)),
      () => abortHandle
    );

    if (signal?.aborted) return;

    abortHandle = GM_download({
      ...gmDetails,
      onload: wrap(() => {
        originalOnload?.call(undefined as never);
        resolve();
      }),
      onprogress: wrap((prog) => {
        originalOnProgress?.call(prog, prog);
      }),
      onerror: wrap((err) => {
        originalOnError?.call(err, err);
        reject(err);
      }),
      ontimeout: wrap(() => {
        originalOnTimeout?.call(undefined as never);
        reject(new Error('Download timed out'));
      }),
    });
  });
}
/**
 * Generic download function. Uses native GM_download if available for string URLs;
 * otherwise falls back to GM_xmlhttpRequest with a Blob DOM download anchor.
 */
export function downloadFile(options: ExtendedDownloadRequest): Promise<void>;
export function downloadFile(
	url: string | Blob | File,
	name: string,
	signal?: AbortSignal
): Promise<void>;
export async function downloadFile(
	optionsOrUrl: ExtendedDownloadRequest | string | Blob | File,
	name?: string,
	signalParam?: AbortSignal
): Promise<void> {
	const details = normalizeDownloadOptions(optionsOrUrl, name, signalParam);

	// Native GM_download requires a URL string; fallback to Blob download for Blob/File objects
	if (typeof GM_download === 'function' && typeof details.url === 'string') {
		return gmDownload(details);
	}

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

  // Direct Blob / File handling
  

  if (isBlobOrFile(url)) {
    if (signal?.aborted) {
      throw getAbortError(signal);
    }
    triggerBlobDownload(url, filename);
    originalOnload?.call(undefined as never);
    return;
  }

	try {
		const response = await gmXhr({
			method: 'GET',
			url,
			headers,
			timeout,
			signal,
			responseType: 'blob',
			onprogress: originalOnProgress,
		});

		if (response.status < 200 || response.status >= 300) {
			const errResponse: Tampermonkey.DownloadErrorResponse = {
				error: 'not_succeeded',
				details: `HTTP ${response.status}: ${response.statusText}`,
			};
			originalOnError?.call(errResponse as never, errResponse);
			throw new Error(errResponse.details);
		}

		triggerBlobDownload(response.response as Blob, filename);
		originalOnload?.call(undefined as never);
	} catch (error: unknown) {
		const isAbort = error instanceof Error && error.name === 'AbortError';

		if (error instanceof Error && error.message === 'Request timed out') {
			originalOnTimeout?.call(undefined as never);
		} else if (!isAbort) {
			const errResponse: Tampermonkey.DownloadErrorResponse = {
				error: 'not_succeeded',
				details: error instanceof Error ? error.message : String(error),
			};
			originalOnError?.call(errResponse as never, errResponse);
		}
		throw error;
	}
}

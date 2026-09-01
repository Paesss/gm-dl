import type { GmDownloadOptions, GmResponseType, GmXmlhttpRequestOption } from '$';

export type ExtendedRequest<R extends GmResponseType = 'text', C = any> = GmXmlhttpRequestOption<
	R,
	C
> & {
	signal?: AbortSignal;
};

export type ExtendedDownloadRequest = GmDownloadOptions & {
	signal?: AbortSignal;
};

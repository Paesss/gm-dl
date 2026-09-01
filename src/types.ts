export type ExtendedRequest<TContext = unknown> = Tampermonkey.Request<TContext> & {
	signal?: AbortSignal;
};

export type ExtendedDownloadRequest = Tampermonkey.DownloadRequest & {
	signal?: AbortSignal;
};

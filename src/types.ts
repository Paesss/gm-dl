export type ExtendedDownloadRequest = GmDownloadOptions & {
	onabort?: () => void;
	signal?: AbortSignal;
};

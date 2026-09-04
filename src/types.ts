import 'vite-plugin-monkey/global';

export type ExtendedDownloadRequest = GmDownloadOptions & {
	onabort?: () => void;
	signal?: AbortSignal;
};

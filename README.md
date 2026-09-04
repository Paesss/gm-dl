# gm-dl

A lightweight download helper for userscript environments that uses `GM_download` when available and falls back to an XHR-based implementation when it is not.

## Why use it?

In browser userscripts, downloading files can be inconsistent across managers and browsers. `gm-dl` gives you one simple API and handles the common cases for you:

- uses the native userscript download API when supported
- falls back to `GM.xmlHttpRequest` with blob downloading when needed
- supports `AbortSignal` cancellation
- supports lifecycle callbacks such as `onload`, `onerror`, `ontimeout`, and `onabort`
- works with a plain URL, `Blob`, or `File`, or with a full request object

## Installation

```bash
npm install gm-dl
```

## Quick start

### Download from a URL

```ts
import GM_dl from 'gm-dl';

const signal = AbortSignal.timeout(30000);

await GM_dl('https://example.com/file.zip', 'file.zip', signal);
```

### Download from a Blob or File

```ts
import GM_dl from 'gm-dl';

const blob = new Blob(['hello world'], { type: 'text/plain' });
await GM_dl(blob, 'hello.txt');
```

### Use a full options object

```ts
import GM_dl from 'gm-dl';

await GM_dl({
  url: 'https://example.com/file.pdf',
  name: 'document.pdf',
  headers: {
    Accept: 'application/pdf',
  },
  onload: () => console.log('Download complete'),
  onerror: (error) => console.error('Download failed', error),
  ontimeout: () => console.warn('Download timed out'),
  onabort: () => console.warn('Download aborted'),
});
```

## API

### `GM_dl(url, name, signal?)`

Download a file from a URL or from a `Blob`/`File` object.

### `GM_dl(options)`

Download using a request-like object. This is the full request shape accepted by the library:

```ts
type ExtendedDownloadRequest = GmDownloadOptions & {
  onabort?: () => void;
  signal?: AbortSignal;
};
```

The supported fields are:

```ts
interface GmDownloadOptions {
  url: string | Blob | File;
  name: string;
  headers?: Record<string, string>;
  saveAs?: boolean;
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
  timeout?: number;
  onerror?: (event: GmDownloadErrorEvent) => void;
  ontimeout?: () => void;
  onload?: () => void;
  onprogress?: (event: GmDownloadProgressEvent) => void;
}
```

And the library adds two convenience options:

```ts
interface ExtendedDownloadRequest extends GmDownloadOptions {
  signal?: AbortSignal;
  onabort?: () => void;
}
```

#### Option details

- `url: string | Blob | File` — the resource to download. A string URL is used for remote downloads; a Blob/File is downloaded directly.
- `name: string` — the file name to save locally.
- `headers?: Record<string, string>` — optional HTTP headers for remote downloads.
- `saveAs?: boolean` — whether to show the browser's Save As dialog.
- `conflictAction?: 'uniquify' | 'overwrite' | 'prompt'` — how to handle a filename collision.
- `timeout?: number` — timeout in milliseconds.
- `onerror?: (event: GmDownloadErrorEvent) => void` — called when the download fails.
- `ontimeout?: () => void` — called when the download exceeds `timeout`.
- `onload?: () => void` — called when the download completes successfully.
- `onprogress?: (event: GmDownloadProgressEvent) => void` — called as download progress updates.
- `signal?: AbortSignal` — aborts the operation from the caller if the signal is triggered.
- `onabort?: () => void` — called when the operation is interrupted via `signal` or the internal abort logic.

`GmDownloadErrorEvent` is shaped like this:

```ts
interface GmDownloadErrorEvent {
  error:
    | 'not_enabled'
    | 'not_whitelisted'
    | 'not_permitted'
    | 'not_supported'
    | 'not_succeeded';
  details?: string;
}
```

`GmDownloadProgressEvent` is the browser-style progress event for downloads, and includes the downloaded file's final URL in addition to the usual progress fields.

## Development

```bash
npm install
npm run build
npm run test
```

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — build the distributable files
- `npm run preview` — preview the build locally
- `npm run test` — run the Vitest suite

## License

MIT

export const GM_xmlhttpRequest = (...args: any[]) => {
  throw new Error('GM_xmlhttpRequest should be mocked in tests');
};

export const GM_download = (...args: any[]) => {
  throw new Error('GM_download should be mocked in tests');
};

export const GM_info = { downloadMode: 'browser' };

export function resolveAbortError(signal?: AbortSignal): Error {
	if (signal?.reason instanceof Error) return signal.reason;
	return new DOMException('Aborted', 'AbortError');
}

export function resolveTimeoutError(message = 'The request timed out.'): DOMException {
    return new DOMException(message, 'TimeoutError');
}
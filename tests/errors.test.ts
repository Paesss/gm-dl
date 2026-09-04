import { describe, expect, it } from 'vitest';
import { resolveAbortError, resolveTimeoutError } from '../src/errors.js';

describe('error helpers', () => {
	it('uses an Error signal reason for aborts', () => {
		const reason = new Error('user cancelled');
		const controller = new AbortController();
		controller.abort(reason);

		expect(resolveAbortError(controller.signal)).toBe(reason);
	});

	it('creates standard DOM exceptions for missing or non-Error abort reasons', () => {
		expect(resolveAbortError()).toMatchObject({ name: 'AbortError', message: 'Aborted' });

		const controller = new AbortController();
		controller.abort('cancelled');
		expect(resolveAbortError(controller.signal)).toMatchObject({
			name: 'AbortError',
			message: 'Aborted',
		});
	});

	it('creates timeout exceptions with a default and custom message', () => {
		expect(resolveTimeoutError()).toMatchObject({
			name: 'TimeoutError',
			message: 'The request timed out.',
		});
		expect(resolveTimeoutError('download timed out')).toMatchObject({
			name: 'TimeoutError',
			message: 'download timed out',
		});
	});
});

import { describe, expect, test } from 'bun:test';
import { normalizeEmailBody } from './telegram.js';

describe('normalizeEmailBody', () => {
	test('prefers plain text body and removes excess whitespace', () => {
		expect(normalizeEmailBody('  Hello\n\n\nWorld  ', '<p>Ignored</p>')).toBe('Hello\nWorld');
	});

	test('returns fallback when no text or html body exists', () => {
		expect(normalizeEmailBody('', null)).toBe('(No text body)');
	});

	test('converts html-only email into readable plain text', () => {
		const html = `
			<html>
				<body>
					<h1>Your temporary ChatGPT login code</h1>
					<table>
						<tr><td>Enter this temporary verification code to continue:</td></tr>
						<tr><td>719278</td></tr>
					</table>
					<p>If you were not trying to log in to ChatGPT, please reset your password.</p>
					<p>Best,<br>The ChatGPT team</p>
				</body>
			</html>
		`;

		expect(normalizeEmailBody('', html)).toBe(
			[
				'Your temporary ChatGPT login code',
				'Enter this temporary verification code to continue:',
				'719278',
				'If you were not trying to log in to ChatGPT, please reset your password.',
				'Best,',
				'The ChatGPT team'
			].join('\n')
		);
	});

	test('keeps links readable with the href beside linked text', () => {
		const html = '<p>Open <a href="https://example.com/reset?token=abc&amp;next=login">reset password</a>.</p>';

		expect(normalizeEmailBody('', html)).toBe(
			'Open reset password (https://example.com/reset?token=abc&next=login).'
		);
	});

	test('decodes named and numeric html entities', () => {
		const html = '<p>Tom &amp; Jerry &#8212; code: &#x31;&#x32;&#x33;</p>';

		expect(normalizeEmailBody('', html)).toBe('Tom & Jerry — code: 123');
	});

	test('formats list items and removes duplicate adjacent lines', () => {
		const html = `
			<ul>
				<li>First item</li>
				<li>Second item</li>
			</ul>
			<p>Footer</p>
			<p>Footer</p>
		`;

		expect(normalizeEmailBody('', html)).toBe('- First item\n- Second item\nFooter');
	});
});

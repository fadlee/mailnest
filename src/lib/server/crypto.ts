const VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(value: string): Uint8Array {
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
	const binary = atob(padded);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
	if (!secret.trim()) {
		throw new Error('ENCRYPTION_KEY is required to encrypt Telegram bot tokens');
	}

	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
	return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
	const key = await deriveAesKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));

	return [VERSION, base64UrlEncode(iv), base64UrlEncode(new Uint8Array(ciphertext))].join('.');
}

export async function decryptSecret(encrypted: string, secret: string): Promise<string> {
	const [version, ivValue, ciphertextValue] = encrypted.split('.');
	if (version !== VERSION || !ivValue || !ciphertextValue) {
		throw new Error('Encrypted secret format is invalid');
	}

	const key = await deriveAesKey(secret);
	const iv = base64UrlDecode(ivValue);
	const ciphertext = base64UrlDecode(ciphertextValue);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: new Uint8Array(iv) },
		key,
		new Uint8Array(ciphertext)
	);

	return decoder.decode(plaintext);
}

export function createSecretPreview(value: string): string {
	if (value.length <= 12) return 'configured';
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

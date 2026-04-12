/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				R2?: R2Bucket; // Optional: for storing email attachments
				MAIL_DOMAIN: string; // e.g. "example.com"
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};

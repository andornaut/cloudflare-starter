import type { D1Database } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			isAdmin: boolean;
		}
		interface Platform {
			env: {
				DB: D1Database;
				ADMIN_SECRET: string;
			};
		}
	}
}

export {};

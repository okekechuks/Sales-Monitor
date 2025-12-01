declare const __app_id: string;
declare const __firebase_config: string;
declare const __initial_auth_token: string;

declare module 'firebase/app';
declare module 'firebase/auth';
declare module 'firebase/firestore';

interface ImportMetaEnv {
	readonly VITE_APP_ID?: string;
	readonly VITE_FIREBASE_CONFIG?: string; // JSON string
	readonly VITE_INITIAL_AUTH_TOKEN?: string;
}
interface ImportMeta {
	readonly env: ImportMetaEnv;
}

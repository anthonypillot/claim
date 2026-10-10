export const ADMINISTRATOR = 1n << 3n;
export const MANAGE_SERVER = 1n << 5n;
export const VIEW_CHANNEL = 1n << 10n;
export const SEND_MESSAGES = 1n << 11n;
export const EMBED_LINKS = 1n << 14n;
export const DESTINATION_PERMISSIONS = VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS;
export const MANAGEMENT_PERMISSIONS = MANAGE_SERVER | ADMINISTRATOR;

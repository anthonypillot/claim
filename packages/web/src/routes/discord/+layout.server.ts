import { getDiscordPublicInformation } from "$lib/server/discord";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = () => getDiscordPublicInformation();

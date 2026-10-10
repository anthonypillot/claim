import { getDiscordConfiguration } from "../src/config.ts";
import { closeDb } from "../src/db/client.ts";
import { createDiscordClient } from "../src/modules/discord/client.ts";
import { claimCommand } from "../src/modules/discord/registration.ts";
import { createLogger } from "../src/utils/logger.ts";

const log = createLogger("discord registration");
const configuration = getDiscordConfiguration();
if (!configuration)
  throw new Error(
    "Set DISCORD_ENABLED=true and the Discord configuration for the intended application",
  );
const args = process.argv.slice(2);
let path: string;
if (args.length === 2 && args[0] === "--guild" && args[1] && /^\d{1,20}$/.test(args[1])) {
  path = `/applications/${configuration.applicationId}/guilds/${args[1]}/commands`;
} else if (args.length === 1 && args[0] === "--global") {
  path = `/applications/${configuration.applicationId}/commands`;
} else
  throw new Error(
    "Choose exactly --guild <development-server-id> or --global for the intended application",
  );
// POST upserts this command by name; never bulk-overwrite another application's commands.
try {
  const response = await createDiscordClient(
    configuration.token,
    configuration.applicationId,
  ).request(path, "POST", claimCommand);
  if (!response.ok)
    throw new Error(
      `Discord command registration failed (HTTP ${response.status}); check the application and rate limits`,
    );
  log.info({ applicationId: configuration.applicationId }, "Claim command registered");
} finally {
  await closeDb();
}

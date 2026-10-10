export const claimCommand = {
  name: "claim",
  description: "Manage Claim giveaway alerts in this server",
  type: 1,
  default_member_permissions: MANAGE_SERVER.toString(),
  contexts: [0],
  integration_types: [0],
  options: [
    {
      name: "setup",
      description: "Set or repair this server’s giveaway channel",
      type: 1,
      options: [
        {
          name: "channel",
          description: "An ordinary text channel for announcements",
          type: 7,
          channel_types: [0],
          required: true,
        },
        {
          name: "market",
          description: "Announcement language and Store market (default English/US)",
          type: 3,
          choices: [
            { name: "English / United States", value: "en-US" },
            { name: "Français / France", value: "fr-FR" },
          ],
        },
        {
          name: "stores",
          description: "all, or comma-separated epic-games,prime-gaming,gog,steam",
          type: 3,
          min_length: 1,
          max_length: 200,
        },
      ],
    },
    {
      name: "status",
      description: "Privately inspect settings, readiness, and delivery diagnostics",
      type: 1,
    },
    { name: "stop", description: "Stop alerts and delete this server’s stored data", type: 1 },
  ],
};
import { MANAGE_SERVER } from "./permissions.ts";

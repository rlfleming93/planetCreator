/* Every hour, delete each Junction user that is 30 days old (an hour, when it never connected), so Junction keeps nobody's
 * Garmin data longer than the privacy page says, and abandoned consents don't fill the team. Pages Functions have no
 * schedule, so this small Worker does it.
 *   npx wrangler deploy --config workers/junction-sweep/wrangler.toml   (scripts/junction-secrets.sh runs it) */
import { sweep } from '../../functions/_shared/junction.js';

export default {
  async scheduled(event, env) {
    const result = await sweep(env);
    console.log(JSON.stringify({ junctionSweep: result, at: new Date(event.scheduledTime).toISOString() }));
  },
};

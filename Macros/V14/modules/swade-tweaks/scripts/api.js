import { API_VERSION } from "./constants.js";
import { getLeader, groupOf, syncGroup, syncAllGroups } from "./services/groups.js";
import { groupLabel, isAutoName, computeGroupUpdates } from "./rules/group-label.js";

/** API publique : game.modules.get("swade-tweaks").api (voir API.md) */
export function buildApi() {
  return Object.freeze({
    version: API_VERSION,
    getLeader,
    groupOf,
    syncGroup,
    syncAllGroups,
    rules: Object.freeze({ groupLabel, isAutoName, computeGroupUpdates })
  });
}

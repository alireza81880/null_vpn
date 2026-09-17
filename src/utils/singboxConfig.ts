/**
 * singboxConfig.ts: Bridge/wrapper for sing-box configuration and validation.
 *
 * Directs to the canonical modules:
 * - src/config/SingboxConfigBuilder.ts
 * - src/config/ConfigValidator.ts
 */
export { buildUniversalSingBoxConfig } from '../config/SingboxConfigBuilder';
export { validateSingBoxConfig } from '../config/ConfigValidator';

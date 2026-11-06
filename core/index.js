/**
 * Host half of the shared core. It has no routes of its own: the module exists so
 * the chat and access client bundles share one implementation of the transport,
 * the mapping and the role labels instead of keeping copies.
 * @module dsh-im-omni-core
 */
export function apply() {}

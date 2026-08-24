import { env } from '../config/env.js';
import { ROLES } from '../config/constants.js';

/**
 * Who may hold administrative authority.
 *
 * The answer comes from OWNER_PHONES in the deployment environment, never from
 * the database. That asymmetry is the whole point: an attacker who reaches
 * Mongo can flip a role field, but the flipped account still fails this check
 * on its very next request, because the list they would need to edit is not
 * stored anywhere they now control.
 *
 * It follows that there is no "grant admin" endpoint anywhere in this codebase.
 * Admin is not something an admin can hand out — it is a property of being on
 * the operator's list, and the only way onto that list is deploying with a new
 * value.
 */
export const isOwnerPhone = (phone) => env.ownerPhones.includes(String(phone));

export const hasOwners = () => env.ownerPhones.length > 0;

/**
 * The role this person is entitled to, given who they are.
 *
 * Called on every sign-in, which makes it self-healing in both directions: add
 * a number to OWNER_PHONES and their next sign-in is an admin one; remove it
 * and their next sign-in silently drops back to a customer account.
 */
export function entitledRole(user) {
  if (isOwnerPhone(user.phone)) return ROLES.ADMIN;
  return user.role === ROLES.ADMIN ? ROLES.CUSTOMER : user.role;
}

/**
 * Bring a stored role back in line with the allowlist, persisting only on an
 * actual change so the common path stays read-only.
 */
export async function reconcileRole(user) {
  const should = entitledRole(user);
  if (user.role !== should) {
    user.role = should;
    await user.save();
  }
  return user;
}

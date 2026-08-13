import { ForbiddenError, RbacConfigurationError } from '../errors.js';
import type { AccessSubject, Permission, Role, RoleDefinition } from './types.js';

/**
 * Walks the (already duplicate- and unknown-reference-checked)
 * `inherits` graph looking for cycles, using the classic
 * white/gray/black DFS coloring so it can report every role on the cycle
 * it finds rather than just "a cycle exists somewhere".
 *
 * This runs once, at {@link RbacPolicy} construction time, so that a
 * misconfigured role hierarchy fails loudly on boot instead of silently
 * infinite-looping (or subtly under-resolving permissions) the first time
 * someone calls `permissionsFor`.
 */
function assertNoInheritanceCycles(definitions: ReadonlyMap<Role, RoleDefinition>): void {
  const state = new Map<Role, 'visiting' | 'done'>();
  const path: Role[] = [];

  const visit = (name: Role): void => {
    const status = state.get(name);
    if (status === 'done') return;
    if (status === 'visiting') {
      const cycleStart = path.indexOf(name);
      const cycle = [...path.slice(cycleStart), name];
      throw new RbacConfigurationError(`Role inheritance cycle detected: ${cycle.join(' -> ')}.`);
    }

    state.set(name, 'visiting');
    path.push(name);
    for (const parent of definitions.get(name)?.inherits ?? []) {
      visit(parent);
    }
    path.pop();
    state.set(name, 'done');
  };

  for (const name of definitions.keys()) {
    visit(name);
  }
}

/**
 * Resolves and enforces role-based access control for a fixed set of role
 * definitions.
 *
 * `RbacPolicy` instances are immutable and cheap to reuse: build one from
 * your application's role catalog at startup (typically as a singleton)
 * and share it across every `requirePermission` middleware and any
 * business logic that needs a manual `.can()` / `.assert()` check.
 *
 * All validation of the role graph itself (duplicate names, dangling
 * `inherits` references, inheritance cycles) happens eagerly in the
 * constructor, so a broken configuration fails at boot rather than
 * surfacing as a confusing runtime authorization bug much later.
 */
export class RbacPolicy {
  private readonly definitions: ReadonlyMap<Role, RoleDefinition>;

  /**
   * Memoizes each role's fully-resolved (own + transitively inherited)
   * permission set. Safe to cache indefinitely because `RbacPolicy` is
   * immutable and the inheritance graph is guaranteed cycle-free by the
   * constructor.
   */
  private readonly resolvedPermissionsByRole = new Map<Role, ReadonlySet<Permission>>();

  /**
   * @throws {RbacConfigurationError} if two role definitions share a name,
   * if a role's `inherits` references a role name absent from
   * `roleDefinitions`, or if the inheritance graph contains a cycle.
   */
  constructor(roleDefinitions: RoleDefinition[]) {
    const definitions = new Map<Role, RoleDefinition>();
    for (const definition of roleDefinitions) {
      if (definitions.has(definition.name)) {
        throw new RbacConfigurationError(
          `Duplicate role definition: role "${definition.name}" is defined more than once.`,
        );
      }
      definitions.set(definition.name, definition);
    }

    for (const definition of definitions.values()) {
      for (const parent of definition.inherits ?? []) {
        if (!definitions.has(parent)) {
          throw new RbacConfigurationError(
            `Role "${definition.name}" inherits from unknown role "${parent}".`,
          );
        }
      }
    }

    assertNoInheritanceCycles(definitions);

    this.definitions = definitions;
  }

  /**
   * Resolves each role's own permission set, memoizing the result.
   * Roles not present in the definitions passed to the constructor
   * resolve to an empty set — `permissionsFor` (and therefore `can`) is
   * deliberately lenient about unknown role *names* at check time, since
   * a subject may legitimately carry a role that was retired from the
   * catalog without every call site being updated in lockstep.
   */
  private resolveRole(role: Role): ReadonlySet<Permission> {
    const cached = this.resolvedPermissionsByRole.get(role);
    if (cached) return cached;

    const definition = this.definitions.get(role);
    if (!definition) {
      const empty = new Set<Permission>();
      this.resolvedPermissionsByRole.set(role, empty);
      return empty;
    }

    const resolved = new Set<Permission>(definition.permissions);
    for (const parent of definition.inherits ?? []) {
      for (const permission of this.resolveRole(parent)) {
        resolved.add(permission);
      }
    }

    this.resolvedPermissionsByRole.set(role, resolved);
    return resolved;
  }

  /**
   * Returns the union of every permission granted to `roles`, own plus
   * transitively inherited. Role names that don't exist in this policy's
   * definitions contribute nothing (see {@link resolveRole}); this method
   * never throws on unknown roles, unlike the constructor's strict
   * validation of `inherits` references.
   */
  permissionsFor(roles: Role[]): Set<Permission> {
    const result = new Set<Permission>();
    for (const role of roles) {
      for (const permission of this.resolveRole(role)) {
        result.add(permission);
      }
    }
    return result;
  }

  /**
   * Checks whether `subject` holds `permission`, either exactly, via the
   * bare superuser wildcard `"*"`, or via a namespaced wildcard grant
   * (e.g. granted `"invoices:*"` matches requested `"invoices:read"`).
   *
   * This is a pure, side-effect-free query — prefer {@link assert} at
   * enforcement points so a denial fails loudly instead of needing every
   * call site to remember to check the boolean.
   */
  can(subject: AccessSubject, permission: Permission): boolean {
    const granted = this.permissionsFor(subject.roles);
    if (granted.has(permission)) return true;

    for (const grantedPermission of granted) {
      if (grantedPermission === '*') return true;
      if (
        grantedPermission.endsWith(':*') &&
        permission.startsWith(grantedPermission.slice(0, -1))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enforces `permission` for `subject`, throwing rather than returning a
   * boolean so authorization failures can't be accidentally ignored by a
   * caller that forgets to check a return value.
   *
   * @throws {ForbiddenError} naming the missing permission, if {@link can} is false.
   */
  assert(subject: AccessSubject, permission: Permission): void {
    if (!this.can(subject, permission)) {
      throw new ForbiddenError(
        `Subject with roles [${subject.roles.join(', ')}] lacks required permission "${permission}".`,
        permission,
      );
    }
  }
}

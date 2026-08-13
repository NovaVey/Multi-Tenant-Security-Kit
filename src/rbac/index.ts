/**
 * Role-based access control: define roles (with optional inheritance),
 * check/enforce permissions against a resolved subject, and wire that
 * enforcement into an HTTP middleware pipeline.
 */

export type { AccessSubject, Permission, Role, RoleDefinition } from './types.js';
export { RbacPolicy } from './policy.js';
export type { RequirePermissionOptions, SubjectResolver } from './middleware.js';
export { requirePermission, subjectFromRequestRoles } from './middleware.js';

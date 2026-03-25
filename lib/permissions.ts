import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  client: ["create", "read", "update", "delete"],
  job: ["create", "read"],
  invoice: ["read"],
  notification: ["read", "update"],
} as const;

const ac = createAccessControl(statement);

const owner = ac.newRole({
  client: ["create", "read", "update", "delete"],
  job: ["create", "read"],
  invoice: ["read"],
  notification: ["read", "update"],
  ...ownerAc.statements,
});

const member = ac.newRole({
  client: ["create", "read", "update", "delete"],
  job: ["create", "read"],
  invoice: ["read"],
  notification: ["read", "update"],
});

const viewer = ac.newRole({
  client: ["read"],
  job: ["read"],
  invoice: ["read"],
  notification: ["read"],
});

export { ac, owner, member, viewer };

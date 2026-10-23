import { randomInt, randomUUID } from 'node:crypto';
import type { Db } from './pg';
import type { World } from './world';

/**
 * How to insert one row of each tenant-scoped table for a given tenant.
 * The isolation test runs this as a user of tenant A targeting tenant B (must be refused).
 *
 * Every table with a tenant_id column MUST have an entry here: the catalog test fails otherwise,
 * so a new table cannot ship without its RLS isolation test (CLAUDE.md rule 1).
 */
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

const insertReturningId = async (db: Db, sql: string, params: unknown[]) =>
  (await db.query<{ id: string }>(sql, params)).rows[0]!.id;

const whatsappNumber = (db: Db, tenantId: string) =>
  insertReturningId(
    db,
    `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc)
     values ($1, $2, $3, '+55 11 99999-0000', 'v1.x') returning id`,
    [tenantId, digits(15), digits(15)],
  );

const contact = (db: Db, tenantId: string) =>
  insertReturningId(
    db,
    `insert into contacts (tenant_id, wa_id, name) values ($1, $2, 'Contato') returning id`,
    [tenantId, `55${digits(11)}`],
  );

const conversation = async (db: Db, tenantId: string) =>
  insertReturningId(
    db,
    `insert into conversations (tenant_id, contact_id, whatsapp_number_id) values ($1, $2, $3) returning id`,
    [tenantId, await contact(db, tenantId), await whatsappNumber(db, tenantId)],
  );

const message = async (db: Db, tenantId: string) =>
  insertReturningId(
    db,
    `insert into messages (tenant_id, conversation_id, wamid, direction, type, text)
     values ($1, $2, $3, 'in', 'text', 'oi') returning id`,
    [tenantId, await conversation(db, tenantId), `wamid.${randomUUID()}`],
  );

export const TABLE_FIXTURES: Record<
  string,
  (db: Db, world: World, tenantId: string) => Promise<unknown>
> = {
  tenant_members: async (db, world, tenantId) =>
    db.query(`insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'viewer')`, [
      tenantId,
      world.users.outsider,
    ]),
  tenant_modules: async (db, _world, tenantId) =>
    db.query(`insert into tenant_modules (tenant_id, module) values ($1, 'adm')`, [tenantId]),
  departments: async (db, _world, tenantId) =>
    db.query(`insert into departments (tenant_id, name) values ($1, $2)`, [
      tenantId,
      `Dept ${randomUUID().slice(0, 6)}`,
    ]),
  whatsapp_numbers: async (db, _world, tenantId) => whatsappNumber(db, tenantId),
  whatsapp_templates: async (db, _world, tenantId) =>
    db.query(
      `insert into whatsapp_templates (tenant_id, waba_id, name, category, body) values ($1, '123456', $2, 'utility', 'Olá')`,
      [tenantId, `tpl_${digits(6)}`],
    ),
  contacts: async (db, _world, tenantId) => contact(db, tenantId),
  conversations: async (db, _world, tenantId) => conversation(db, tenantId),
  messages: async (db, _world, tenantId) => message(db, tenantId),
  message_media: async (db, _world, tenantId) =>
    db.query(`insert into message_media (tenant_id, message_id, media_id) values ($1, $2, 'm1')`, [
      tenantId,
      await message(db, tenantId),
    ]),
  audit_log: async (db, _world, tenantId) =>
    db.query(
      `insert into audit_log (tenant_id, action, entity, entity_id) values ($1, 'insert', 'test', $2)`,
      [tenantId, randomUUID()],
    ),
};

import { pingSchema, type Ping } from '@transcendence/shared';

it('charge le package shared', () => {
  const p: Ping = pingSchema.parse({ ok: true });
  expect(p).toEqual({ ok: true });
});
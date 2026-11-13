import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import type { ConfigType } from '@nestjs/config';
import { FortyTwoClientService } from '../forty-two.service';
import { fortyTwoConfig } from '../forty-two.config';
import { FortyTwoAuthException } from '../utils/forty-two-auth.exception';

/*
 * The network is never reached: global fetch is replaced by a mock for every test.
 */

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  callbackUrl: 'http://localhost/api/auth/42/callback',
  baseUrl: 'https://api.intra.test',
  authUrl: 'https://api.intra.test/oauth/authorize',
  tokenUrl: 'https://api.intra.test/oauth/token',
  profileUrl: 'https://api.intra.test/v2/me',
  timeout: 5000,
  pendingSecret: 'unused-here',
} as ConfigType<typeof fortyTwoConfig>;

const PROFILE = {
  id: 123456,
  login: 'jdoe',
  email: 'jdoe@student.42.fr',
  first_name: 'John',
  last_name: 'Doe',
};

// a minimal Response: only what the service reads
const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

describe('FortyTwoClientService', () => {
  let service: FortyTwoClientService;
  let fetchMock: jest.Mock<typeof fetch>;
  const realFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
    service = new FortyTwoClientService(config);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  describe('buildAuthUrl', () => {
    const url = () => new URL(service.buildAuthUrl('the-state'));

    it('points to the configured authorize URL', () => {
      expect(`${url().origin}${url().pathname}`).toBe(config.authUrl);
    });

    it('sends exactly the expected parameters', () => {
      expect(Object.fromEntries(url().searchParams)).toEqual({
        client_id: config.clientId,
        redirect_uri: config.callbackUrl,
        response_type: 'code',
        scope: 'public',
        state: 'the-state',
      });
    });

    it('never leaks the client secret in the URL', () => {
      expect(service.buildAuthUrl('s')).not.toContain(config.clientSecret);
    });

    it('URL-encodes the state', () => {
      expect(url().searchParams.get('state')).toBe('the-state');
      expect(new URL(service.buildAuthUrl('a&b=c')).searchParams.get('state'))
        .toBe('a&b=c');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('returns the access token', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: 'tok' }));
      await expect(service.exchangeCodeForToken('code')).resolves.toBe('tok');
    });

    it('POSTs a form-encoded body to the token URL with every required field', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: 'tok' }));
      await service.exchangeCodeForToken('the-code');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(config.tokenUrl);
      expect(init?.method).toBe('POST');
      expect(
        (init!.headers as Record<string, string>)['Content-Type'],
      ).toBe('application/x-www-form-urlencoded');

      const body = Object.fromEntries(init?.body as URLSearchParams);
      expect(body).toEqual({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: 'the-code',
        redirect_uri: config.callbackUrl,
      });
    });

    it('passes an abort signal (the call cannot hang forever)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: 'tok' }));
      await service.exchangeCodeForToken('code');
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    });

    describe('every failure becomes the same FortyTwoAuthException', () => {
      it.each([
        ['42 answers 401', () => jsonResponse({ error: 'invalid_grant' }, 401)],
        ['42 answers 500', () => jsonResponse({}, 500)],
        ['the body has no access_token', () => jsonResponse({ foo: 'bar' })],
      ])('%s', async (_name, response) => {
        fetchMock.mockResolvedValue(response());
        await expect(service.exchangeCodeForToken('code')).rejects.toThrow(
          FortyTwoAuthException,
        );
      });

      it('the body is not JSON', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Unexpected token <')),
        } as Response);
        await expect(service.exchangeCodeForToken('code')).rejects.toThrow(
          FortyTwoAuthException,
        );
      });

      it('the network fails or times out', async () => {
        fetchMock.mockRejectedValue(
          new DOMException('The operation timed out.', 'TimeoutError'),
        );
        await expect(service.exchangeCodeForToken('code')).rejects.toThrow(
          FortyTwoAuthException,
        );
      });
    });
  });

  describe('readProfile', () => {
    it('returns the parsed profile', async () => {
      fetchMock.mockResolvedValue(jsonResponse(PROFILE));
      await expect(service.readProfile('tok')).resolves.toEqual({
        providerAccountId: '123456',
        email: 'jdoe@student.42.fr',
        login: '42jdoe',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('GETs the profile URL with the token as a Bearer header', async () => {
      fetchMock.mockResolvedValue(jsonResponse(PROFILE));
      await service.readProfile('the-token');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(config.profileUrl);
      expect(init?.method).toBe('GET');
      expect((init!.headers as Record<string, string>).Authorization).toBe(
        'Bearer the-token',
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    describe('every failure becomes the same FortyTwoAuthException', () => {
      it.each([
        ['42 answers 401 (expired token)', () => jsonResponse({}, 401)],
        ['42 answers 429 (rate limited)', () => jsonResponse({}, 429)],
        ['the profile is malformed', () => jsonResponse({ id: 'x' })],
        [
          'the login breaks our pseudo rules',
          () => jsonResponse({ ...PROFILE, login: 'j doe' }),
        ],
      ])('%s', async (_name, response) => {
        fetchMock.mockResolvedValue(response());
        await expect(service.readProfile('tok')).rejects.toThrow(
          FortyTwoAuthException,
        );
      });

      it('the network fails', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'));
        await expect(service.readProfile('tok')).rejects.toThrow(
          FortyTwoAuthException,
        );
      });
    });
  });
});

import { formatMMSS, TimerServer } from './timerServer';

describe('formatMMSS', () => {
  it('formats zero as 00:00', () => {
    expect(formatMMSS(0)).toBe('00:00');
  });

  it('clamps negative values to 00:00', () => {
    expect(formatMMSS(-5)).toBe('00:00');
  });

  it('pads single-digit minutes and seconds', () => {
    expect(formatMMSS(65)).toBe('01:05');
  });

  it('formats values over 59 minutes without wrapping', () => {
    expect(formatMMSS(3661)).toBe('61:01');
  });

  it('floors fractional seconds', () => {
    expect(formatMMSS(59.9)).toBe('00:59');
  });
});

describe('TimerServer', () => {
  it('starts with the idle default state', () => {
    const server = new TimerServer();
    expect(server.getState()).toMatchObject({
      seconds: 0,
      phase: 'idle',
      currentRound: 1,
      totalRounds: 10,
      formatted: '00:00',
    });
  });

  it('merges partial updates into the existing state', () => {
    const server = new TimerServer();
    server.update({ seconds: 90, phase: 'round', currentRound: 2 });
    const state = server.getState();
    expect(state.seconds).toBe(90);
    expect(state.phase).toBe('round');
    expect(state.currentRound).toBe(2);
    // campos não tocados continuam com o valor anterior
    expect(state.totalRounds).toBe(10);
  });

  it('always recomputes formatted from seconds', () => {
    const server = new TimerServer();
    server.update({ seconds: 125 });
    expect(server.getState().formatted).toBe('02:05');
    server.update({ seconds: 3 });
    expect(server.getState().formatted).toBe('00:03');
  });

  it('start() returns null on success and is idempotent', () => {
    const server = new TimerServer();
    expect(server.start(9090)).toBeNull();
    expect(server.start(9090)).toBeNull();
    server.stop();
  });

  it('start() returns an error message for an invalid port', () => {
    const server = new TimerServer();
    const error = server.start(-1);
    expect(error).not.toBeNull();
    expect(error).toContain('-1');
  });
});

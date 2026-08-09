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
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advance = (ms: number) => jest.advanceTimersByTime(ms);

  it('starts with the idle default state', () => {
    const server = new TimerServer();
    expect(server.getState()).toMatchObject({
      seconds: 0,
      phase: 'idle',
      currentRound: 1,
      totalRounds: 10,
      formatted: '00:00',
      running: false,
      paused: false,
    });
  });

  it('counts down from wall clock while running', () => {
    const server = new TimerServer();
    server.setConfig({ totalRounds: 3, roundTimeSec: 60, breakTimeSec: 10 });
    server.startFight();
    advance(10_000); // 10s dentro do round 1
    const state = server.getState();
    expect(state.phase).toBe('round');
    expect(state.currentRound).toBe(1);
    expect(state.seconds).toBe(50);
    expect(state.elapsedMs).toBe(10_000);
  });

  it('keeps counting correctly even if no tick ran (wall-clock derived)', () => {
    const server = new TimerServer();
    server.setConfig({ totalRounds: 3, roundTimeSec: 60, breakTimeSec: 10 });
    server.startFight();
    // Nenhum tick "rodou": o tempo é óbvio só pelo relógio do servidor.
    advance(95_000); // 60s round + 10s rest + 25s do round 2
    const state = server.getState();
    expect(state.phase).toBe('round');
    expect(state.currentRound).toBe(2);
    expect(state.seconds).toBe(35);
    expect(state.elapsedMs).toBe(95_000);
  });

  it('reaches done after the last round', () => {
    const server = new TimerServer();
    server.setConfig({ totalRounds: 1, roundTimeSec: 60, breakTimeSec: 10 });
    server.startFight();
    advance(61_000);
    const state = server.getState();
    expect(state.phase).toBe('done');
    expect(state.running).toBe(false);
    expect(state.seconds).toBe(0);
  });

  it('pause() freezes time and resume() continues from where it stopped', () => {
    const server = new TimerServer();
    server.setConfig({ totalRounds: 3, roundTimeSec: 60, breakTimeSec: 10 });
    server.startFight();
    advance(20_000);
    server.pause();
    const pausedState = server.getState();
    expect(pausedState.paused).toBe(true);
    expect(pausedState.seconds).toBe(40);
    // Durante a pausa o relógio não anda.
    advance(30_000);
    expect(server.getState().seconds).toBe(40);
    // Resume continua de onde parou.
    server.resume();
    advance(10_000);
    expect(server.getState().seconds).toBe(30);
  });

  it('reset() returns to idle', () => {
    const server = new TimerServer();
    server.setConfig({ totalRounds: 3, roundTimeSec: 60, breakTimeSec: 10 });
    server.startFight();
    advance(10_000);
    server.reset();
    expect(server.getState()).toMatchObject({
      seconds: 0,
      phase: 'idle',
      running: false,
      paused: false,
    });
  });

  it('exposes the schedule and config for the receiver cache', () => {
    const server = new TimerServer();
    server.setConfig({ totalRounds: 2, roundTimeSec: 180, breakTimeSec: 30 });
    server.startFight();
    const state = server.getState();
    expect(state.schedule.length).toBe(3); // round, rest, round
    expect(state.roundTimeSec).toBe(180);
    expect(state.breakTimeSec).toBe(30);
    expect(typeof state.serverNowMs).toBe('number');
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
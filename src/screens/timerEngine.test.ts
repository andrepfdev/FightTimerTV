import {
  advancePhase,
  buildSchedulePhases,
  phaseAtElapsedMs,
} from './timerEngine';

describe('advancePhase', () => {
  it('moves from a round into the break interval when one is configured', () => {
    const result = advancePhase({
      currentRound: 1,
      totalRounds: 3,
      isRest: false,
      roundTimeSec: 180,
      breakTimeSec: 30,
    });
    expect(result).toEqual({
      done: false,
      currentRound: 1,
      isRest: true,
      timeLeft: 30,
      totalTime: 30,
    });
  });

  it('skips straight to the next round when breakTimeSec is 0', () => {
    const result = advancePhase({
      currentRound: 1,
      totalRounds: 3,
      isRest: false,
      roundTimeSec: 180,
      breakTimeSec: 0,
    });
    expect(result).toEqual({
      done: false,
      currentRound: 2,
      isRest: false,
      timeLeft: 180,
      totalTime: 180,
    });
  });

  it('moves from the break interval into the next round', () => {
    const result = advancePhase({
      currentRound: 1,
      totalRounds: 3,
      isRest: true,
      roundTimeSec: 180,
      breakTimeSec: 30,
    });
    expect(result).toEqual({
      done: false,
      currentRound: 2,
      isRest: false,
      timeLeft: 180,
      totalTime: 180,
    });
  });

  it('finishes when the last round ends', () => {
    const result = advancePhase({
      currentRound: 3,
      totalRounds: 3,
      isRest: false,
      roundTimeSec: 180,
      breakTimeSec: 30,
    });
    expect(result).toEqual({ done: true });
  });

  it('does not finish early from the break before the last round', () => {
    const result = advancePhase({
      currentRound: 3,
      totalRounds: 3,
      isRest: true,
      roundTimeSec: 180,
      breakTimeSec: 30,
    });
    expect(result.done).toBe(false);
  });
});

describe('buildSchedulePhases', () => {
  it('builds round/rest/round sequence with a break configured', () => {
    const phases = buildSchedulePhases(3, 180, 30);
    expect(phases).toEqual([
      { kind: 'round', round: 1, startMs: 0, durMs: 180000 },
      { kind: 'rest', round: 1, startMs: 180000, durMs: 30000 },
      { kind: 'round', round: 2, startMs: 210000, durMs: 180000 },
      { kind: 'rest', round: 2, startMs: 390000, durMs: 30000 },
      { kind: 'round', round: 3, startMs: 420000, durMs: 180000 },
    ]);
  });

  it('drops breaks entirely when breakTimeSec is 0', () => {
    const phases = buildSchedulePhases(3, 180, 0);
    expect(phases.map(p => p.kind)).toEqual(['round', 'round', 'round']);
  });

  it('single round has no break after it', () => {
    const phases = buildSchedulePhases(1, 180, 30);
    expect(phases).toEqual([{ kind: 'round', round: 1, startMs: 0, durMs: 180000 }]);
  });
});

describe('phaseAtElapsedMs', () => {
  const schedule = buildSchedulePhases(3, 180, 30);

  it('reports the first round and remaining time at start', () => {
    const snap = phaseAtElapsedMs(schedule, 0);
    expect(snap.done).toBe(false);
    expect(snap.currentRound).toBe(1);
    expect(snap.isRest).toBe(false);
    expect(snap.secondsLeft).toBe(180);
  });

  it('accounts for elapsed time inside the current round', () => {
    const snap = phaseAtElapsedMs(schedule, 120000); // 2 min do round 1
    expect(snap.currentRound).toBe(1);
    expect(snap.secondsLeft).toBe(60);
    expect(snap.elapsedPhaseMs).toBe(120000);
  });

  it('reports rest phase with its own remaining time', () => {
    const snap = phaseAtElapsedMs(schedule, 185_000); // 5s dentro do intervalo
    expect(snap.currentRound).toBe(1);
    expect(snap.isRest).toBe(true);
    expect(snap.secondsLeft).toBe(25);
  });

  it('advances to the next round after round+break', () => {
    const snap = phaseAtElapsedMs(schedule, 211_000); // 1s do round 2
    expect(snap.currentRound).toBe(2);
    expect(snap.isRest).toBe(false);
    expect(snap.secondsLeft).toBe(179);
  });

  it('jumps straight to where the fight is after a longo background gap', () => {
    // 8 min de luta corrida: round3 começa aos 420s, então com 480s ele já
    // rodou 60s → restam 120s.
    const snap = phaseAtElapsedMs(schedule, 8 * 60_000);
    expect(snap.done).toBe(false);
    expect(snap.currentRound).toBe(3);
    expect(snap.isRest).toBe(false);
    expect(snap.secondsLeft).toBe(120);
  });

  it('marks done after the last round ends', () => {
    const total = schedule[schedule.length - 1].startMs + schedule[schedule.length - 1].durMs;
    const snap = phaseAtElapsedMs(schedule, total + 1);
    expect(snap.done).toBe(true);
    expect(snap.secondsLeft).toBe(0);
  });

  it('never goes below zero seconds', () => {
    const snap = phaseAtElapsedMs(schedule, -50);
    expect(snap.secondsLeft).toBe(180);
  });
});

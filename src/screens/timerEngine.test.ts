import { advancePhase } from './timerEngine';

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

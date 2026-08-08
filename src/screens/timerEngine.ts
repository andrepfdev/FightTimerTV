/**
 * Lógica pura de transição de fase do cronômetro (round → intervalo →
 * próximo round → fim), extraída de TimerScreen.tsx para poder ser
 * testada sem montar componentes React Native. Espelha o comportamento
 * original de `advancePhase` (index.html do ct-timer).
 */

export type RoundEngineState = {
  currentRound: number;
  totalRounds: number;
  isRest: boolean;
  roundTimeSec: number;
  breakTimeSec: number;
};

export type RoundEngineResult =
  | { done: true }
  | {
      done: false;
      currentRound: number;
      isRest: boolean;
      timeLeft: number;
      totalTime: number;
    };

/**
 * Calcula a próxima fase quando o tempo da fase atual chega a zero.
 * Não muta o estado recebido — retorna o próximo estado (ou `{done: true}`
 * quando o último round termina).
 */
export function advancePhase(state: RoundEngineState): RoundEngineResult {
  const { currentRound, totalRounds, isRest, roundTimeSec, breakTimeSec } = state;

  if (!isRest) {
    if (currentRound >= totalRounds) {
      return { done: true };
    }
    if (breakTimeSec > 0) {
      return {
        done: false,
        currentRound,
        isRest: true,
        timeLeft: breakTimeSec,
        totalTime: breakTimeSec,
      };
    }
    return {
      done: false,
      currentRound: currentRound + 1,
      isRest: false,
      timeLeft: roundTimeSec,
      totalTime: roundTimeSec,
    };
  }

  return {
    done: false,
    currentRound: currentRound + 1,
    isRest: false,
    timeLeft: roundTimeSec,
    totalTime: roundTimeSec,
  };
}

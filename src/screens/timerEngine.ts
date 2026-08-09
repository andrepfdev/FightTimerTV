/**
 * Lógica pura de transição de fase do cronômetro (round → intervalo →
 * próximo round → fim), extraída de TimerScreen.tsx para poder ser
 * testada sem montar componentes React Native.
 *
 * Duas vertentes aqui:
 * 1. `advancePhase` — espelha o comportamento original do index.html do
 *    ct-timer (contagem regressiva com setInterval, um passo por vez).
 *    Mantido para compatibilidade/matriz de testes do comportamento
 *    clássico.
 * 2. `buildSchedulePhases`/`phaseAtElapsedMs` — visão por *cronograma
 *    absoluto*: a partir da configuração inteira (totalRounds +
 *    durações) monta a lista completa de fases e, dado quanto tempo de
 *    luta já se passou (relógio de parede), devolve em que fase estamos
 *    e quanto falta nela. É isso que permite que o timer "continue"
 *    mesmo com o JS do celular congelado em background — o tempo
 *    restante é uma derivada de `Date.now()`, não uma variável que só
 *    andava quando o setInterval rodava.
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

export type PhaseKind = 'round' | 'rest';

export type SchedulePhase = {
  kind: PhaseKind;
  round: number;
  startMs: number; // deslocamento do relógio de parede (em ms) desde o início da luta
  durMs: number;
};

/**
 * Monta o cronograma completo de fases de uma luta a partir da
 * configuração. Ordem: round 1 → intervalo → round 2 → ... → último
 * round (sem intervalo depois). Intervalo de 0 segue sem fase de descanso.
 */
export function buildSchedulePhases(
  totalRounds: number,
  roundTimeSec: number,
  breakTimeSec: number,
): SchedulePhase[] {
  const phases: SchedulePhase[] = [];
  let cursor = 0;
  for (let round = 1; round <= totalRounds; round++) {
    phases.push({ kind: 'round', round, startMs: cursor, durMs: roundTimeSec * 1000 });
    cursor += roundTimeSec * 1000;
    if (round < totalRounds && breakTimeSec > 0) {
      phases.push({ kind: 'rest', round, startMs: cursor, durMs: breakTimeSec * 1000 });
      cursor += breakTimeSec * 1000;
    }
  }
  return phases;
}

export type ScheduleSnapshot = {
  done: boolean;
  totalMs: number; // duração total da luta (soma das fases), p/ normalização
  currentRound: number;
  isRest: boolean;
  phaseKind: PhaseKind;
  secondsLeft: number; // segundos restantes nesta fase (arredonda prá cima)
  totalPhaseMs: number; // duração da fase atual (p/ barra de progresso)
  elapsedPhaseMs: number; // quanto já rodou dentro da fase atual
};

/**
 * Dado quanto tempo de luta já se passou (`elapsedMs`, relógio de parede),
 * devolve em que fase do cronograma estamos e quanto falta nela. É a função
 * que torna o timer "à prova" de JS congelado: `elapsedMs` = Date.now() -
 * início, então mesmo que o setInterval não rode por 2 minutos, a resposta
 * desse cálculo continua correta.
 */
export function phaseAtElapsedMs(
  schedule: SchedulePhase[],
  elapsedMs: number,
): ScheduleSnapshot {
  const clamped = Math.max(0, elapsedMs);

  for (const ph of schedule) {
    const endMs = ph.startMs + ph.durMs;
    if (clamped < endMs) {
      const elapsedPhase = clamped - ph.startMs;
      return {
        done: false,
        totalMs: endMs,
        currentRound: ph.round,
        isRest: ph.kind === 'rest',
        phaseKind: ph.kind,
        secondsLeft: Math.max(0, Math.ceil((endMs - clamped) / 1000)),
        totalPhaseMs: ph.durMs,
        elapsedPhaseMs: elapsedPhase,
      };
    }
  }

  const last = schedule[schedule.length - 1];
  const totalMs = last ? last.startMs + last.durMs : 0;
  return {
    done: true,
    totalMs,
    currentRound: 0,
    isRest: false,
    phaseKind: 'round',
    secondsLeft: 0,
    totalPhaseMs: 0,
    elapsedPhaseMs: 0,
  };
}

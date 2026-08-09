import { BridgeServer } from 'react-native-http-bridge-refurbished';
import { RECEIVER_HTML } from '../receiver/receiverHtml';
import { buildSchedulePhases, phaseAtElapsedMs, SchedulePhase } from '../screens/timerEngine';

export const SERVER_PORT = 8080;

export type Phase = 'round' | 'rest' | 'idle' | 'done';

export type FightConfig = {
  totalRounds: number;
  roundTimeSec: number;
  breakTimeSec: number;
};

export type TimerState = {
  seconds: number; // segundos restantes na fase atual
  totalTime: number; // duração total da fase atual (p/ barra de progresso)
  running: boolean;
  paused: boolean;
  phase: Phase;
  currentRound: number;
  totalRounds: number;
  soundOn: boolean;
  formatted: string; // MM:SS
  // 🔑 Fonte de verdade por relógio de parede: `elapsedMs` é quanto tempo
  // de luta já se passou (fase atual + todas as anteriores) no instante
  // `serverNowMs` (relógio do celular naquele instante). O receiver salva
  // os dois como "cache": se o celular congelar em background, a TV/Roku
  // continuam derivando `elapsedMs = cachedElapsedMs + (seuRelogio +
  // offset - cachedServerNow)` com o próprio relógio — sem depender de o
  // polling continuar chegando.
  elapsedMs: number;
  serverNowMs: number;
  // Cronograma completo de fases, pra o receiver recomputar em que fase
  // estamos localmente (e tocar os sinos) quando o celular não responde.
  schedule: SchedulePhase[];
  roundTimeSec: number;
  breakTimeSec: number;
};

export function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const ss = (clamped % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Servidor HTTP embutido no app. Não guarda nada em disco e não exige login.
 *
 * ⚠️ Modelo de tempo: o servidor NÃO decrementa uma variável a cada
 * segundo — ele guarda *âncoras de relógio de parede* (`startedAtMs` +
 * `elapsedBeforeSegmentMs`) e deriva `elapsedMs`/`seconds`/`phase` na hora
 * em que GET /state é respondido, usando `Date.now()`. Isso significa que
 * mesmo que o JS do app congele por minutos em background, um /state que
 * consiga ser servido já volta com o valor correto — e a TV/Roku, que
 * guardaram o cache, seguem contando por conta própria.
 */
export class TimerServer {
  private server: BridgeServer | null = null;
  private config: FightConfig = { totalRounds: 10, roundTimeSec: 300, breakTimeSec: 30 };
  private running = false;
  private paused = false;
  private startedAtMs = 0; // Date.now() quando a luta começou (ou foi retomada)
  private elapsedBeforeSegmentMs = 0; // tempo de luta já acumulado antes do segmento atual

  private nowElapsedMs(): number {
    if (!this.running) return this.elapsedBeforeSegmentMs;
    if (this.paused) return this.elapsedBeforeSegmentMs;
    return this.elapsedBeforeSegmentMs + (Date.now() - this.startedAtMs);
  }

  private snapshot(): TimerState {
    const schedule = buildSchedulePhases(
      this.config.totalRounds,
      this.config.roundTimeSec,
      this.config.breakTimeSec,
    );
    const elapsedMs = this.nowElapsedMs();
    const snap = phaseAtElapsedMs(schedule, elapsedMs);

    // Sem luta ativa, o receiver não deve ver tempo nenhum correndo — só
    // o estado "idle" com cronômetro zerado.
    if (!this.running) {
      return {
        seconds: 0,
        totalTime: 0,
        running: false,
        paused: false,
        phase: 'idle',
        currentRound: 1,
        totalRounds: this.config.totalRounds,
        soundOn: true,
        formatted: '00:00',
        elapsedMs: 0,
        serverNowMs: Date.now(),
        schedule,
        roundTimeSec: this.config.roundTimeSec,
        breakTimeSec: this.config.breakTimeSec,
      } as TimerState;
    }

    let phase: Phase = 'idle';
    if (this.running) {
      phase = snap.done ? 'done' : snap.isRest ? 'rest' : 'round';
    }

    const currentRound = snap.done ? this.config.totalRounds : snap.currentRound;
    const seconds = snap.done ? 0 : snap.secondsLeft;
    const totalTime = snap.done ? 0 : Math.round(snap.totalPhaseMs / 1000);
    const serverNowMs = Date.now();

    return {
      seconds,
      totalTime,
      running: this.running && !this.paused && !snap.done,
      paused: this.paused,
      phase,
      currentRound,
      totalRounds: this.config.totalRounds,
      soundOn: true,
      formatted: formatMMSS(seconds),
      elapsedMs,
      serverNowMs,
      schedule,
      roundTimeSec: this.config.roundTimeSec,
      breakTimeSec: this.config.breakTimeSec,
    };
  }

  /**
   * @returns `null` se subiu com sucesso, ou uma mensagem de erro para
   * exibir ao usuário (ex.: porta já em uso).
   */
  start(port: number = SERVER_PORT): string | null {
    if (this.server) return null;

    const server = new BridgeServer('fight_timer_tv', false);

    server.get('/', async (_req, res) => {
      res.html(RECEIVER_HTML);
    });

    server.get('/state', async (_req, res) => {
      res.json(this.snapshot());
    });

    try {
      server.listen(port);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Não foi possível iniciar o servidor na porta ${port}: ${message}`;
    }

    this.server = server;
    return null;
  }

  stop() {
    this.server?.stop();
    this.server = null;
  }

  setConfig(config: FightConfig) {
    this.config = { ...this.config, ...config };
  }

  startFight() {
    this.running = true;
    this.paused = false;
    this.startedAtMs = Date.now();
    this.elapsedBeforeSegmentMs = 0;
  }

  pause() {
    if (!this.running || this.paused) return;
    this.elapsedBeforeSegmentMs = this.nowElapsedMs();
    this.paused = true;
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.elapsedBeforeSegmentMs = this.nowElapsedMs();
    this.paused = false;
    this.startedAtMs = Date.now();
  }

  reset() {
    this.running = false;
    this.paused = false;
    this.startedAtMs = 0;
    this.elapsedBeforeSegmentMs = 0;
  }

  getState(): TimerState {
    return this.snapshot();
  }
}
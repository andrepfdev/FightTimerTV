import { BridgeServer } from 'react-native-http-bridge-refurbished';
import { RECEIVER_HTML } from '../receiver/receiverHtml';

export const SERVER_PORT = 8080;

export type Phase = 'round' | 'rest' | 'idle' | 'done';

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
 * Servidor HTTP embutido no app. Não guarda nada em disco e não exige login:
 * `state` vive só em memória do processo e é sobrescrito a cada mudança do
 * timer. A TV faz polling em GET /state; GET / serve a página estática
 * (layout copiado quase 1:1 da tela "run" do index.html original).
 */
export class TimerServer {
  private server: BridgeServer | null = null;
  private state: TimerState = {
    seconds: 0,
    totalTime: 0,
    running: false,
    paused: false,
    phase: 'idle',
    currentRound: 1,
    totalRounds: 10,
    soundOn: true,
    formatted: '00:00',
  };

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
      res.json(this.state);
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

  update(partial: Partial<Omit<TimerState, 'formatted'>>) {
    const next = { ...this.state, ...partial };
    this.state = { ...next, formatted: formatMMSS(next.seconds) };
  }

  getState(): TimerState {
    return this.state;
  }
}

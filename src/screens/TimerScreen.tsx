import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// SafeAreaView do react-native "puro" não recalcula direito ao girar a
// tela no Android (ficava sem respiro no topo em paisagem) — a versão de
// react-native-safe-area-context escuta os insets corretos em cada rotação.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from '@sayem314/react-native-keep-awake';
import { NetworkInfo } from 'react-native-network-info';
import QRCode from 'react-native-qrcode-svg';
import { TimerServer, SERVER_PORT, Phase } from '../server/timerServer';
import { advancePhase as computeAdvancePhase } from './timerEngine';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * Motor de rounds/intervalo espelhando o comportamento do index.html
 * original (ct-timer): N rounds, cada um com duração `roundTimeSec`,
 * separados por um intervalo `breakTimeSec`. Nada é salvo em disco — tudo
 * em memória do componente, e refletido no servidor HTTP a cada mudança
 * para a TV puxar via polling.
 */
export default function TimerScreen() {
  const server = useMemo(() => new TimerServer(), []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ip, setIp] = useState<string | null>(null);

  // Configuração (tela de setup)
  const [totalRounds, setTotalRounds] = useState(10);
  const [roundTimeSec, setRoundTimeSec] = useState(5 * 60);
  const [breakTimeSec, setBreakTimeSec] = useState(30);

  // Estado da corrida (tela run)
  const [screen, setScreen] = useState<'setup' | 'run'>('setup');
  const [currentRound, setCurrentRound] = useState(1);
  const [isRest, setIsRest] = useState(false);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);

  const [serverError, setServerError] = useState<string | null>(null);
  const [backgroundWarning, setBackgroundWarning] = useState(false);
  const [foregroundServiceError, setForegroundServiceError] = useState<string | null>(null);

  // Impede a tela de apagar sozinha durante o uso — o timer só avança de
  // fato enquanto o app está em foreground, então apagar a tela derrubaria
  // o tick e a TV perderia a conexão (ver CLAUDE.md).
  useKeepAwake();

  useEffect(() => {
    setServerError(server.start(SERVER_PORT));
    NetworkInfo.getIPV4Address().then(setIp).catch(() => setIp(null));
    return () => server.stop();
  }, [server]);

  // Foreground service nativo (Android only, ver TimerForegroundService.kt):
  // mantém o processo com prioridade alta enquanto uma luta está rodando,
  // pra o Android não suspender o tick/servidor HTTP quando o usuário
  // minimiza o app de propósito. Ligado à tela 'run' inteira (rodando ou
  // pausado), não só a rodadas ativas, pra não ter brecha entre pausar e
  // minimizar. Sem equivalente no iOS ainda — lá o aviso abaixo continua
  // sendo a única rede de segurança.
  useEffect(() => {
    if (Platform.OS !== 'android' || screen !== 'run') return;
    NativeModules.TimerForeground?.start()
      .then(() => setForegroundServiceError(null))
      .catch((err: Error) => setForegroundServiceError(err.message));
    return () => {
      NativeModules.TimerForeground?.stop().catch(() => {});
    };
  }, [screen]);

  // Rede de segurança: mesmo com o foreground service, o Android pode
  // matar o processo em aparelhos muito agressivos com bateria (e no iOS
  // não há foreground service nenhum ainda). Se o tick parar mesmo assim,
  // avisamos que o tempo pode ter ficado impreciso em vez de fingir que
  // nada aconteceu.
  useEffect(() => {
    let wasBackground = false;
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        wasBackground = true;
      } else if (nextState === 'active' && wasBackground) {
        wasBackground = false;
        setBackgroundWarning(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Espelha o estado local no servidor a cada mudança relevante.
  useEffect(() => {
    const phase: Phase = done ? 'done' : screen === 'setup' ? 'idle' : isRest ? 'rest' : 'round';
    server.update({
      seconds: screen === 'setup' ? 0 : timeLeft,
      totalTime: screen === 'setup' ? 0 : totalTime,
      running: screen === 'run' && !paused && !done,
      paused,
      phase,
      currentRound,
      totalRounds,
      soundOn: true,
    });
  }, [server, screen, timeLeft, totalTime, paused, done, isRest, currentRound, totalRounds]);

  // Tick de 1s (só quando rodando e não pausado)
  useEffect(() => {
    if (screen !== 'run' || paused || done) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          advancePhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, paused, done, isRest, currentRound]);

  function advancePhase() {
    const result = computeAdvancePhase({
      currentRound,
      totalRounds,
      isRest,
      roundTimeSec,
      breakTimeSec,
    });
    if (result.done) {
      setDone(true);
      return;
    }
    setCurrentRound(result.currentRound);
    setIsRest(result.isRest);
    setTimeLeft(result.timeLeft);
    setTotalTime(result.totalTime);
  }

  const startTimer = () => {
    setCurrentRound(1);
    setIsRest(false);
    setPaused(false);
    setDone(false);
    setTimeLeft(roundTimeSec);
    setTotalTime(roundTimeSec);
    setScreen('run');
  };
  const togglePause = () => setPaused(p => !p);
  const backToSetup = () => {
    setScreen('setup');
    setDone(false);
    setPaused(false);
  };

  const changeRounds = (d: number) => setTotalRounds(v => Math.max(1, Math.min(99, v + d)));
  const changeRoundTime = (d: number) => setRoundTimeSec(v => Math.max(30, Math.min(3600, v + d)));
  const changeBreak = (d: number) => setBreakTimeSec(v => Math.max(0, Math.min(3600, v + d)));

  const tvUrl = ip ? `http://${ip}:${SERVER_PORT}` : null;

  if (screen === 'run') {
    const pct = totalTime > 0 ? ((totalTime - timeLeft) / totalTime) * 100 : 0;
    const warning = !isRest && timeLeft <= 10;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.runBody}>
          <Text style={styles.roundIndicator}>
            {done
              ? 'FIM!'
              : isRest
              ? `INTERVALO — ROUND ${currentRound} / ${totalRounds}`
              : `ROUND ${currentRound} / ${totalRounds}`}
          </Text>
          <Text
            style={[
              styles.bigTimer,
              isRest && styles.bigTimerRest,
              warning && styles.bigTimerWarning,
            ]}
          >
            {mmss(timeLeft)}
          </Text>
          {!done && (
            <>
              <TouchableOpacity style={styles.pauseBtn} onPress={togglePause}>
                <Text style={styles.pauseBtnText}>{paused ? 'CONTINUAR' : 'PAUSAR'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetLink} onPress={backToSetup}>
                <Text style={styles.resetLinkText}>REINICIAR CONFIGURAÇÃO</Text>
              </TouchableOpacity>
            </>
          )}
          {foregroundServiceError && (
            <Text style={styles.errorText}>
              Proteção de segundo plano falhou: {foregroundServiceError}
            </Text>
          )}
          {done && (
            <TouchableOpacity style={styles.pauseBtn} onPress={backToSetup}>
              <Text style={styles.pauseBtnText}>REPETIR</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.progressWrap}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct}%` },
              isRest && styles.progressRest,
              warning && styles.progressWarning,
            ]}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.setupScroll}>
        <View style={styles.configRow}>
          <TouchableOpacity style={styles.circleBtn} onPress={() => changeRounds(-1)}>
            <Text style={styles.circleBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.configLabel}>ROUNDS</Text>
          <Text style={styles.configValue}>{totalRounds}</Text>
          <TouchableOpacity style={styles.circleBtn} onPress={() => changeRounds(1)}>
            <Text style={styles.circleBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timerSetupWrap}>
          <TouchableOpacity style={styles.circleBtn} onPress={() => changeRoundTime(-30)}>
            <Text style={styles.circleBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.bigTimerSetup}>{mmss(roundTimeSec)}</Text>
          <TouchableOpacity style={styles.circleBtn} onPress={() => changeRoundTime(30)}>
            <Text style={styles.circleBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.configRow}>
          <TouchableOpacity style={styles.circleBtn} onPress={() => changeBreak(-15)}>
            <Text style={styles.circleBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.configLabel}>INTERVALO</Text>
          <Text style={styles.configValue}>{mmss(breakTimeSec)}</Text>
          <TouchableOpacity style={styles.circleBtn} onPress={() => changeBreak(15)}>
            <Text style={styles.circleBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={startTimer}>
          <Text style={styles.startBtnText}>INICIAR</Text>
        </TouchableOpacity>

        <View style={styles.tvBox}>
          <Text style={styles.tvLabel}>Abra este endereço na TV:</Text>
          <Text style={styles.tvUrl}>{tvUrl ?? 'Procurando IP da rede Wi-Fi…'}</Text>
          {tvUrl && (
            <View style={styles.qrWrap}>
              <QRCode value={tvUrl} size={160} backgroundColor="#1a1a1a" color="#C8F400" />
            </View>
          )}
          <Text style={styles.tvHint}>Celular e TV precisam estar na mesma rede Wi-Fi.</Text>
          <Text style={styles.tvHint}>
            Não minimize o app nem deixe a tela apagar durante a luta — o
            cronômetro só avança enquanto o app está em primeiro plano.
          </Text>
          {serverError && (
            <Text style={styles.errorText}>{serverError}</Text>
          )}
          {backgroundWarning && (
            <TouchableOpacity onPress={() => setBackgroundWarning(false)}>
              <Text style={styles.warningText}>
                O app ficou em segundo plano — o tempo pode ter ficado
                impreciso. Toque para dispensar.
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const YELLOW = '#C8F400';
const DARK = '#1a1a1a';
const MUTED = '#666';
const WARNING = '#ff4444';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  setupScroll: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },

  configRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginVertical: 12 },
  circleBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnText: { color: '#fff', fontSize: 26, lineHeight: 26 },
  configLabel: {
    color: '#fff', fontSize: 22, letterSpacing: 3, minWidth: 110, textAlign: 'center',
    fontFamily: 'BebasNeue-Regular',
  },
  configValue: {
    color: '#fff', fontSize: 22, letterSpacing: 2, minWidth: 70, textAlign: 'center',
    fontFamily: 'BebasNeue-Regular',
  },

  timerSetupWrap: { flexDirection: 'row', alignItems: 'center', gap: 20, marginVertical: 20 },
  bigTimerSetup: {
    color: '#fff', fontSize: 72, fontVariant: ['tabular-nums'], letterSpacing: -1,
    fontFamily: 'BebasNeue-Regular',
  },

  startBtn: {
    backgroundColor: YELLOW,
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 72,
    marginTop: 24,
  },
  startBtnText: {
    color: '#111', fontSize: 22, letterSpacing: 6, fontFamily: 'BebasNeue-Regular',
  },

  runBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  roundIndicator: {
    color: '#fff', fontSize: 24, letterSpacing: 4, opacity: 0.88, marginBottom: 16,
    fontFamily: 'BebasNeue-Regular',
  },
  bigTimer: {
    color: YELLOW, fontSize: 110, fontVariant: ['tabular-nums'], letterSpacing: -2,
    fontFamily: 'BebasNeue-Regular',
  },
  bigTimerRest: { color: MUTED },
  bigTimerWarning: { color: WARNING },
  pauseBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 28,
  },
  pauseBtnText: { color: '#fff', fontSize: 18, letterSpacing: 5, fontFamily: 'BebasNeue-Regular' },
  resetLink: { marginTop: 20, padding: 8 },
  resetLinkText: { color: MUTED, fontSize: 13, letterSpacing: 3, fontFamily: 'BebasNeue-Regular' },

  progressWrap: { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  progressFill: { height: '100%', backgroundColor: YELLOW },
  progressRest: { backgroundColor: MUTED },
  progressWarning: { backgroundColor: WARNING },

  tvBox: {
    marginTop: 32,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 20,
    width: '100%',
  },
  tvLabel: { color: '#666', fontSize: 12 },
  tvUrl: { color: YELLOW, fontSize: 16, marginTop: 4 },
  qrWrap: { marginTop: 16, padding: 12, backgroundColor: DARK },
  tvHint: { color: '#555', fontSize: 11, marginTop: 12, textAlign: 'center' },
  errorText: { color: WARNING, fontSize: 12, marginTop: 12, textAlign: 'center' },
  warningText: { color: YELLOW, fontSize: 12, marginTop: 12, textAlign: 'center' },
});

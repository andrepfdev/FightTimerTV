import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  findNodeHandle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildSchedulePhases, phaseAtElapsedMs } from './timerEngine';

const TV_CONFIG_KEY = '@fighttimertv/tv_config';

type TVConfig = { totalRounds: number; roundTimeSec: number; breakTimeSec: number };
const DEFAULT_CONFIG: TVConfig = { totalRounds: 10, roundTimeSec: 5 * 60, breakTimeSec: 30 };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * Tela standalone de Android TV/Google TV/Fire TV: configurada e
 * controlada 100% pelo controle remoto (D-pad + OK + Back), sem celular
 * nenhum. Mesmo conceito do canal Roku standalone (roku-standalone/),
 * espelhado em RN — reaproveita buildSchedulePhases()/phaseAtElapsedMs()
 * de timerEngine.ts direto (mesma lógica pura, sem porte de linguagem) e
 * o mesmo mecanismo de relógio de parede já usado em TimerScreen.tsx
 * (âncoras de Date.now(), nunca um contador decrementado por
 * setInterval — ver comentário equivalente lá).
 *
 * Sem HTTP, sem QR code, sem TimerServer: essa tela não fala com nenhum
 * celular, é 100% local ao processo da própria TV.
 *
 * Navegação por D-pad usa `TouchableOpacity` (não `Pressable`) porque só
 * o tipo de `TouchableOpacity` expõe `nextFocusUp/Down/Left/Right` e
 * `hasTVPreferredFocus` nos types do RN core — são props nativas reais
 * de qualquer View Android, mas a tipagem do Pressable não as declara
 * nesta versão. O destaque visual de foco é manual via `onFocus`/`onBlur`
 * (Pressable teria dado isso de graça via `state.focused`, mas essa
 * propriedade também não existe na tipagem desta versão).
 */
export default function TVTimerScreen() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Configuração (tela de setup)
  const [totalRounds, setTotalRounds] = useState(DEFAULT_CONFIG.totalRounds);
  const [roundTimeSec, setRoundTimeSec] = useState(DEFAULT_CONFIG.roundTimeSec);
  const [breakTimeSec, setBreakTimeSec] = useState(DEFAULT_CONFIG.breakTimeSec);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Estado da corrida (tela run)
  const [screen, setScreen] = useState<'setup' | 'run'>('setup');
  const [currentRound, setCurrentRound] = useState(1);
  const [isRest, setIsRest] = useState(false);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [, forceRender] = useState(0);

  // Qual botão está com foco de D-pad no momento — controla o destaque
  // visual manualmente (ver comentário no topo do arquivo).
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focusHandlers = (key: string) => ({
    onFocus: () => setFocusedKey(key),
    onBlur: () => setFocusedKey(prev => (prev === key ? null : prev)),
  });

  // Relógio de parede — mesmo padrão de TimerScreen.tsx.
  const anchorMsRef = useRef(0);
  const anchorElapsedMsRef = useRef(0);
  const pausedElapsedMsRef = useRef(0);

  function nowElapsedMs(): number {
    if (paused) return pausedElapsedMsRef.current;
    return anchorElapsedMsRef.current + (Date.now() - anchorMsRef.current);
  }

  // Carrega a última configuração salva (só no boot) — exceção pontual à
  // filosofia "sem persistência" do projeto, mesmo racional do
  // roRegistrySection do canal Roku standalone: sem celular por perto,
  // reconfigurar do zero toda vez que a TV liga seria atrito real.
  useEffect(() => {
    AsyncStorage.getItem(TV_CONFIG_KEY)
      .then(raw => {
        if (raw) {
          const cfg: Partial<TVConfig> = JSON.parse(raw);
          if (cfg.totalRounds) setTotalRounds(cfg.totalRounds);
          if (cfg.roundTimeSec) setRoundTimeSec(cfg.roundTimeSec);
          if (cfg.breakTimeSec !== undefined) setBreakTimeSec(cfg.breakTimeSec);
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, []);

  // Tick de re-exibição: só força re-render e deriva o tempo do relógio
  // de parede — nunca decrementa um contador.
  useEffect(() => {
    if (screen !== 'run') return;
    intervalRef.current = setInterval(() => {
      tick();
      forceRender(r => r + 1);
    }, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, paused, done]);

  function tick() {
    if (screen !== 'run' || paused || done) return;
    const schedule = buildSchedulePhases(totalRounds, roundTimeSec, breakTimeSec);
    const snap = phaseAtElapsedMs(schedule, nowElapsedMs());
    if (snap.done) {
      setDone(true);
      return;
    }
    setCurrentRound(snap.currentRound);
    setIsRest(snap.isRest);
    setTimeLeft(snap.secondsLeft);
    setTotalTime(Math.round(snap.totalPhaseMs / 1000));
  }

  const startTimer = () => {
    AsyncStorage.setItem(
      TV_CONFIG_KEY,
      JSON.stringify({ totalRounds, roundTimeSec, breakTimeSec }),
    ).catch(() => {});
    anchorMsRef.current = Date.now();
    anchorElapsedMsRef.current = 0;
    pausedElapsedMsRef.current = 0;
    setCurrentRound(1);
    setIsRest(false);
    setPaused(false);
    setDone(false);
    setTimeLeft(roundTimeSec);
    setTotalTime(roundTimeSec);
    setScreen('run');
  };
  const togglePause = () => {
    const next = !paused;
    if (next) {
      pausedElapsedMsRef.current = nowElapsedMs();
    } else {
      anchorElapsedMsRef.current = pausedElapsedMsRef.current;
      anchorMsRef.current = Date.now();
    }
    setPaused(next);
  };
  const backToSetup = () => {
    setScreen('setup');
    setDone(false);
    setPaused(false);
  };

  const changeRounds = (d: number) => setTotalRounds(v => Math.max(1, Math.min(99, v + d)));
  const changeRoundTime = (d: number) => setRoundTimeSec(v => Math.max(30, Math.min(3600, v + d)));
  const changeBreak = (d: number) => setBreakTimeSec(v => Math.max(0, Math.min(3600, v + d)));

  // Back físico do controle: sem listener, o RN chama BackHandler.exitApp()
  // e fecha o app inteiro — armadilha real de qualquer app de Android TV.
  // Só interceptamos na tela "run" (volta pro setup); no "setup", Back
  // vaza e sai do app normalmente (comportamento esperado em leanback).
  useEffect(() => {
    if (screen !== 'run') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backToSetup();
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  // ═══════════════ Foco por D-pad (setup) ═══════════════
  // Cada campo tem um par de botões −/+. Left/Right navegam dentro do
  // par, Up/Down navegam entre campos (mesma coluna) até o botão INICIAR.
  // nextFocus* recebem reactTag (number), não uma ref direta — por isso
  // findNodeHandle() num useEffect após todos os refs populados.
  const roundsMinusRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const roundsPlusRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const timeMinusRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const timePlusRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const breakMinusRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const breakPlusRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const startRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);

  const [focusTags, setFocusTags] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    if (!configLoaded) return;
    const tag = (ref: React.RefObject<React.ComponentRef<typeof TouchableOpacity> | null>) =>
      findNodeHandle(ref.current) ?? undefined;
    setFocusTags({
      roundsMinus: tag(roundsMinusRef),
      roundsPlus: tag(roundsPlusRef),
      timeMinus: tag(timeMinusRef),
      timePlus: tag(timePlusRef),
      breakMinus: tag(breakMinusRef),
      breakPlus: tag(breakPlusRef),
      start: tag(startRef),
    });
  }, [configLoaded]);

  if (screen === 'run') {
    const pct = totalTime > 0 ? ((totalTime - timeLeft) / totalTime) * 100 : 0;
    const warning = !isRest && timeLeft <= 10;
    return (
      <View style={styles.container}>
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
            <TouchableOpacity
              hasTVPreferredFocus
              style={[styles.pauseBtn, focusedKey === 'pause' && styles.focused]}
              onPress={togglePause}
              {...focusHandlers('pause')}
            >
              <Text style={styles.pauseBtnText}>{paused ? 'CONTINUAR' : 'PAUSAR'}</Text>
            </TouchableOpacity>
          )}
          {done && (
            <TouchableOpacity
              hasTVPreferredFocus
              style={[styles.pauseBtn, focusedKey === 'repeat' && styles.focused]}
              onPress={backToSetup}
              {...focusHandlers('repeat')}
            >
              <Text style={styles.pauseBtnText}>REPETIR</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>Voltar no controle reinicia a configuração</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.setupTitle}>Configure a luta</Text>

      <View style={styles.configRow}>
        <TouchableOpacity
          ref={roundsMinusRef}
          hasTVPreferredFocus
          nextFocusRight={focusTags.roundsPlus}
          nextFocusDown={focusTags.timeMinus}
          style={[styles.circleBtn, focusedKey === 'roundsMinus' && styles.focused]}
          onPress={() => changeRounds(-1)}
          {...focusHandlers('roundsMinus')}
        >
          <Text style={styles.circleBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.configLabel}>ROUNDS</Text>
        <Text style={styles.configValue}>{totalRounds}</Text>
        <TouchableOpacity
          ref={roundsPlusRef}
          nextFocusLeft={focusTags.roundsMinus}
          nextFocusDown={focusTags.timePlus}
          style={[styles.circleBtn, focusedKey === 'roundsPlus' && styles.focused]}
          onPress={() => changeRounds(1)}
          {...focusHandlers('roundsPlus')}
        >
          <Text style={styles.circleBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.timerSetupWrap}>
        <TouchableOpacity
          ref={timeMinusRef}
          nextFocusRight={focusTags.timePlus}
          nextFocusUp={focusTags.roundsMinus}
          nextFocusDown={focusTags.breakMinus}
          style={[styles.circleBtn, focusedKey === 'timeMinus' && styles.focused]}
          onPress={() => changeRoundTime(-30)}
          {...focusHandlers('timeMinus')}
        >
          <Text style={styles.circleBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.bigTimerSetup}>{mmss(roundTimeSec)}</Text>
        <TouchableOpacity
          ref={timePlusRef}
          nextFocusLeft={focusTags.timeMinus}
          nextFocusUp={focusTags.roundsPlus}
          nextFocusDown={focusTags.breakPlus}
          style={[styles.circleBtn, focusedKey === 'timePlus' && styles.focused]}
          onPress={() => changeRoundTime(30)}
          {...focusHandlers('timePlus')}
        >
          <Text style={styles.circleBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.configRow}>
        <TouchableOpacity
          ref={breakMinusRef}
          nextFocusRight={focusTags.breakPlus}
          nextFocusUp={focusTags.timeMinus}
          nextFocusDown={focusTags.start}
          style={[styles.circleBtn, focusedKey === 'breakMinus' && styles.focused]}
          onPress={() => changeBreak(-15)}
          {...focusHandlers('breakMinus')}
        >
          <Text style={styles.circleBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.configLabel}>INTERVALO</Text>
        <Text style={styles.configValue}>{mmss(breakTimeSec)}</Text>
        <TouchableOpacity
          ref={breakPlusRef}
          nextFocusLeft={focusTags.breakMinus}
          nextFocusUp={focusTags.timePlus}
          nextFocusDown={focusTags.start}
          style={[styles.circleBtn, focusedKey === 'breakPlus' && styles.focused]}
          onPress={() => changeBreak(15)}
          {...focusHandlers('breakPlus')}
        >
          <Text style={styles.circleBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        ref={startRef}
        nextFocusUp={focusTags.breakMinus}
        style={[styles.startBtn, focusedKey === 'start' && styles.focusedStart]}
        onPress={startTimer}
        {...focusHandlers('start')}
      >
        <Text style={styles.startBtnText}>INICIAR</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Cima/Baixo trocam de campo — Esquerda/Direita ajustam — OK confirma</Text>
    </View>
  );
}

const YELLOW = '#C8F400';
const DARK = '#1a1a1a';
const MUTED = '#666';
const WARNING = '#ff4444';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' },

  setupTitle: {
    color: '#fff', fontSize: 32, letterSpacing: 4, marginBottom: 32,
    fontFamily: 'BebasNeue-Regular',
  },

  configRow: { flexDirection: 'row', alignItems: 'center', gap: 28, marginVertical: 14 },
  circleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focused: {
    borderColor: YELLOW,
    backgroundColor: 'rgba(200,244,0,0.12)',
  },
  circleBtnText: { color: '#fff', fontSize: 30, lineHeight: 30 },
  configLabel: {
    color: '#fff', fontSize: 26, letterSpacing: 3, minWidth: 220, textAlign: 'center',
    fontFamily: 'BebasNeue-Regular',
  },
  configValue: {
    color: '#fff', fontSize: 26, letterSpacing: 2, minWidth: 110, textAlign: 'center',
    fontFamily: 'BebasNeue-Regular',
  },

  timerSetupWrap: { flexDirection: 'row', alignItems: 'center', gap: 28, marginVertical: 24 },
  bigTimerSetup: {
    color: '#fff', fontSize: 88, fontVariant: ['tabular-nums'], letterSpacing: -1,
    fontFamily: 'BebasNeue-Regular', minWidth: 260, textAlign: 'center',
  },

  startBtn: {
    backgroundColor: YELLOW,
    borderRadius: 50,
    paddingVertical: 20,
    paddingHorizontal: 90,
    marginTop: 32,
  },
  focusedStart: {
    backgroundColor: '#fff',
  },
  startBtnText: {
    color: '#111', fontSize: 26, letterSpacing: 6, fontFamily: 'BebasNeue-Regular',
  },

  runBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Indicador de round: sempre visível durante a corrida (não só na
  // transição de fase), fonte maior que a versão de celular por ser
  // vista de longe.
  roundIndicator: {
    color: '#fff', fontSize: 38, letterSpacing: 4, opacity: 0.9, marginBottom: 20,
    fontFamily: 'BebasNeue-Regular',
  },
  // Contador maior que o de celular (110) — TV é vista de mais longe.
  bigTimer: {
    color: YELLOW, fontSize: 240, fontVariant: ['tabular-nums'], letterSpacing: -4,
    fontFamily: 'BebasNeue-Regular',
  },
  bigTimerRest: { color: MUTED },
  bigTimerWarning: { color: WARNING },
  pauseBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 56,
    marginTop: 32,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pauseBtnText: { color: '#fff', fontSize: 22, letterSpacing: 5, fontFamily: 'BebasNeue-Regular' },

  hint: {
    color: '#555', fontSize: 16, marginTop: 28, textAlign: 'center',
    fontFamily: 'BebasNeue-Regular', letterSpacing: 1,
  },

  progressWrap: { width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  progressFill: { height: '100%', backgroundColor: YELLOW },
  progressRest: { backgroundColor: MUTED },
  progressWarning: { backgroundColor: WARNING },
});

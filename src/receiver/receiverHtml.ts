import { BEBAS_NEUE_BASE64 } from './bebasNeueFont';

/**
 * Página estática servida pelo celular em GET / para a Smart TV.
 *
 * Layout, cores e o sintetizador do sino (Web Audio API) foram copiados
 * quase 1:1 da tela "run" + overlay "done" do index.html original do
 * Fight Timer (ct-timer) — só a fonte de verdade do tempo mudou: em vez de
 * rodar o próprio setInterval, esta página só faz polling em GET /state
 * a cada 300ms e reflete o que o celular manda. Sem login, sem gravar nada.
 */
export const RECEIVER_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fight Timer</title>
<style>
  @font-face {
    font-family: 'Bebas Neue';
    src: url('data:font/ttf;base64,${BEBAS_NEUE_BASE64}') format('truetype');
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --yellow: #C8F400;
    --dark: #1a1a1a;
    --text: #ffffff;
    --muted: #666;
  }

  html, body {
    height: 100%;
    background: var(--dark);
    color: var(--text);
    font-family: 'Bebas Neue', sans-serif;
    overflow: hidden;
  }

  body {
    display: flex; flex-direction: column;
    align-items: center; justify-content: space-between;
    height: 100vh; width: 100%;
    position: relative;
  }

  .topbar {
    width: 100%; display: flex;
    align-items: center; justify-content: space-between;
    padding: 20px 28px; flex-shrink: 0;
  }
  .logo {
    display: flex; align-items: center; gap: 8px;
    opacity: 0.4; font-size: 0.75rem; letter-spacing: 3px; color: var(--text);
  }
  .logo svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.5; }

  .run-body {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; width: 100%;
  }

  .round-indicator {
    font-size: clamp(2rem, 6vw, 4rem);
    letter-spacing: 6px; color: var(--text);
    margin-bottom: 20px; opacity: 0.88;
  }

  .big-timer-run {
    font-size: clamp(8rem, 30vw, 22rem);
    color: var(--yellow); letter-spacing: -4px;
    line-height: 1; display: flex; align-items: center;
    transition: color 0.3s;
  }
  .big-timer-run.rest-phase { color: var(--muted); }
  .big-timer-run.warning    { color: #ff4444; }
  .big-timer-run.idle-phase { color: var(--muted); opacity: 0.5; }

  .colon-run {
    display: inline-flex; flex-direction: column;
    gap: 16px; align-items: center;
    margin: 0 2px; position: relative; bottom: 14px;
    animation: blink 1s step-end infinite;
  }
  .colon-run span { display: block; width: 13px; height: 13px; background: currentColor; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
  .big-timer-run.paused .colon-run,
  .big-timer-run.idle-phase .colon-run { animation: none; opacity: 0.15; }

  .offline-banner {
    position: absolute; top: 4vh;
    font-size: 1.6vw; color: #ff4444;
    letter-spacing: 0.3vw; text-transform: uppercase;
    opacity: 0; transition: opacity 0.3s ease;
  }
  .offline-banner.visible { opacity: 1; }

  .progress-wrap {
    position: absolute; bottom: 0; left: 0;
    width: 100%; height: 10px;
    background: rgba(255,255,255,0.05);
  }
  .progress-fill {
    height: 100%; background: var(--yellow);
    width: 0%; transition: width 0.7s linear, background 0.3s;
  }
  .progress-fill.rest-phase { background: var(--muted); }
  .progress-fill.warning    { background: #ff4444; }

  .sound-btn {
    position: fixed; bottom: 22px; right: 28px;
    background: none; border: none; cursor: pointer;
    color: var(--muted); transition: color 0.2s; z-index: 99;
  }
  .sound-btn:hover { color: var(--yellow); }
  .sound-btn.muted { color: #333; }
  .sound-btn svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; }

  .done-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(26,26,26,0.97); z-index: 200;
    flex-direction: column; align-items: center;
    justify-content: center; gap: 24px;
  }
  .done-overlay.show { display: flex; }
  .done-title { font-size: clamp(4rem, 16vw, 9rem); letter-spacing: 8px; color: var(--yellow); }
  .done-sub   { font-size: clamp(1.2rem, 3vw, 1.8rem); letter-spacing: 4px; color: var(--muted); }
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
    FIGHT TIMER
  </div>
</div>

<div class="offline-banner" id="offlineBanner">Sem conexão com o celular — tentando reconectar…</div>

<div class="run-body">
  <div class="round-indicator" id="roundIndicator">Aguardando o celular…</div>
  <div class="big-timer-run idle-phase" id="bigTimerRun">
    <span id="runMin">00</span>
    <span class="colon-run"><span></span><span></span></span>
    <span id="runSec">00</span>
  </div>
</div>

<div class="progress-wrap">
  <div class="progress-fill" id="progressFill"></div>
</div>

<div class="done-overlay" id="doneOverlay">
  <div class="done-title">FIM!</div>
  <div class="done-sub" id="doneSub"></div>
</div>

<button class="sound-btn" id="soundBtn" title="Mutar só na TV">
  <svg id="soundIcon" viewBox="0 0 24 24">
    <path d="M11 5L6 9H2v6h4l5 4V5z"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
</button>

<script>
(function () {
  // ── Elementos ──
  var roundIndicator = document.getElementById('roundIndicator');
  var timerEl = document.getElementById('bigTimerRun');
  var minEl = document.getElementById('runMin');
  var secEl = document.getElementById('runSec');
  var fillEl = document.getElementById('progressFill');
  var doneOverlay = document.getElementById('doneOverlay');
  var doneSub = document.getElementById('doneSub');
  var offlineEl = document.getElementById('offlineBanner');
  var soundBtn = document.getElementById('soundBtn');
  var soundIcon = document.getElementById('soundIcon');

  // Mudo é uma escolha local da TV (não depende do celular) — quem está na
  // sala é quem decide se quer o sino tocando pela caixa de som da TV.
  var localMuted = false;
  soundBtn.addEventListener('click', function () {
    localMuted = !localMuted;
    soundBtn.classList.toggle('muted', localMuted);
    var onSVG  = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    var offSVG = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    soundIcon.innerHTML = localMuted ? offSVG : onSVG;
  });

  function pad(n) { return String(n).padStart(2, '0'); }

  // ══════════════════════════════════════════════════════
  //  METALLIC BOXING BELL — mesmo sintetizador do index.html
  //  (FM + parciais inarmônicos + transiente de ruído)
  // ══════════════════════════════════════════════════════
  var actx = null;
  function getCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    return actx;
  }

  function metalBell(t, fund, vol, decay) {
    var ctx = getCtx();
    var noiseLen = Math.floor(ctx.sampleRate * 0.06);
    var noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
    var bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = fund * 3; bpf.Q.value = 0.8;
    var noiseNode = ctx.createBufferSource();
    noiseNode.buffer = noiseBuf;
    var noiseGain = ctx.createGain();
    noiseNode.connect(bpf); bpf.connect(noiseGain); noiseGain.connect(ctx.destination);
    noiseGain.gain.setValueAtTime(vol * 0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    noiseNode.start(t); noiseNode.stop(t + 0.06);

    var partials = [
      [1.000, 1.00, decay],
      [2.756, 0.60, decay * 0.72],
      [4.070, 0.35, decay * 0.55],
      [5.408, 0.22, decay * 0.42],
      [7.810, 0.12, decay * 0.30],
      [10.65, 0.07, decay * 0.20],
      [0.500, 0.40, decay * 1.20],
    ];
    partials.forEach(function (p) {
      var ratio = p[0], amp = p[1], pdecay = p[2];
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      var freq = fund * ratio;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.997, t + 0.04);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(amp * vol * 0.5, t + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + pdecay);
      osc.start(t); osc.stop(t + pdecay + 0.05);
    });
  }

  function metalTick(t) {
    var ctx = getCtx();
    [0, 0.24].forEach(function (offset) {
      var st = t + offset;
      [[2093, 0.3, 0.25], [3136, 0.18, 0.18], [1047, 0.22, 0.3]].forEach(function (row) {
        var f = row[0], a = row[1], d = row[2];
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, st);
        o.frequency.exponentialRampToValueAtTime(f * 0.994, st + 0.03);
        g.gain.setValueAtTime(0, st);
        g.gain.linearRampToValueAtTime(a, st + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, st + d);
        o.start(st); o.stop(st + d + 0.02);
      });
    });
  }

  function playBell(type) {
    if (localMuted) return;
    try {
      var ctx = getCtx();
      var now = ctx.currentTime;
      if (type === 1) {
        metalBell(now, 420, 0.7, 3.5);
      } else if (type === 2) {
        metalTick(now);
      } else {
        metalBell(now, 420, 0.75, 3.0);
        metalBell(now + 0.45, 420, 0.65, 2.8);
        metalBell(now + 0.90, 420, 0.65, 3.2);
      }
    } catch (e) {}
  }

  // Desbloqueia o AudioContext no primeiro toque/clique na TV (autoplay policy)
  document.addEventListener('click', function () { try { getCtx().resume(); } catch (e) {} }, { once: true });

  // ── Polling + relógio de parede ──
  // A fonte de verdade NUNCA é "decrementar um contador no recebedor": a
  // página guarda um cache com o cronograma inteiro (schedule), quanto
  // tempo de luta já rodou (elapsedMs) e o instante do relógio do celular
  // em que o cache foi gravado (serverNowMs). A partir daí, enquanto o
  // fetch funcionar, o relógio da TV corrige o erro de offset entre os dois
  // dispositivos a cada poll. Se o celular congelar em background, a TV
  // continua sozinha: elapsedMs deriva do próprio Date.now()+offset, sem
  // depender do polling para nenhum cálculo de tempo.
  var POLL_MS = 300;
  var TICK_MS = 250;
  var failCount = 0;
  var prev = null; // último estado APLICADO, p/ detectar transições e tocar o sino

  // cache = { seconds, totalTime, running, paused, phase, currentRound,
  //   totalRounds, elapsedMs, serverNowMs, rxNowMs (relógio local no rx),
  //   roundTimeSec, breakTimeSec, schedule }
  var cache = null;

  function setOffline(offline) {
    offlineEl.classList.toggle('visible', offline);
  }

  function nowServerMs() {
    if (!cache) return 0;
    // offset = relógio da TV - relógio do celular no último poll; reaplica
    // ao "agora local" pra voltar pra escala de tempo do servidor.
    return Date.now() + (cache.serverNowMs - cache.rxNowMs);
  }

  // Equivale ao phaseAtElapsedMs() do timerEngine (duplicado aqui porque a
  // página é HTML estático sem imports): caminha no cronograma absoluto e
  // devolve em que fase/round estamos e quanto falta.
  function phaseAtElapsedMs(schedule, elapsedMs) {
    var clamped = Math.max(0, elapsedMs);
    for (var i = 0; i < schedule.length; i++) {
      var ph = schedule[i];
      var endMs = ph.startMs + ph.durMs;
      if (clamped < endMs) {
        return {
          done: false,
          currentRound: ph.round,
          isRest: ph.kind === 'rest',
          phaseKind: ph.kind,
          secondsLeft: Math.max(0, Math.ceil((endMs - clamped) / 1000)),
          totalPhaseMs: ph.durMs,
          elapsedPhaseMs: clamped - ph.startMs,
        };
      }
    }
    return { done: true, currentRound: 0, isRest: false, phaseKind: 'round', secondsLeft: 0, totalPhaseMs: 0, elapsedPhaseMs: 0 };
  }

  // Deriva o estado atual a partir do cache + relógio de parede. Se não
  // houver como derivar (idle/done/paused), devolve o cache como estava.
  function deriveState() {
    if (!cache) return null;
    var st = cache;
    var elapsedMs = st.elapsedMs;

    if (st.phase === 'idle') return st;
    if (st.paused || !st.running) return st;

    elapsedMs = st.elapsedMs + (nowServerMs() - st.serverNowMs);

    var snap = phaseAtElapsedMs(st.schedule, elapsedMs);
    if (snap.done) {
      return {
        seconds: 0, totalTime: 0, running: false, paused: false,
        phase: 'done', currentRound: st.totalRounds, totalRounds: st.totalRounds,
        soundOn: st.soundOn, elapsedMs: elapsedMs, serverNowMs: 0, rxNowMs: 0,
        roundTimeSec: st.roundTimeSec, breakTimeSec: st.breakTimeSec, schedule: st.schedule,
      };
    }
    return {
      seconds: snap.secondsLeft, totalTime: Math.round(snap.totalPhaseMs / 1000),
      running: true, paused: false,
      phase: snap.isRest ? 'rest' : 'round',
      currentRound: snap.currentRound,
      totalRounds: st.totalRounds,
      soundOn: st.soundOn, elapsedMs: elapsedMs, serverNowMs: 0, rxNowMs: 0,
      roundTimeSec: st.roundTimeSec, breakTimeSec: st.breakTimeSec, schedule: st.schedule,
    };
  }

  function maybePlayBell(state) {
    var prevPhase = prev ? prev.phase : null;

    if (!prev) { prev = state; return; }

    var startedRound = state.phase === 'round' && state.seconds === state.totalTime &&
      !(prevPhase === 'round' && prev.seconds === prev.totalTime);
    var enteredDone = state.phase === 'done' && prevPhase !== 'done';
    var warning = state.phase === 'round' && state.seconds === 10 && prev.seconds !== 10;
    var roundEnded = prevPhase === 'round' && state.phase !== 'round' && state.phase !== 'done';

    if (enteredDone) playBell(3);
    else if (roundEnded) playBell(3);
    else if (startedRound) playBell(1);
    else if (warning) playBell(2);

    prev = state;
  }

  function applyState(state) {
    minEl.textContent = pad(Math.floor(state.seconds / 60));
    secEl.textContent = pad(state.seconds % 60);

    timerEl.classList.remove('rest-phase', 'warning', 'paused', 'idle-phase');
    if (state.phase === 'idle') {
      timerEl.classList.add('idle-phase');
      roundIndicator.textContent = 'Aguardando início no celular';
    } else if (state.phase === 'rest') {
      timerEl.classList.add('rest-phase');
      roundIndicator.textContent = 'INTERVALO — ROUND ' + state.currentRound + ' / ' + state.totalRounds;
    } else if (state.phase === 'round') {
      roundIndicator.textContent = 'ROUND ' + state.currentRound + ' / ' + state.totalRounds;
      if (state.seconds <= 10) timerEl.classList.add('warning');
    }
    if (state.paused) timerEl.classList.add('paused');

    var pct = state.totalTime > 0 ? ((state.totalTime - state.seconds) / state.totalTime) * 100 : 0;
    fillEl.style.width = pct + '%';
    fillEl.classList.remove('rest-phase', 'warning');
    if (state.phase === 'rest') fillEl.classList.add('rest-phase');
    else if (state.phase === 'round' && state.seconds <= 10) fillEl.classList.add('warning');

    var isDone = state.phase === 'done';
    doneOverlay.classList.toggle('show', isDone);
    if (isDone) {
      doneSub.textContent = state.totalRounds + ' ROUND' + (state.totalRounds > 1 ? 'S' : '') + ' COMPLETOS';
    }

    maybePlayBell(state);
  }

  // Aplica o estado derivado a cada tick — mesmo que o polling falhe (o
  // cache guardado continua alimentando o relógio de parede da TV).
  function refresh() {
    var state = deriveState();
    if (state) applyState(state);
  }

  function poll() {
    fetch('/state', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (state) {
        failCount = 0;
        setOffline(false);
        cache = {
          seconds: state.seconds,
          paused: state.paused,
          phase: state.phase,
          currentRound: state.currentRound,
          totalRounds: state.totalRounds,
          elapsedMs: state.elapsedMs,
          serverNowMs: state.serverNowMs,
          rxNowMs: Date.now(),
          roundTimeSec: state.roundTimeSec,
          breakTimeSec: state.breakTimeSec,
          schedule: state.schedule,
          totalTime: state.totalTime,
          running: state.running,
        };
        // Redisk até o próximo poll (o refresh interval faz o resto).
        refresh();
      })
      .catch(function () {
        failCount++;
        if (failCount >= 3) setOffline(true);
        // Não para: o refresh() segue com o cache local.
      })
      .finally(function () {
        setTimeout(poll, POLL_MS);
      });
  }

  // Tick local: deriva o tempo a cada 250ms mesmo sem polling novo.
  setInterval(refresh, TICK_MS);
  poll();
})();
</script>
</body>
</html>`;

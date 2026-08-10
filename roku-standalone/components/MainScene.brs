' Cena principal do canal STANDALONE: sem celular, sem PollTask. O
' cronograma de rounds/intervalos é montado localmente (buildSchedulePhases,
' porta de src/screens/timerEngine.ts) a partir da configuração feita na
' tela de setup por spinners, e alimenta o mesmo "cache de relógio de
' parede" (m.cache = { state, rxSec }) que o canal com celular usa — por
' isso deriveState()/lookupPhase()/applyState()/maybePlayBell() abaixo são
' cópias quase literais do roku/components/MainScene.brs original: o
' contrato de dados é o mesmo, só a origem do `schedule` muda (local em vez
' de vir de /state).
'
' A tela de setup é gerenciada inteiramente aqui (sem componente filho),
' com destaque manual de campo, sem setFocus() nativo por campo — mesmo
' padrão do ipEntryGroup do canal original.

sub init()
    ' NUNCA criar `roAppManager` aqui — ver comentário completo em
    ' roku/source/main.brs (mesma tentativa abandonada no canal com
    ' celular, duas variantes diferentes, ambas quebraram em hardware
    ' real).
    m.background = m.top.findNode("background")
    m.logo = m.top.findNode("logo")
    m.roundIndicator = m.top.findNode("roundIndicator")
    m.bigTimer = m.top.findNode("bigTimer")
    m.progressFill = m.top.findNode("progressFill")
    m.doneOverlay = m.top.findNode("doneOverlay")
    m.doneSub = m.top.findNode("doneSub")
    m.bellAudio = m.top.findNode("bellAudio")
    m.clockTickTimer = m.top.findNode("clockTickTimer")
    m.runHint = m.top.findNode("runHint")

    setupSetupScreen()

    m.prevState = invalid
    m.cache = invalid ' { state, rxSec }: cronograma local + nosso epoch-sec de referência
    m.standaloneRunning = false
    m.standalonePaused = false

    m.clockTickTimer.observeField("fire", "onClockTick")
    m.clockTickTimer.control = "start"

    showSetup()

    ' setFocus() chamado durante a construção da cena (antes de
    ' roSGScreen.show() rodar) falha — confirmado em teste real no canal
    ' com celular, mesmo cuidado replicado aqui.
    m.initialFocusTimer = m.top.findNode("initialFocusTimer")
    m.initialFocusTimer.observeField("fire", "onInitialFocusTimer")
    m.initialFocusTimer.control = "start"
end sub

sub onInitialFocusTimer()
    m.top.setFocus(true)
end sub

' ═══════════════ Cronograma local (porta de timerEngine.ts) ═══════════════
' Mesma regra do buildSchedulePhases() em src/screens/timerEngine.ts:
' round 1 → intervalo → round 2 → ... → último round sem intervalo depois;
' breakTimeSec = 0 pula a fase de descanso inteiramente. Usa LongInteger
' explícito no cursor e nos produtos, via sufixo `&` (não existe função
' `CLng()` em BrightScript — isso é um "vazamento" de Visual Basic; a
' forma certa de forçar um literal LongInteger é sufixar com `&`, o que
' promove toda a expressão aritmética envolvida) — o pior caso realista
' (99 rounds de 3600s cada + 98 intervalos de 3600s) chega perto de ~709
' milhões de ms, dentro do limite de Integer32 (~2.147 bilhões) mas perto
' o bastante pra justificar o cuidado de tipo aqui.
'
' BUG REAL JÁ ENCONTRADO (não reintroduzir): a primeira versão usava
' `CLng(...)` como se fosse uma função de conversão (existe em VB, não em
' BrightScript) — travava o app inteiro na hora de apertar OK pra
' iniciar, com "Function Call Operator ( ) attempted on non-function"
' (BrightScript trata identificador não-declarado como Invalid e tentar
' "chamar" `CLng(0)` estoura). Confirmado em hardware real via console de
' debug (telnet 8085) + reprodução por ECP.
function buildSchedulePhases(totalRounds as Integer, roundTimeSec as Integer, breakTimeSec as Integer) as Object
    phases = []
    cursor = 0&
    for round = 1 to totalRounds
        durRoundMs = roundTimeSec * 1000&
        phases.Push({ kind: "round", round: round, startMs: cursor, durMs: durRoundMs })
        cursor = cursor + durRoundMs
        if round < totalRounds and breakTimeSec > 0
            durBreakMs = breakTimeSec * 1000&
            phases.Push({ kind: "rest", round: round, startMs: cursor, durMs: durBreakMs })
            cursor = cursor + durBreakMs
        end if
    end for
    return phases
end function

' ═══════════════ Relógio de parede: deriva o estado do cache local ═══════════════
' Mesma mecânica do canal com celular: guardamos elapsedMs "congelado" +
' rxSec (epoch em segundos no instante em que esse elapsedMs passou a
' valer). A qualquer momento depois:
'   elapsedMs = cache.elapsedMs + (epochSec() - cache.rxSec) * 1000
' Só deltas do próprio relógio da Roku (cabe em Integer32/LongInteger) —
' nunca soma epoch absoluto em ms.

function epochSec() as Integer
    return CreateObject("roDateTime").AsSeconds()
end function

function computeElapsedMs() as LongInteger
    return m.cache.state.elapsedMs + (epochSec() - m.cache.rxSec) * 1000&
end function

' Caminha no cronograma absoluto e devolve a fase atual — espelho do
' phaseAtElapsedMs() do timerEngine.ts (mesmo algoritmo, BrightScript).
function lookupPhase(elapsedMs as LongInteger) as Object
    for each ph in m.cache.state.schedule
        endMs = ph.startMs + ph.durMs
        if elapsedMs < endMs
            remMs = endMs - elapsedMs
            secondsLeft = int(remMs / 1000)
            if remMs mod 1000 <> 0 then secondsLeft = secondsLeft + 1
            return {
                done: false
                currentRound: ph.round
                isRest: (ph.kind = "rest")
                phaseKind: ph.kind
                secondsLeft: secondsLeft
                totalPhaseMs: ph.durMs
            }
        end if
    end for
    return { done: true, currentRound: 0, isRest: false, phaseKind: "round", secondsLeft: 0, totalPhaseMs: 0 }
end function

' Deriva o estado atual do cache local + relógio de parede, ou devolve o
' cache puro quando pausado (o cache já guarda seconds/totalTime/phase
' prontos nesse caso — ver pauseFight()).
function deriveState()
    if m.cache = invalid then return invalid
    st = m.cache.state
    if st.paused or not st.running then return st

    elapsedMs = computeElapsedMs()
    snap = lookupPhase(elapsedMs)

    result = { }
    result.totalRounds = st.totalRounds
    result.soundOn = st.soundOn
    result.schedule = st.schedule
    if snap.done
        result.seconds = 0
        result.totalTime = 0
        result.running = false
        result.paused = false
        result.phase = "done"
        result.currentRound = st.totalRounds
    else
        result.seconds = snap.secondsLeft
        result.totalTime = int(snap.totalPhaseMs / 1000)
        result.running = true
        result.paused = false
        result.currentRound = snap.currentRound
        if snap.isRest
            result.phase = "rest"
        else
            result.phase = "round"
        end if
    end if
    return result
end function

sub onClockTick()
    if m.cache = invalid then return
    state = deriveState()
    if state <> invalid then applyState(state)
end sub

' ═══════════════ Tela de setup: 3 spinners (rounds / round / intervalo) ═══════════════
' Sem teclado nenhum: cima/baixo muda o valor do campo atual (passo e
' clamp por campo, iguais ao setup do app RN em TimerScreen.tsx),
' esquerda/direita troca de campo, OK confirma tudo de uma vez e já
' inicia a luta.

sub setupSetupScreen()
    m.setupGroup = m.top.findNode("setupGroup")
    m.setupValueLabels = [
        m.top.findNode("setupValue0"),
        m.top.findNode("setupValue1"),
        m.top.findNode("setupValue2")
    ]

    reg = CreateObject("roRegistrySection", "FightTimerTVStandalone")
    rounds = regReadInt(reg, "rounds", 10)
    roundTimeSec = regReadInt(reg, "roundTimeSec", 5 * 60)
    breakTimeSec = regReadInt(reg, "breakTimeSec", 30)

    m.setupIndex = 0
    m.setupValues = { rounds: rounds, roundTimeSec: roundTimeSec, breakTimeSec: breakTimeSec }
    m.setupVisible = false
end sub

function regReadInt(reg as Object, key as String, fallback as Integer) as Integer
    raw = reg.Read(key)
    if raw = invalid or raw = "" then return fallback
    return CInt(Val(raw))
end function

sub showSetup()
    m.setupVisible = true
    m.setupGroup.visible = true
    m.runHint.visible = false
    m.doneOverlay.visible = false
    m.roundIndicator.text = ""
    m.bigTimer.text = "00:00"
    m.bigTimer.color = "0x666666FF"
    m.progressFill.width = 0
    renderSetupFields()
end sub

sub hideSetup()
    m.setupVisible = false
    m.setupGroup.visible = false
end sub

sub renderSetupFields()
    m.setupValueLabels[0].text = intStr(m.setupValues.rounds)
    m.setupValueLabels[1].text = mmss(m.setupValues.roundTimeSec)
    m.setupValueLabels[2].text = mmss(m.setupValues.breakTimeSec)

    for i = 0 to 2
        if i = m.setupIndex
            m.setupValueLabels[i].color = "0xC8F400FF"
        else
            m.setupValueLabels[i].color = "0xFFFFFFFF"
        end if
    end for
end sub

sub moveSetupField(delta as Integer)
    m.setupIndex = (m.setupIndex + delta + 3) mod 3
    renderSetupFields()
end sub

' Passo e clamp por campo, espelhando changeRounds()/changeRoundTime()/
' changeBreak() de src/screens/TimerScreen.tsx.
sub adjustSetupValue(delta as Integer)
    if m.setupIndex = 0
        v = m.setupValues.rounds + delta * 1
        if v < 1 then v = 1
        if v > 99 then v = 99
        m.setupValues.rounds = v
    else if m.setupIndex = 1
        v = m.setupValues.roundTimeSec + delta * 30
        if v < 30 then v = 30
        if v > 3600 then v = 3600
        m.setupValues.roundTimeSec = v
    else
        v = m.setupValues.breakTimeSec + delta * 15
        if v < 0 then v = 0
        if v > 3600 then v = 3600
        m.setupValues.breakTimeSec = v
    end if
    renderSetupFields()
end sub

function mmss(totalSec as Integer) as String
    return pad(int(totalSec / 60)) + ":" + pad(totalSec mod 60)
end function

sub persistSetupConfig()
    reg = CreateObject("roRegistrySection", "FightTimerTVStandalone")
    reg.Write("rounds", intStr(m.setupValues.rounds))
    reg.Write("roundTimeSec", intStr(m.setupValues.roundTimeSec))
    reg.Write("breakTimeSec", intStr(m.setupValues.breakTimeSec))
    reg.Flush()
end sub

' ═══════════════ Start / pause / resume / reset ═══════════════

sub startFight()
    schedule = buildSchedulePhases(m.setupValues.rounds, m.setupValues.roundTimeSec, m.setupValues.breakTimeSec)
    persistSetupConfig()

    m.cache = {
        state: {
            phase: "round"
            running: true
            paused: false
            totalRounds: m.setupValues.rounds
            soundOn: true
            elapsedMs: 0&
            schedule: schedule
        }
        rxSec: epochSec()
    }
    m.prevState = invalid
    m.standaloneRunning = true
    m.standalonePaused = false

    hideSetup()
    m.runHint.visible = true

    state = deriveState()
    if state <> invalid then applyState(state)
end sub

sub pauseFight()
    if m.cache = invalid then return
    elapsedMs = computeElapsedMs()
    snap = lookupPhase(elapsedMs)
    st = m.cache.state

    newState = {
        totalRounds: st.totalRounds
        soundOn: st.soundOn
        schedule: st.schedule
        running: false
        paused: true
        elapsedMs: elapsedMs
    }
    if snap.done
        newState.phase = "done"
        newState.seconds = 0
        newState.totalTime = 0
        newState.currentRound = st.totalRounds
    else
        if snap.isRest
            newState.phase = "rest"
        else
            newState.phase = "round"
        end if
        newState.seconds = snap.secondsLeft
        newState.totalTime = int(snap.totalPhaseMs / 1000)
        newState.currentRound = snap.currentRound
    end if

    m.cache = { state: newState, rxSec: epochSec() }
    m.standalonePaused = true
    applyState(newState)
end sub

sub resumeFight()
    if m.cache = invalid then return
    st = m.cache.state
    if st.phase = "done" then return ' nada pra retomar depois do fim
    st.running = true
    st.paused = false
    m.cache = { state: st, rxSec: epochSec() } ' elapsedMs congelado reancorado agora
    m.standalonePaused = false
end sub

sub togglePause()
    if not m.standaloneRunning then return
    if m.standalonePaused then
        resumeFight()
    else
        pauseFight()
    end if
end sub

sub resetFight()
    m.cache = invalid
    m.prevState = invalid
    m.standaloneRunning = false
    m.standalonePaused = false
    m.doneOverlay.visible = false
    showSetup()
end sub

' ═══════════════ Teclado ═══════════════
' play: pausa/retoma a luta em andamento.
' replay: volta pra tela de configuração (reseta a luta atual).
' back: sem interceptação — mantém o comportamento padrão de sair do
' canal, comportamento previsível preservado.

function onKeyEvent(key as String, press as boolean) as Boolean
    if not press then return false

    if m.setupVisible
        if key = "up"
            adjustSetupValue(1)
            return true
        else if key = "down"
            adjustSetupValue(-1)
            return true
        else if key = "left"
            moveSetupField(-1)
            return true
        else if key = "right"
            moveSetupField(1)
            return true
        else if key = "OK"
            startFight()
            return true
        end if
        return false
    end if

    if m.standaloneRunning
        if key = "play"
            togglePause()
            return true
        else if key = "replay"
            resetFight()
            return true
        end if
    end if

    return false
end function

sub applyState(state as Object)
    seconds = safeInt(state.seconds, 0)
    totalTime = safeInt(state.totalTime, 0)
    currentRound = safeInt(state.currentRound, 1)
    totalRounds = safeInt(state.totalRounds, 1)
    phase = state.phase
    if phase = invalid then phase = "idle"
    running = state.running
    if running = invalid then running = false

    m.bigTimer.text = pad(int(seconds / 60)) + ":" + pad(seconds mod 60)

    if phase = "idle"
        m.roundIndicator.text = ""
        m.bigTimer.color = "0x666666FF"
    else if phase = "rest"
        m.roundIndicator.text = "INTERVALO - ROUND " + intStr(currentRound) + " / " + intStr(totalRounds)
        m.bigTimer.color = "0x666666FF"
    else if phase = "round"
        m.roundIndicator.text = "ROUND " + intStr(currentRound) + " / " + intStr(totalRounds)
        m.bigTimer.color = "0xC8F400FF"
        if seconds <= 10 then m.bigTimer.color = "0xFF4444FF"
    else if phase = "done"
        m.roundIndicator.text = "FIM!"
        m.bigTimer.color = "0xC8F400FF"
    end if

    if m.standalonePaused and phase <> "done"
        m.roundIndicator.text = m.roundIndicator.text + " (PAUSADO)"
    end if

    pct = 0
    if totalTime > 0 then pct = ((totalTime - seconds) / totalTime) * 100

    fillColor = "0xC8F400FF"
    if phase = "rest"
        fillColor = "0x666666FF"
    else if phase = "round" and seconds <= 10
        fillColor = "0xFF4444FF"
    end if
    m.progressFill.color = fillColor
    m.progressFill.width = 1920 * (pct / 100)

    isDone = (phase = "done")
    m.doneOverlay.visible = isDone
    m.runHint.visible = not isDone
    if isDone
        roundWord = "ROUNDS"
        if totalRounds = 1 then roundWord = "ROUND"
        m.doneSub.text = intStr(totalRounds) + " " + roundWord + " COMPLETOS"
        m.standaloneRunning = false
    end if

    maybePlayBell(seconds, totalTime, phase, running)
end sub

' Mesma detecção de transição do maybePlayBell() do receiverHtml.ts /
' canal com celular. Como a fase não muda ao pausar (só running/paused),
' pausar/retomar não dispara sino espúrio — só transições reais de fase.
sub maybePlayBell(seconds as Integer, totalTime as Integer, phase as String, running as Boolean)
    if m.prevState = invalid
        m.prevState = { seconds: seconds, totalTime: totalTime, phase: phase, running: running }
        return
    end if

    prev = m.prevState

    startedRound = (phase = "round" and running and seconds = totalTime) and not (prev.phase = "round" and prev.running and prev.seconds = prev.totalTime)
    enteredDone = (phase = "done" and prev.phase <> "done")
    warning = (phase = "round" and running and seconds = 10 and prev.seconds <> 10)
    roundEnded = (prev.phase = "round" and phase <> "round" and phase <> "done")

    if enteredDone or roundEnded
        playSound("pkg:/audio/bell_end.mp3")
    else if startedRound
        playSound("pkg:/audio/bell_start.wav")
    else if warning
        playSound("pkg:/audio/tick.wav")
    end if

    m.prevState = { seconds: seconds, totalTime: totalTime, phase: phase, running: running }
end sub

sub playSound(uri as String)
    content = CreateObject("roSGNode", "ContentNode")
    content.url = uri
    m.bellAudio.content = content
    m.bellAudio.control = "play"
end sub

function safeInt(value as Dynamic, fallback as Integer) as Integer
    if value = invalid then return fallback
    return CInt(value)
end function

function intStr(n as Integer) as String
    return Str(n).Trim()
end function

function pad(n as Integer) as String
    s = intStr(n)
    if Len(s) < 2 then s = "0" + s
    return s
end function

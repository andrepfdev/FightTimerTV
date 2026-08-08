' Cena principal: liga PollTask a /state, aplica o estado recebido na UI
' e decide quando tocar o sino — espelha applyState()/maybePlayBell()/
' poll() de src/receiver/receiverHtml.ts, adaptado pra SceneGraph.
'
' O teclado de IP:porta é gerenciado inteiramente aqui (ver comentário
' no MainScene.xml) com destaque manual de tecla, sem setFocus() nativo
' por tecla — só a cena em si recebe foco uma vez, no início.

sub init()
    m.background = m.top.findNode("background")
    m.logo = m.top.findNode("logo")
    m.roundIndicator = m.top.findNode("roundIndicator")
    m.bigTimer = m.top.findNode("bigTimer")
    m.progressFill = m.top.findNode("progressFill")
    m.offlineBanner = m.top.findNode("offlineBanner")
    m.doneOverlay = m.top.findNode("doneOverlay")
    m.doneSub = m.top.findNode("doneSub")
    m.pollTask = m.top.findNode("pollTask")
    m.bellAudio = m.top.findNode("bellAudio")

    ' Nós de Font customizados (size grande) renderizaram como quadrados
    ' vazios ("tofu") em teste real na Roku — confirmado visualmente pelo
    ' usuário. Voltamos pra fonte padrão do sistema (sem `font=`), que já
    ' provou renderizar texto normalmente. Ajustar tamanho fica pra depois,
    ' com mais cautela — funcionar é prioridade sobre o número gigante por
    ' ora.
    setupIpEntry()

    m.prevState = invalid
    m.failCount = 0

    m.pollTask.observeField("response", "onPollResponse")

    reg = CreateObject("roRegistrySection", "FightTimerTV")
    savedAddr = reg.Read("serverAddress")
    if savedAddr <> invalid and Len(savedAddr) > 0
        startPolling(savedAddr)
    else
        showIpEntry()
    end if

    ' setFocus() chamado durante a construção da cena (antes de
    ' roSGScreen.show() rodar) falha — confirmado em teste real. Esse
    ' timer adia a única tentativa de foco da cena pra depois dela já
    ' estar de fato na tela.
    m.initialFocusTimer = m.top.findNode("initialFocusTimer")
    m.initialFocusTimer.observeField("fire", "onInitialFocusTimer")
    m.initialFocusTimer.control = "start"
end sub

sub onInitialFocusTimer()
    m.top.setFocus(true)
end sub

sub startPolling(addr as String)
    m.serverAddress = addr
    m.failCount = 0
    m.prevState = invalid
    m.pollTask.control = "STOP"
    m.pollTask.uri = "http://" + addr + "/state"
    m.pollTask.control = "RUN"
    m.roundIndicator.text = "Aguardando o celular…"
end sub

' ═══════════════════ Teclado de IP:porta ═══════════════════

sub setupIpEntry()
    m.ipEntryGroup = m.top.findNode("ipEntryGroup")
    m.ipDisplay = m.top.findNode("ipDisplay")

    ' Ordem = ordem visual (esquerda->direita, cima->baixo); cima/baixo
    ' navegam por este array linearmente (sem precisar saber linha/coluna).
    labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", ":", "APAGAR", "CONFIRMAR"]
    m.ipKeys = []
    m.ipKeyBgs = []
    for i = 0 to labels.count() - 1
        node = m.top.findNode("key_" + i.toStr())
        m.ipKeys.push(node)
        m.ipKeyBgs.push(m.top.findNode("key_" + i.toStr() + "_bg"))
    end for

    m.ipKeyIndex = 0
    m.ipText = ""
end sub

sub showIpEntry()
    m.ipEntryVisible = true
    m.ipEntryGroup.visible = true
    m.ipKeyIndex = 0
    m.ipText = ""
    m.ipDisplay.text = ""
    highlightIpKey()
end sub

sub hideIpEntry()
    m.ipEntryVisible = false
    m.ipEntryGroup.visible = false
end sub

sub highlightIpKey()
    for i = 0 to m.ipKeyBgs.count() - 1
        if i = m.ipKeyIndex
            m.ipKeyBgs[i].color = "0xC8F400FF"
            m.ipKeys[i].color = "0x1A1A1AFF"
        else
            m.ipKeyBgs[i].color = "0x2A2A2AFF"
            m.ipKeys[i].color = "0xFFFFFFFF"
        end if
    end for
end sub

sub moveIpKey(delta as Integer)
    count = m.ipKeys.count()
    m.ipKeyIndex = (m.ipKeyIndex + delta + count) mod count
    highlightIpKey()
end sub

sub pressIpKey()
    label = m.ipKeys[m.ipKeyIndex].text
    if label = "APAGAR"
        if Len(m.ipText) > 0
            m.ipText = Left(m.ipText, Len(m.ipText) - 1)
        end if
    else if label = "CONFIRMAR"
        submitIpEntry()
        return
    else
        if Len(m.ipText) < 30 then m.ipText = m.ipText + label
    end if
    m.ipDisplay.text = m.ipText
end sub

sub submitIpEntry()
    if Len(m.ipText) = 0 then return
    reg = CreateObject("roRegistrySection", "FightTimerTV")
    reg.Write("serverAddress", m.ipText)
    reg.Flush()
    hideIpEntry()
    startPolling(m.ipText)
end sub

' Botão "*" (info) do controle reabre o teclado, pra trocar de celular
' sem precisar reinstalar o canal.
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if m.ipEntryVisible
        if key = "up"
            moveIpKey(-1)
            return true
        else if key = "down"
            moveIpKey(1)
            return true
        else if key = "left"
            moveIpKey(-1)
            return true
        else if key = "right"
            moveIpKey(1)
            return true
        else if key = "OK"
            pressIpKey()
            return true
        else if key = "back" and Len(m.ipText) > 0
            m.ipText = Left(m.ipText, Len(m.ipText) - 1)
            m.ipDisplay.text = m.ipText
            return true
        end if
        return false
    end if

    if key = "info" and not m.ipEntryVisible
        showIpEntry()
        return true
    end if
    return false
end function

sub onPollResponse()
    body = m.pollTask.response
    if body = invalid or body = "" then return

    if body = "__FAIL__"
        m.failCount = m.failCount + 1
        if m.failCount >= 3
            m.offlineBanner.visible = true
        end if
        return
    end if

    state = ParseJson(body)
    if state = invalid then return

    m.failCount = 0
    m.offlineBanner.visible = false
    applyState(state)
end sub

sub applyState(state as Object)
    seconds = safeInt(state.seconds, 0)
    totalTime = safeInt(state.totalTime, 0)
    currentRound = safeInt(state.currentRound, 1)
    totalRounds = safeInt(state.totalRounds, 1)
    phase = state.phase
    if phase = invalid then phase = "idle"
    running = state.running
    if running = invalid then running = false

    m.bigTimer.text = pad(Int(seconds / 60)) + ":" + pad(seconds mod 60)
    m.bigTimer.color = "0xC8F400FF"

    if phase = "idle"
        m.roundIndicator.text = "Aguardando início no celular"
        m.bigTimer.color = "0x666666FF"
    else if phase = "rest"
        m.roundIndicator.text = "INTERVALO - ROUND " + intStr(currentRound) + " / " + intStr(totalRounds)
        m.bigTimer.color = "0x666666FF"
    else if phase = "round"
        m.roundIndicator.text = "ROUND " + intStr(currentRound) + " / " + intStr(totalRounds)
        if seconds <= 10 then m.bigTimer.color = "0xFF4444FF"
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
    if isDone
        roundWord = "ROUNDS"
        if totalRounds = 1 then roundWord = "ROUND"
        m.doneSub.text = intStr(totalRounds) + " " + roundWord + " COMPLETOS"
    end if

    maybePlayBell(seconds, totalTime, phase, running)
end sub

' Mesma detecção de transição do maybePlayBell() de receiverHtml.ts:
' início de round toca o sino cheio, aviso aos 10s toca o tique curto,
' fim de round/treino toca o sino cheio de novo.
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
        playSound("pkg:/audio/bell.wav")
    else if startedRound
        playSound("pkg:/audio/bell.wav")
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

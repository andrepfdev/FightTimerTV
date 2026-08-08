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
    if savedAddr <> invalid and isValidAddress(savedAddr)
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
    print "[MainScene] startPolling addr="; addr
    m.serverAddress = addr
    m.failCount = 0
    m.prevState = invalid
    m.pollTask.control = "STOP"
    m.pollTask.uri = "http://" + addr + "/state"
    m.pollTask.control = "RUN"
    m.roundIndicator.text = "Aguardando o celular…"
end sub

' ═══════════════ Endereço do celular: 4 spinners + porta fixa 8080 ═══════════════
' Sem teclado nenhum: cima/baixo sobe/desce o valor do campo atual (0 a
' 255, com wrap), esquerda/direita troca de campo, OK confirma o
' endereço inteiro. Muito mais direto num controle de TV do que digitar
' caractere por caractere — e evita de vez bugs de digitação de "."/":"
' que apareceram nas versões anteriores. Porta sempre 8080 (fixa, igual
' ao SERVER_PORT do app RN), nunca editável.

sub setupIpEntry()
    m.ipEntryGroup = m.top.findNode("ipEntryGroup")
    m.octetLabels = [
        m.top.findNode("octet0"),
        m.top.findNode("octet1"),
        m.top.findNode("octet2"),
        m.top.findNode("octet3")
    ]

    ' Palpite de rede doméstica típica (192.168.0.x) — só o último
    ' número costuma precisar mudar de dispositivo pra dispositivo.
    m.octetIndex = 3
    m.octets = [192, 168, 0, 1]
    ' Precisa existir desde já: quando há endereço salvo, startPolling()
    ' roda direto no init() sem nunca passar por showIpEntry(), e sem
    ' isso m.ipEntryVisible fica Invalid — "not Invalid" quebra o app
    ' (confirmado em teste real: crash silencioso no primeiro poll com
    ' falha).
    m.ipEntryVisible = false
end sub

sub showIpEntry()
    m.ipEntryVisible = true
    m.ipEntryGroup.visible = true
    m.octetIndex = 3
    renderOctets()
end sub

sub hideIpEntry()
    m.ipEntryVisible = false
    m.ipEntryGroup.visible = false
end sub

' Campo ativo fica amarelo; os outros, branco — dá pra ver claramente
' qual campo cima/baixo vai alterar.
sub renderOctets()
    for i = 0 to 3
        m.octetLabels[i].text = intStr(m.octets[i])
        if i = m.octetIndex
            m.octetLabels[i].color = "0xC8F400FF"
        else
            m.octetLabels[i].color = "0xFFFFFFFF"
        end if
    end for
end sub

sub moveOctetField(delta as Integer)
    m.octetIndex = (m.octetIndex + delta + 4) mod 4
    renderOctets()
end sub

sub adjustOctetValue(delta as Integer)
    v = m.octets[m.octetIndex] + delta
    if v < 0 then v = 255
    if v > 255 then v = 0
    m.octets[m.octetIndex] = v
    renderOctets()
end sub

sub submitIpEntry()
    addr = intStr(m.octets[0]) + "." + intStr(m.octets[1]) + "." + intStr(m.octets[2]) + "." + intStr(m.octets[3]) + ":8080"
    reg = CreateObject("roRegistrySection", "FightTimerTV")
    reg.Write("serverAddress", addr)
    reg.Flush()
    hideIpEntry()
    startPolling(addr)
end sub

' Botão "*" (info) do controle reabre a configuração, pra trocar de
' celular sem precisar reinstalar o canal. Além disso, se ficar muitos
' polls seguidos falhando (endereço errado, celular fora do ar), reabre
' sozinho — o usuário não fica preso numa tela sem reação nenhuma.
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if m.ipEntryVisible
        if key = "up"
            adjustOctetValue(1)
            return true
        else if key = "down"
            adjustOctetValue(-1)
            return true
        else if key = "left"
            moveOctetField(-1)
            return true
        else if key = "right"
            moveOctetField(1)
            return true
        else if key = "OK"
            submitIpEntry()
            return true
        end if
        return false
    end if

    if key = "info"
        showIpEntry()
        return true
    end if
    return false
end function

sub onPollResponse()
    body = m.pollTask.response
    print "[MainScene] onPollResponse body="; body
    if body = invalid or body = "" then return

    if body = "__FAIL__"
        m.failCount = m.failCount + 1
        if m.failCount >= 3
            m.offlineBanner.visible = true
        end if
        ' ~15s de falhas seguidas (endereço errado/celular fora do ar):
        ' reabre a tela de configuração sozinho, em vez de deixar o
        ' usuário preso numa tela sem nenhuma reação.
        if m.failCount >= 15 and not m.ipEntryVisible
            showIpEntry()
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

' Confere se o endereço salvo no registro tem o formato
' "N.N.N.N:8080" antes de confiar nele — evita ficar preso repetindo
' pra sempre um valor corrompido de uma sessão anterior (aconteceu de
' verdade em teste: um endereço com ":" no lugar de "." travava o app
' sem nenhuma forma de sair, até esse crash ser corrigido).
function isValidAddress(addr as String) as Boolean
    parts = addr.Split(":")
    if parts.count() <> 2 then return false
    if parts[1] <> "8080" then return false
    octets = parts[0].Split(".")
    if octets.count() <> 4 then return false
    for each o in octets
        if Len(o) = 0 or Len(o) > 3 then return false
        for i = 0 to Len(o) - 1
            c = Mid(o, i + 1, 1)
            if c < "0" or c > "9" then return false
        end for
    end for
    return true
end function

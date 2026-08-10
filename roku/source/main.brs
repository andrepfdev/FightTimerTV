' Entry point do canal. Só sobe a tela SceneGraph e instancia a cena
' raiz (MainScene) — toda a lógica de UI/polling vive nos componentes.
' Entry point do canal. Só sobe a tela SceneGraph e instancia a cena
' raiz (MainScene) — toda a lógica de UI/polling vive nos componentes.
'
' TENTATIVAS DE SUPRIMIR O PROTETOR DE TELA — AMBAS FALHARAM EM
' HARDWARE REAL, NÃO REINTRODUZIR (confirmado via console de debug +
' documentação oficial atual da Roku, não chute):
'   1. `CreateObject("roAppManager").EnableScreenSaver(false)` dentro do
'      init() da Scene — `roAppManager` é "MAIN|TASK-only" (não pode ser
'      criado na RENDER thread onde o init() de uma Scene roda) E esse
'      método não existe na interface. As duas coisas juntas crasham o
'      app com tela preta.
'   2. `appMan.UpdateLastKeyPressTime()` chamado daqui (thread
'      principal, o que resolveria o problema de thread) — mas esse
'      método foi **descontinuado pela Roku** (Roku OS 12+, "uso não é
'      mais permitido") e não existe mais no SDK atual. Confirmado
'      contra a lista literal e completa de métodos de `ifAppManager`
'      na documentação oficial: não há NENHUM método relacionado a
'      screensaver além de `GetScreensaverTimeout()` (só leitura).
'
' Conclusão: não existe hoje uma API BrightScript suportada pra um
' canal comum impedir o protetor de tela do sistema. O ajuste real tem
' que ser feito pelo usuário nas Configurações da própria Roku
' (Sistema → Protetor de tela → aumentar o tempo ou desativar) — ver
' CLAUDE.md.
sub Main()
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)
    scene = screen.CreateScene("MainScene")
    screen.show()

    while true
        msg = wait(0, port)
        msgType = type(msg)
        if msgType = "roSGScreenEvent"
            if msg.isScreenClosed()
                return
            end if
        end if
    end while
end sub

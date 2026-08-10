' Entry point do canal standalone (sem celular). Só sobe a tela SceneGraph
' e instancia a cena raiz (MainScene) — toda a lógica de setup/timer vive
' nos componentes.
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

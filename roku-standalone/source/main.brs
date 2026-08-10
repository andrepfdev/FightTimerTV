' Entry point do canal standalone (sem celular). Só sobe a tela SceneGraph
' e instancia a cena raiz (MainScene) — toda a lógica de setup/timer vive
' nos componentes.
' Entry point do canal standalone (sem celular). Só sobe a tela
' SceneGraph e instancia a cena raiz (MainScene) — toda a lógica de
' setup/timer vive nos componentes.
'
' Ver o comentário completo em roku/source/main.brs: tentamos suprimir
' o protetor de tela via `roAppManager` (duas formas diferentes) e as
' duas falharam em hardware real — uma por problema de thread, a outra
' porque o método foi descontinuado pela Roku. Não existe hoje API
' suportada pra isso; o ajuste tem que ser feito nas Configurações da
' própria Roku (ver CLAUDE.md). Não reintroduzir essas chamadas aqui.
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

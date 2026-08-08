' Poller de /state — espelha o `poll()` de src/receiver/receiverHtml.ts,
' só que aqui é um loop bloqueante dentro da thread própria da Task (o
' que é seguro: só essa thread fica esperando a rede, a UI não trava).

sub init()
    m.top.functionName = "pollLoop"
end sub

sub pollLoop()
    POLL_MS = 300

    while true
        if m.top.control = "STOP"
            return
        end if

        uri = m.top.uri
        if uri <> ""
            xfer = CreateObject("roUrlTransfer")
            xfer.SetUrl(uri)
            xfer.SetHttpVersion("1.1")
            xfer.EnableEncodings(true)
            xfer.SetRequest("GET")
            ' GetToString() é bloqueante, mas isso é seguro aqui: essa é
            ' a thread própria da Task, a UI (thread de render) não é
            ' afetada por essa espera.
            body = xfer.GetToString()

            if body <> invalid and Len(body) > 0
                m.top.response = body
            else
                m.top.response = "__FAIL__"
            end if
        end if

        sleep(POLL_MS)
    end while
end sub

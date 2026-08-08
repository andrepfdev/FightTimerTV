' Poller de /state — espelha o `poll()` de src/receiver/receiverHtml.ts,
' só que aqui é um loop bloqueante dentro da thread própria da Task (o
' que é seguro: só essa thread fica esperando a rede, a UI não trava).

sub init()
    m.top.functionName = "pollLoop"
end sub

sub pollLoop()
    print "[PollTask] pollLoop start, uri="; m.top.uri
    POLL_MS = 300
    n = 0

    while true
        if m.top.control = "STOP"
            print "[PollTask] STOP recebido, saindo"
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

            if n mod 10 = 0
                print "[PollTask] poll #"; n; " uri=["; uri; "] body="; body
            end if
            n = n + 1

            if body <> invalid and Len(body) > 0
                m.top.response = body
            else
                m.top.response = "__FAIL__"
            end if
        end if

        sleep(POLL_MS)
    end while
end sub

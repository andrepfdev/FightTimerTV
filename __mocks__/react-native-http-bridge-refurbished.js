// Mock manual: o módulo real fala com NativeModules.HttpServer, que não
// existe no ambiente Jest (sem binário nativo rodando). Os testes deste
// projeto exercitam a lógica de TimerServer (state em memória), não o
// transporte HTTP de verdade — ver src/server/timerServer.test.ts.
class BridgeServer {
  constructor(serviceName) {
    if (!serviceName) {
      throw new Error('Invalid service name');
    }
    this.callbacks = [];
  }
  get(url, callback) {
    this.callbacks.push({ method: 'GET', url, callback });
  }
  post() {}
  put() {}
  delete() {}
  patch() {}
  use() {}
  listen(port) {
    if (port < 0 || port > 65535) {
      throw new Error('Invalid port number');
    }
  }
  stop() {}
}

module.exports = { BridgeServer };

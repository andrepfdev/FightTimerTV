// Mock manual do módulo nativo para os testes: TurboModuleRegistry não tem
// nada registrado no ambiente Jest (não há binário nativo rodando), então
// o import real (index.native.js) quebra a suíte inteira. useKeepAwake não
// tem efeito colateral relevante para os testes de lógica deste projeto.
module.exports = {
  useKeepAwake: () => {},
  activateKeepAwake: () => {},
  deactivateKeepAwake: () => {},
  default: () => null,
};

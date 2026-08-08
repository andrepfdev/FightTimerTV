module.exports = {
  preset: '@react-native/jest-preset',
  // Pacotes RN publicados como ESM puro (sem build CJS) precisam ser
  // transformados pelo Babel do Jest em vez de ficarem na exclusão padrão
  // de node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@sayem314/react-native-keep-awake|react-native-network-info|react-native-qrcode-svg|react-native-svg|react-native-http-bridge-refurbished)/)',
  ],
};

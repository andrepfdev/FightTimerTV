/**
 * Fight Timer TV
 * Cronômetro que transmite o tempo para uma Smart TV via HTTP local
 * (sem login, sem persistência — tudo em memória).
 *
 * @format
 */

import { Platform, StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TimerScreen from './src/screens/TimerScreen';
import TVTimerScreen from './src/screens/TVTimerScreen';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  // Platform.isTV é resolvido em runtime pelo próprio Android (UiModeManager
  // reportando UI_MODE_TYPE_TELEVISION) — mesmo APK funciona como app de
  // celular (servidor HTTP + QR code) ou como timer standalone controlado
  // pelo controle remoto quando aberto direto numa Android TV/Google TV/
  // Fire TV, sem precisar de build separado nem flavor.
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        {Platform.isTV ? <TVTimerScreen /> : <TimerScreen />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;

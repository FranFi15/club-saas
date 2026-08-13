import React, { useContext } from 'react';
import { StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import AdminScreenHeader from '../../components/AdminScreenHeader';
import RequestDocComposer from '../../components/RequestDocComposer';

export default function AdminRequestDocScreen({ navigation }) {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <AdminScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Documentación"
        title="Pedir documentación"
        subtitle="Se envía por chat (grupal o personal) y queda en Documentación"
        onBack={() => navigation.goBack()}
      />

      <RequestDocComposer
        variant="admin"
        theme={theme}
        colorMarca={colorMarca}
        clubData={clubData}
        onSuccess={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});

import React, { useContext } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubContext } from '../../context/ClubContext';
import { ThemeContext } from '../../context/ThemeContext';
import CoachScreenHeader from '../../components/CoachScreenHeader';
import ProfileHeaderCredits from '../../components/ProfileHeaderCredits';
import ProfileLoyaltySection from '../../components/ProfileLoyaltySection';

export default function SocioCanjesBeneficiosScreen() {
  const { clubData } = useContext(ClubContext);
  const { theme, isDarkMode } = useContext(ThemeContext);
  const colorMarca = clubData?.primaryColor || '#3b82f6';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <CoachScreenHeader
        colorMarca={colorMarca}
        theme={theme}
        kicker="Socio"
        title="Beneficios"
        subtitle="Canjes y beneficios del club"
        showNotifications={false}
        footer={<ProfileHeaderCredits clubData={clubData} />}
      />
      <View style={styles.body}>
        <ProfileLoyaltySection
          clubData={clubData}
          theme={theme}
          colorMarca={colorMarca}
          asScreen
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
});

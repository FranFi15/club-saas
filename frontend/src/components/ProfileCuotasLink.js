import React from 'react';
import { View } from 'react-native';
import ProfileLinkRow from './ProfileLinkRow';
import { profileCardStyles } from './ProfileInfoRow';
import { useMemberOptional } from '../context/MemberContext';

/**
 * Cuotas entry for any profile shell when the account can pay
 * (socio / atleta cuotas / tutor family) — avoids switching roles.
 */
export default function ProfileCuotasLink({ navigation, theme, routeName = 'MemberPayments', badge }) {
  const member = useMemberOptional();
  if (!member?.showCuotasEntry) return null;

  const subtitle = member.isTutor
    ? 'Tu cuota social y las de tus atletas'
    : member.isSocio
      ? 'Pagá tu cuota social'
      : 'Pagá tus cuotas';

  return (
    <View style={[profileCardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ProfileLinkRow
        icon="card-outline"
        title="Cuotas"
        subtitle={subtitle}
        onPress={() => navigation.navigate(routeName)}
        theme={theme}
        badge={badge}
        isLast
      />
    </View>
  );
}

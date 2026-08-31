import React, { useContext } from 'react';
import { ClubContext } from './ClubContext';
import { MemberProvider } from './MemberContext';

const MEMBER_MODES = ['atleta', 'tutor', 'socio'];

/** Siempre envuelve con MemberProvider para no remontar AppNavigator al activar el rol cliente. */
export default function MemberRoot({ children }) {
  const { memberSessionRol } = useContext(ClubContext);
  const mode = MEMBER_MODES.includes(memberSessionRol) ? memberSessionRol : null;

  return <MemberProvider mode={mode}>{children}</MemberProvider>;
}
